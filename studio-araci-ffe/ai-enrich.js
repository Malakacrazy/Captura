// ai-enrich.js — Studio Araci FF&E · Enriquecimento de produtos via Gemini
//
// Núcleo de acesso à API do Gemini (Google AI Studio): guarda a chave de
// API, monta o prompt em lote e compara a sugestão da IA com o produto
// atual campo a campo. Quem decide o que fazer com o resultado (mostrar
// diffs, aceitar/descartar) é library-ai-enrich.js — este arquivo só sabe
// conversar com a API e comparar dados, por isso pode ser carregado tanto
// em options.html (só a chave) quanto em library.html (chave + uso real).
// Mesmo padrão de platform-sync.js nesta extensão: funções globais, sem
// bundler nem módulos ES.

const AI_SETTINGS_KEYS = ['geminiApiKey', 'geminiModel'];
const AI_DEFAULT_MODEL = 'gemini-2.5-flash';

async function getAiSettings() {
  const data = await chrome.storage.local.get(AI_SETTINGS_KEYS);
  return {
    apiKey: (data.geminiApiKey || '').trim(),
    model: (data.geminiModel || '').trim() || AI_DEFAULT_MODEL
  };
}

async function saveAiSettings(apiKey, model) {
  await chrome.storage.local.set({
    geminiApiKey: apiKey.trim(),
    geminiModel: (model || '').trim() || AI_DEFAULT_MODEL
  });
}

// Campos que a IA pode sugerir correção/complemento. "category" precisa
// bater com um dos ids de STUDIO_ARACI_CATEGORIES (categories.js) -- um
// valor fora da lista é descartado (mantém o original) em vez de gravar uma
// categoria inexistente, que quebraria o agrupamento do PDF/Excel.
const AI_BATCH_SIZE = 6; // produtos por chamada -- lote grande demais aumenta o risco do modelo truncar o JSON

function aiProductPayload(p) {
  return {
    id: p.id,
    nome_atual: p.name || '',
    marca_atual: p.brand || '',
    sku_atual: p.sku || '',
    dimensoes_atuais: p.dims || '',
    preco_atual: p.price || 0,
    categoria_atual: p.category || '',
    observacoes_atuais: p.obs || '',
    url_origem: p.url || ''
  };
}

function buildAiPrompt(batch) {
  const categorias = (typeof STUDIO_ARACI_CATEGORIES !== 'undefined' ? STUDIO_ARACI_CATEGORIES : [])
    .map(c => `"${c.id}" (${c.label})`).join(', ');

  return `Você é um assistente de pesquisa para um escritório de arquitetura de interiores especificando produtos de FF&E (revestimentos, louças, metais, iluminação, eletros, móveis, decoração).

Para cada produto da lista JSON abaixo, use a busca do Google para localizar a página do produto (o campo "url_origem", quando presente, é a melhor pista; senão busque por nome/marca/sku) e confira/complete os dados.

Categorias válidas para o campo "categoria": ${categorias}.

Para CADA produto da lista, devolva um objeto com exatamente estas chaves:
- "id": o mesmo id recebido
- "nome": nome completo e correto do produto (marca + modelo/linha, sem termos de marketing)
- "marca": fabricante
- "sku": código/referência do fabricante, se encontrar
- "dimensoes": dimensões físicas (ex: "60x60cm", "1,20 x 0,80 x 0,75m")
- "preco": preço atual em reais encontrado na página de origem, só número (sem "R$", sem separador de milhar)
- "categoria": um dos ids válidos listados acima
- "observacoes": informação útil para a especificação (material, cor, voltagem, garantia) em até 1 frase curta
- "confianca": "alta", "media" ou "baixa"

Regras importantes:
- Quando não tiver certeza ou não encontrar nada melhor que o valor atual, repita exatamente o "*_atual" recebido para aquele campo -- nunca invente um valor.
- Responda APENAS com um array JSON válido contendo um objeto por produto recebido, na mesma ordem, sem texto antes ou depois, sem markdown.

Produtos:
${JSON.stringify(batch.map(aiProductPayload))}`;
}

function parseAiJsonArray(text) {
  const cleaned = String(text || '').trim()
    .replace(/^```(?:json)?/i, '')
    .replace(/```$/, '')
    .trim();
  const start = cleaned.indexOf('[');
  const end = cleaned.lastIndexOf(']');
  if (start === -1 || end === -1) {
    throw new Error('A IA não devolveu uma lista reconhecível. Tente novamente.');
  }
  let parsed;
  try {
    parsed = JSON.parse(cleaned.slice(start, end + 1));
  } catch {
    throw new Error('A IA devolveu um JSON inválido. Tente novamente.');
  }
  if (!Array.isArray(parsed)) throw new Error('Resposta da IA em formato inesperado.');
  return parsed;
}

async function callGeminiBatch(batch, apiKey, model) {
  const prompt = buildAiPrompt(batch);
  let res;
  try {
    res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          tools: [{ google_search: {} }],
          generationConfig: { temperature: 0.1 }
        })
      }
    );
  } catch (e) {
    throw new Error(`Não foi possível conectar à API do Gemini (${e?.message || e}).`);
  }
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new Error(body?.error?.message || `A API do Gemini respondeu com erro (HTTP ${res.status}).`);
  }
  const body = await res.json();
  if (body?.promptFeedback?.blockReason) {
    throw new Error(`A IA bloqueou a resposta (${body.promptFeedback.blockReason}).`);
  }
  const text = (body?.candidates?.[0]?.content?.parts || []).map(p => p.text || '').join('');
  return parseAiJsonArray(text);
}

// Compara o produto atual (p) com a sugestão da IA (s, já no formato
// devolvido por callGeminiBatch) e retorna só os campos que de fato mudaram.
// "newValue" é o que de fato será gravado em p[key] se o usuário aceitar --
// para "price" já é number, para "category" já é o id (não o rótulo).
function diffAiSuggestion(p, s) {
  const changes = [];
  const cats = typeof STUDIO_ARACI_CATEGORIES !== 'undefined' ? STUDIO_ARACI_CATEGORIES : [];
  const validCategoryIds = new Set(cats.map(c => c.id));
  const catLabel = id => cats.find(c => c.id === id)?.label || id || '—';
  const money = n => 'R$ ' + (n || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const addText = (key, label, aiKey) => {
    const oldV = (p[key] || '').toString().trim();
    const newV = (s[aiKey] ?? '').toString().trim();
    if (newV && newV !== oldV) {
      changes.push({ key, label, oldDisplay: oldV || '—', newDisplay: newV, newValue: newV });
    }
  };

  addText('name', 'Nome', 'nome');
  addText('brand', 'Marca', 'marca');
  addText('sku', 'SKU', 'sku');
  addText('dims', 'Dimensões', 'dimensoes');
  addText('obs', 'Observações', 'observacoes');

  const newPrice = Number(s.preco);
  if (Number.isFinite(newPrice) && newPrice > 0 && Math.abs(newPrice - (p.price || 0)) > 0.005) {
    changes.push({
      key: 'price', label: 'Preço',
      oldDisplay: money(p.price || 0), newDisplay: money(newPrice),
      newValue: newPrice
    });
  }

  const newCat = (s.categoria || '').toString().trim();
  if (validCategoryIds.has(newCat) && newCat !== (p.category || '')) {
    changes.push({
      key: 'category', label: 'Categoria',
      oldDisplay: catLabel(p.category), newDisplay: catLabel(newCat),
      newValue: newCat
    });
  }

  return changes;
}

// Roda a IA sobre a lista de produtos em lotes de AI_BATCH_SIZE, chamando
// onProgress(feitos, total) a cada lote concluído. Um lote que falha (erro de
// rede, JSON inválido etc.) não derruba os outros -- cada produto do lote
// falho entra no resultado com "error" preenchido em vez de "changes".
async function enrichProjectWithAI(products, onProgress) {
  const { apiKey, model } = await getAiSettings();
  if (!apiKey) {
    throw new Error('Configure a chave de API do Gemini em ⚙ Configurações antes de usar a IA.');
  }
  if (!products || products.length === 0) return [];

  const results = [];
  let done = 0;

  for (let i = 0; i < products.length; i += AI_BATCH_SIZE) {
    const batch = products.slice(i, i + AI_BATCH_SIZE);
    let suggestions = null;
    let batchError = null;
    try {
      suggestions = await callGeminiBatch(batch, apiKey, model);
    } catch (e) {
      batchError = e.message || String(e);
    }

    const byId = new Map((suggestions || []).map(s => [s.id, s]));
    for (const p of batch) {
      const s = byId.get(p.id);
      if (batchError) {
        results.push({ product: p, changes: [], error: batchError });
      } else if (!s) {
        results.push({ product: p, changes: [], error: 'A IA não retornou dados para este produto.' });
      } else {
        results.push({ product: p, changes: diffAiSuggestion(p, s) });
      }
      done++;
    }
    onProgress?.(done, products.length);
  }

  return results;
}
