// platform-sync.js — Studio Araci FF&E · Integração com a plataforma
//
// Envia produtos capturados para o catálogo da plataforma (apps/api do
// repo AraciPlataform) E os vincula ao projeto/ambiente escolhido pelo
// usuário, autenticando com uma chave de API gerada em /team (ver
// apps/api/src/erp/users.controller.ts). Isso fecha a opção 1 descrita em
// docs/fase-0/especificacao-tecnica.md: a extração já validada aqui passa
// a alimentar a plataforma em vez de (ou além de) ficar só no Chrome
// Storage. Enviar só para o catálogo geral (POST /v1/products, sem
// vínculo) não bastava -- o item nunca aparecia no projeto que o usuário
// estava de fato orçando; ver sendProductsToPlatform.
//
// Carregado antes de options.js e de library.js (ver <script> nas duas
// páginas) — funções globais de propósito, mesmo padrão de categories.js
// nesta extensão (sem bundler, sem módulos ES).
//
// Só os campos que existem no catálogo da plataforma são enviados: sku,
// category, unit, ambiente e obs são conceitos do orçamento desta
// extensão, sem equivalente em Product/ProductSpecification hoje (qty
// SIM é enviado, mas como ProductSpecification.quantity, não em Product).

const PLATFORM_SETTINGS_KEYS = ['platformApiUrl', 'platformApiKey'];

async function getPlatformSettings() {
  const data = await chrome.storage.local.get(PLATFORM_SETTINGS_KEYS);
  return {
    apiUrl: (data.platformApiUrl || '').trim().replace(/\/+$/, ''), // sem barra final
    apiKey: (data.platformApiKey || '').trim()
  };
}

async function savePlatformSettings(apiUrl, apiKey) {
  await chrome.storage.local.set({
    platformApiUrl: apiUrl.trim().replace(/\/+$/, ''),
    platformApiKey: apiKey.trim()
  });
}

function isHttpUrl(raw) {
  if (typeof raw !== 'string' || !raw) return false;
  try {
    const u = new URL(raw);
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
}

// Preço 0 não é enviado: nesta extensão, price:0 quase sempre significa
// "ainda não preenchido", não "produto grátis" — mandar 0 criaria um
// Product com preço definido (e não um placeholder genérico) que o resto
// da plataforma trataria como um preço real.
function toPlatformProduct(p) {
  const name = (p?.name || '').trim();
  if (!name) return null;

  const product = { name, isGeneric: false };
  if (p.brand) product.supplier = String(p.brand).trim();
  if (typeof p.price === 'number' && p.price > 0) product.price = p.price;
  if (p.dims) product.dimensions = String(p.dims).trim();
  if (isHttpUrl(p.img)) product.imageUrl = p.img;
  if (isHttpUrl(p.url)) product.sourceUrl = p.url;

  return product;
}

async function platformFetch(path, apiUrl, apiKey, init = {}) {
  return fetch(`${apiUrl}${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', 'X-Api-Key': apiKey, ...(init.headers || {}) }
  });
}

// Lista os projetos da conta -- usado para o seletor "Projeto" antes de
// enviar. [] em vez de lançar erro em qualquer falha (URL/chave ainda não
// configuradas, rede fora, etc.): quem chama já sabe tratar lista vazia
// (mostra "configure a integração" ou "nenhum projeto"), não precisa de
// um segundo caminho de erro só pra isso.
async function fetchPlatformProjects() {
  const { apiUrl, apiKey } = await getPlatformSettings();
  if (!apiUrl || !apiKey) return [];
  try {
    const res = await platformFetch('/v1/projects', apiUrl, apiKey);
    if (!res.ok) return [];
    const body = await res.json();
    return body.data || [];
  } catch {
    return [];
  }
}

async function fetchPlatformAreas(projectId) {
  const { apiUrl, apiKey } = await getPlatformSettings();
  if (!apiUrl || !apiKey || !projectId) return [];
  try {
    const res = await platformFetch(`/v1/projects/${projectId}/areas`, apiUrl, apiKey);
    if (!res.ok) return [];
    const body = await res.json();
    return body.data || [];
  } catch {
    return [];
  }
}

// Diferente das duas acima, esta lança em erro -- criar um ambiente é uma
// ação explícita do usuário (escreveu um nome, clicou "Criar"), então a
// tela chamadora precisa saber que falhou para avisar, não só ver uma
// lista vazia sem explicação.
async function createPlatformArea(projectId, name) {
  const { apiUrl, apiKey } = await getPlatformSettings();
  if (!apiUrl || !apiKey) throw new Error('Configure a URL e a chave de API antes de criar um ambiente.');
  const res = await platformFetch(`/v1/projects/${projectId}/areas`, apiUrl, apiKey, {
    method: 'POST',
    body: JSON.stringify({ name })
  });
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new Error(body?.error?.message || `Não foi possível criar o ambiente (HTTP ${res.status}).`);
  }
  const body = await res.json();
  return body.data;
}

// Envia um produto por vez (a API não tem endpoint de criação em lote) e
// segue mesmo se algum item falhar, para que um erro isolado (ex.: nome
// vazio) não trave o resto do orçamento. `configured: false` distingue
// "faltou configurar URL/chave" de "configurado, mas tudo falhou" — os
// dois têm 0 enviados, mas pedem mensagens diferentes para quem chama.
//
// areaId é obrigatório: sem ele, o produto entrava só no catálogo geral
// da conta e nunca aparecia no projeto que o usuário estava de fato
// orçando (POST /v1/products sozinho não vincula a nada). Cada produto
// vira, agora, DOIS passos -- upsert no catálogo (POST /v1/products,
// que já deduplica por sourceUrl do lado da API) seguido de criar OU
// atualizar a linha do carrinho no ambiente escolhido.
//
// A escolha entre criar e atualizar a especificação é feita AQUI, não no
// lado da API: a API não deduplica ProductSpecification de propósito --
// a própria plataforma já usa duas linhas do mesmo produto na mesma área
// para representar rodadas de aprovação diferentes (ver
// SpecificationsService), um caso de uso real que uma deduplicação no
// servidor quebraria. Reenviar o MESMO orçamento da extensão pro MESMO
// ambiente é um caso mais estreito -- é literalmente a mesma linha sendo
// atualizada -- então a extensão busca a especificação existente (por
// productId dentro da área) antes de decidir POST (nova linha) ou PATCH
// (atualiza quantidade/preço da linha já enviada antes).
async function sendProductsToPlatform(products, areaId) {
  const { apiUrl, apiKey } = await getPlatformSettings();
  if (!apiUrl || !apiKey) {
    return { configured: false, sent: 0, failed: 0, errors: [] };
  }
  if (!areaId) {
    return { configured: true, sent: 0, failed: 0, errors: ['Selecione o projeto e o ambiente antes de enviar.'] };
  }

  const existingSpecsRes = await platformFetch(`/v1/areas/${areaId}/specifications`, apiUrl, apiKey);
  const existingSpecs = existingSpecsRes.ok ? (await existingSpecsRes.json()).data || [] : [];
  const specIdByProductId = new Map(existingSpecs.map((s) => [s.productId, s.id]));

  let sent = 0;
  const errors = [];

  for (const raw of products) {
    const product = toPlatformProduct(raw);
    if (!product) {
      errors.push(`"${raw?.name || '(sem nome)'}": nome vazio`);
      continue;
    }
    try {
      const productRes = await platformFetch('/v1/products', apiUrl, apiKey, {
        method: 'POST',
        body: JSON.stringify(product)
      });
      if (!productRes.ok) {
        const body = await productRes.json().catch(() => null);
        errors.push(`"${product.name}": ${body?.error?.message || `HTTP ${productRes.status}`}`);
        continue;
      }
      const productBody = await productRes.json();
      const productId = productBody.data.id;

      const specData = {
        quantity: Math.max(1, Math.floor(Number(raw.qty) || 1)),
        ...(product.price ? { unitPrice: product.price } : {})
      };
      const existingSpecId = specIdByProductId.get(productId);
      const specRes = existingSpecId
        ? await platformFetch(`/v1/specifications/${existingSpecId}`, apiUrl, apiKey, {
            method: 'PATCH',
            body: JSON.stringify(specData)
          })
        : await platformFetch(`/v1/areas/${areaId}/specifications`, apiUrl, apiKey, {
            method: 'POST',
            body: JSON.stringify({ productId, ...specData })
          });
      if (!specRes.ok) {
        const body = await specRes.json().catch(() => null);
        // O produto já existe no catálogo neste ponto (passo anterior deu certo) --
        // só a linha do carrinho no ambiente que falhou. Vale dizer isso
        // explicitamente, senão "falhou" sugere que nada aconteceu, quando na
        // verdade ficou parcial.
        const acao = existingSpecId ? 'atualizado no catálogo, mas não foi possível atualizar a linha do ambiente' : 'criado no catálogo, mas não vinculado ao ambiente';
        errors.push(`"${product.name}": ${acao} (${body?.error?.message || `HTTP ${specRes.status}`})`);
        continue;
      }

      sent++;
    } catch (e) {
      errors.push(`"${product.name}": erro de rede (${e?.message || e})`);
    }
  }

  return { configured: true, sent, failed: errors.length, errors };
}
