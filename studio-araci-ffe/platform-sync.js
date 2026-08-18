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
// enviar. Lança em erro em vez de devolver [] silenciosamente: uma lista
// vazia por "não configurado", "chave errada/expirada", "API fora do ar"
// e "conta genuinamente sem projetos" são situações completamente
// diferentes, e engolir a diferença foi o que tornou "não aparece nenhum
// projeto" impossível de diagnosticar da tela -- quem chama decide como
// mostrar o erro, mas precisa recebê-lo.
async function fetchPlatformProjects() {
  const { apiUrl, apiKey } = await getPlatformSettings();
  if (!apiUrl || !apiKey) {
    throw new Error('Configure a URL e a chave de API em ⚙ Configurações antes de escolher um projeto.');
  }
  let res;
  try {
    res = await platformFetch('/v1/projects', apiUrl, apiKey);
  } catch (e) {
    throw new Error(`Não foi possível conectar em ${apiUrl} (${e?.message || e}). A API está no ar e acessível deste navegador?`);
  }
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new Error(body?.error?.message || `A plataforma respondeu com erro ao listar projetos (HTTP ${res.status}).`);
  }
  const body = await res.json();
  return body.data || [];
}

async function fetchPlatformAreas(projectId) {
  const { apiUrl, apiKey } = await getPlatformSettings();
  if (!apiUrl || !apiKey || !projectId) return [];
  let res;
  try {
    res = await platformFetch(`/v1/projects/${projectId}/areas`, apiUrl, apiKey);
  } catch (e) {
    throw new Error(`Não foi possível conectar em ${apiUrl} (${e?.message || e}).`);
  }
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new Error(body?.error?.message || `A plataforma respondeu com erro ao listar ambientes (HTTP ${res.status}).`);
  }
  const body = await res.json();
  return body.data || [];
}

// Cria um ambiente na API e devolve o registro criado. Lança em erro (ao
// contrário das duas funções acima): quem chama precisa saber se a
// criação falhou pra não seguir usando um id inexistente.
async function createPlatformArea(projectId, name, apiUrl, apiKey) {
  const res = await platformFetch(`/v1/projects/${projectId}/areas`, apiUrl, apiKey, {
    method: 'POST',
    body: JSON.stringify({ name })
  });
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new Error(body?.error?.message || `Não foi possível criar o ambiente "${name}" (HTTP ${res.status}).`);
  }
  const body = await res.json();
  return body.data;
}

const AMBIENTE_PADRAO_SEM_TAG = 'Geral'; // bucket para produtos sem nenhum ambiente marcado

// Envia um produto por vez (a API não tem endpoint de criação em lote) e
// segue mesmo se algum item falhar, para que um erro isolado (ex.: nome
// vazio) não trave o resto do orçamento. `configured: false` distingue
// "faltou configurar URL/chave" de "configurado, mas tudo falhou" — os
// dois têm 0 enviados, mas pedem mensagens diferentes para quem chama.
//
// Recebe projectId, NÃO areaId: os ambientes vêm do PRÓPRIO orçamento da
// extensão (o campo "Ambiente" que o usuário já preenche por produto,
// ver library-items.js), não de uma lista escolhida à mão na hora de
// enviar -- a extensão já sabe pra qual cômodo cada item é, então é ela
// quem deveria mandar essa informação pra plataforma, não o contrário
// (a versão anterior pedia pro usuário escolher um ambiente já cadastrado
// na plataforma antes de mandar, ignorando o que ele já tinha digitado
// aqui). Produto sem nenhum ambiente marcado cai no bucket "Geral". Um
// produto com múltiplos ambientes (`ambiente: ["Cozinha", "Lavanderia"]`)
// gera uma ProductSpecification em CADA área correspondente, com a mesma
// quantidade em cada uma -- a extensão não guarda quantidade por
// ambiente, só por produto, então replicar a quantidade total em cada
// área é o que já é mostrado na própria linha do orçamento.
//
// Ambientes são resolvidos por NOME dentro do projeto escolhido: se já
// existe uma área com aquele nome (comparação sem diferenciar
// maiúsc./minúsc. e espaços nas pontas — o autocompletar de ambiente já
// empurra pra nomes consistentes, mas não garante), reaproveita; senão
// cria uma nova. A lista de áreas do projeto é buscada uma vez só no
// início, não uma vez por produto.
//
// A escolha entre criar e atualizar uma ProductSpecification é feita
// AQUI, não no lado da API: a API não deduplica ProductSpecification de
// propósito -- a própria plataforma já usa duas linhas do mesmo produto
// na mesma área para representar rodadas de aprovação diferentes (ver
// SpecificationsService), um caso de uso real que uma deduplicação no
// servidor quebraria. Reenviar o MESMO orçamento da extensão pro MESMO
// ambiente é um caso mais estreito -- é literalmente a mesma linha sendo
// atualizada -- então a extensão busca a especificação existente (por
// productId dentro de cada área) antes de decidir POST (nova linha) ou
// PATCH (atualiza quantidade/preço da linha já enviada antes).
async function sendProductsToPlatform(products, projectId) {
  const { apiUrl, apiKey } = await getPlatformSettings();
  if (!apiUrl || !apiKey) {
    return { configured: false, sent: 0, failed: 0, errors: [], areasCreated: [] };
  }
  if (!projectId) {
    // failed precisa bater com errors.length aqui -- quem chama decide
    // "sucesso" vs. "erro" olhando failed === 0, e com failed:0 essa
    // mensagem virava "✓ 0 produto(s) enviado(s) com sucesso", escondendo
    // o motivo real por trás de uma marca de sucesso.
    return { configured: true, sent: 0, failed: 1, errors: ['Selecione o projeto antes de enviar.'], areasCreated: [] };
  }

  // areasByName: nome normalizado (trim + minúsculo) → { id, name, specsByProductId }.
  // specsByProductId é carregado sob demanda (só quando a área é de fato
  // usada), não pra todas as áreas do projeto de uma vez.
  const existingAreas = await fetchPlatformAreas(projectId).catch(() => []);
  const areasByName = new Map(existingAreas.map((a) => [a.name.trim().toLowerCase(), { id: a.id, name: a.name, specsByProductId: null }]));
  const areasCreated = [];

  async function resolveArea(name) {
    const key = name.trim().toLowerCase();
    let area = areasByName.get(key);
    if (!area) {
      const created = await createPlatformArea(projectId, name, apiUrl, apiKey);
      area = { id: created.id, name: created.name, specsByProductId: null };
      areasByName.set(key, area);
      areasCreated.push(created.name);
    }
    if (!area.specsByProductId) {
      const specsRes = await platformFetch(`/v1/areas/${area.id}/specifications`, apiUrl, apiKey);
      const specs = specsRes.ok ? (await specsRes.json()).data || [] : [];
      area.specsByProductId = new Map(specs.map((s) => [s.productId, s.id]));
    }
    return area;
  }

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

      const ambientes = Array.isArray(raw.ambiente) && raw.ambiente.length > 0
        ? raw.ambiente.filter((a) => typeof a === 'string' && a.trim())
        : [AMBIENTE_PADRAO_SEM_TAG];

      const specData = {
        quantity: Math.max(1, Math.floor(Number(raw.qty) || 1)),
        ...(product.price ? { unitPrice: product.price } : {})
      };

      let placedInAtLeastOneArea = false;
      for (const ambienteName of ambientes) {
        let area;
        try {
          area = await resolveArea(ambienteName);
        } catch (e) {
          errors.push(`"${product.name}" → "${ambienteName}": ${e.message}`);
          continue;
        }

        const existingSpecId = area.specsByProductId.get(productId);
        const specRes = existingSpecId
          ? await platformFetch(`/v1/specifications/${existingSpecId}`, apiUrl, apiKey, {
              method: 'PATCH',
              body: JSON.stringify(specData)
            })
          : await platformFetch(`/v1/areas/${area.id}/specifications`, apiUrl, apiKey, {
              method: 'POST',
              body: JSON.stringify({ productId, ...specData })
            });
        if (!specRes.ok) {
          const body = await specRes.json().catch(() => null);
          errors.push(`"${product.name}" → "${area.name}": ${body?.error?.message || `HTTP ${specRes.status}`}`);
          continue;
        }
        placedInAtLeastOneArea = true;
      }

      // O produto já existe no catálogo neste ponto mesmo se todo o resto
      // falhar (o POST /v1/products acima deu certo) -- só não entrou em
      // nenhum ambiente. sent conta "chegou a algum lugar no projeto",
      // não "chegou ao catálogo", que é o que de fato importa pro
      // usuário conferir depois na tela de FF&E do projeto.
      if (placedInAtLeastOneArea) sent++;
    } catch (e) {
      errors.push(`"${product.name}": erro de rede (${e?.message || e})`);
    }
  }

  return { configured: true, sent, failed: errors.length, errors, areasCreated };
}
