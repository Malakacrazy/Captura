// platform-sync.js — Studio Araci FF&E · Integração com a plataforma
//
// Envia produtos capturados para POST /v1/products na API da plataforma
// (apps/api do repo AraciPlataform), autenticando com uma chave de API
// gerada em /team (ver apps/api/src/erp/users.controller.ts). Isso fecha
// a opção 1 descrita em docs/fase-0/especificacao-tecnica.md: a extração
// já validada aqui passa a alimentar o catálogo da plataforma em vez de
// (ou além de) ficar só no Chrome Storage.
//
// Carregado antes de options.js e de library.js (ver <script> nas duas
// páginas) — funções globais de propósito, mesmo padrão de categories.js
// nesta extensão (sem bundler, sem módulos ES).
//
// Só os campos que existem no catálogo da plataforma são enviados: sku,
// qty, category, unit, ambiente e obs são conceitos do orçamento desta
// extensão, sem equivalente em Product hoje.

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

// Envia um produto por vez (a API não tem endpoint de criação em lote) e
// segue mesmo se algum item falhar, para que um erro isolado (ex.: nome
// vazio) não trave o resto do orçamento. `configured: false` distingue
// "faltou configurar URL/chave" de "configurado, mas tudo falhou" — os
// dois têm 0 enviados, mas pedem mensagens diferentes para quem chama.
async function sendProductsToPlatform(products) {
  const { apiUrl, apiKey } = await getPlatformSettings();
  if (!apiUrl || !apiKey) {
    return { configured: false, sent: 0, failed: 0, errors: [] };
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
      const res = await fetch(`${apiUrl}/v1/products`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Api-Key': apiKey },
        body: JSON.stringify(product)
      });
      if (res.ok) {
        sent++;
      } else {
        const body = await res.json().catch(() => null);
        errors.push(`"${product.name}": ${body?.error?.message || `HTTP ${res.status}`}`);
      }
    } catch (e) {
      errors.push(`"${product.name}": erro de rede (${e?.message || e})`);
    }
  }

  return { configured: true, sent, failed: errors.length, errors };
}
