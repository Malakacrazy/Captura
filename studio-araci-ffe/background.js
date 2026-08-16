// background.js v3 — Studio Araci FF&E

// ---------------------------------------------------------------------------
// VISÃO GERAL DO SERVICE WORKER (Manifest V3)
// ---------------------------------------------------------------------------
// No MV3 a background page foi substituída pelo service worker: um contexto
// orientado a eventos, não persistente. O Chrome o inicia quando um evento
// dispara e o encerra quando fica ocioso, então nada de estado em variáveis de
// módulo — chrome.storage é a camada de persistência correta.
//
// Além do ciclo de vida, este worker é o ORQUESTRADOR DA CAPTURA. Tanto o botão
// flutuante (content.js) quanto o botão "⊕ Capturar" (popup.js) delegam a
// captura para cá, o que garante que os dois caminhos produzam exatamente o
// mesmo resultado. Antes cada um tinha sua própria cópia da raspagem, e as
// cópias já haviam divergido.
// ---------------------------------------------------------------------------

// Taxonomia compartilhada: STUDIO_ARACI_CATEGORIES e studioAraciGuessCategory().
// A classificação roda AQUI, fora da página, sobre as strings já extraídas.
importScripts('categories.js');


// ---------------------------------------------------------------------------
// INICIALIZAÇÃO DO STORAGE NA INSTALAÇÃO / ATUALIZAÇÃO
// ---------------------------------------------------------------------------
// onInstalled dispara na primeira instalação, em cada atualização da extensão e
// (raramente) quando o próprio Chrome é atualizado. É o único lugar seguro para
// garantir que as chaves existam antes de qualquer leitura.
chrome.runtime.onInstalled.addListener(() => {
  // Lemos as três chaves de uma vez para inspecionar antes de escrever. A
  // escrita é condicional de propósito: gravar incondicionalmente apagaria a
  // lista de produtos e os projetos do usuário a cada atualização.
  chrome.storage.local.get(['products', 'projectName', 'projects'], (data) => {
    // Arrays default para que o resto do código possa chamar .push()/.filter()
    // sem checagem de null; string vazia para interpolação segura em templates.
    if (!data.products) chrome.storage.local.set({ products: [] });
    if (!data.projectName) chrome.storage.local.set({ projectName: '' });
    if (!data.projects) chrome.storage.local.set({ projects: [] });
  });

  // Reinjeta o content script nas abas JÁ ABERTAS.
  //
  // Por padrão, o Chrome só injeta content scripts em páginas carregadas DEPOIS
  // que a extensão é instalada/atualizada. Sem isto, logo após uma atualização o
  // atalho Ctrl+. dispara, o service worker envia a mensagem, mas as abas antigas
  // não têm o content script para recebê-la — e os botões não aparecem até dar
  // F5 em cada aba. Injetar aqui faz o atalho funcionar imediatamente nas abas
  // que já estavam abertas.
  reinjectContentScripts();
});

// Injeta content.css + content.js em todas as abas http/https abertas.
// Páginas restritas (chrome://, Web Store, PDF, about:) recusam a injeção; o
// try/catch por aba absorve essas falhas sem interromper as demais.
async function reinjectContentScripts() {
  const tabs = await chrome.tabs.query({ url: ['http://*/*', 'https://*/*'] });
  for (const tab of tabs) {
    if (!tab.id) continue;
    try {
      await chrome.scripting.insertCSS({ target: { tabId: tab.id }, files: ['content.css'] });
      await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['content.js'] });
    } catch {
      // Aba em página restrita ou descarregada — ignora e segue para a próxima
    }
  }
}


// ---------------------------------------------------------------------------
// CAPTURA DE PRODUTO
// ---------------------------------------------------------------------------

// Injeta extractor.js e roda a extração, repetindo até a página hidratar.
//
// Vitrines SPA (VTEX: Leroy Merlin, Tok&Stok, ABC da Construção) entregam um
// HTML vazio e só injetam nome, preço e JSON-LD depois, via JavaScript. Uma
// única tentativa logo após o clique pode não ver nada.
//
// A injeção é feita no MUNDO PRINCIPAL (world: 'MAIN') porque o fallback de
// preço da VTEX lê window.__STATE__, que pertence à página e é invisível do
// mundo isolado dos content scripts.
//
// Critérios de parada, em ordem:
//   • nome + preço > 0            → captura completa, retorna na hora
//   • nome estável em 3 leituras  → a página já hidratou e o produto realmente
//                                   não tem preço (esgotado, "sob consulta");
//                                   não adianta continuar esperando
//   • esgotou as tentativas       → devolve o melhor resultado obtido
//
// A parada por estabilidade é o que evita gastar os ~2 s inteiros em todo
// produto sem preço, como acontecia na versão anterior (12 × 300 ms fixos).
async function extractWithRetry(tabId, { attempts = 8, delay = 250 } = {}) {
  // Define __studioAraciExtract__ na página. Reinjetar é inofensivo: o arquivo só
  // contém uma function declaration, que pode ser redeclarada sem erro.
  await chrome.scripting.executeScript({
    target: { tabId },
    files: ['extractor.js'],
    world: 'MAIN'
  });

  let best = null;
  let stableName = null;
  let stableCount = 0;

  for (let i = 0; i < attempts; i++) {
    const results = await chrome.scripting.executeScript({
      target: { tabId },
      func: () => __studioAraciExtract__(),
      world: 'MAIN'
    });
    const d = results?.[0]?.result;

    if (d?.name) {
      if (d.price > 0) return d;   // captura completa

      best = best || d;            // guarda o primeiro resultado só com nome

      // Nome repetido entre leituras = página estabilizou
      if (d.name === stableName) {
        if (++stableCount >= 2) return best;
      } else {
        stableName = d.name;
        stableCount = 0;
      }
    }

    await new Promise(r => setTimeout(r, delay));
  }

  return best; // melhor esforço: nome sem preço, ou null se nada foi achado
}

// Captura o produto da aba, classifica e adiciona ao orçamento em andamento.
//
// Concentrar a escrita aqui (em vez de deixar cada chamador gravar) garante
// que a deduplicação e a geração de id valham para os dois botões de captura.
async function captureProduct(tabId) {
  const d = await extractWithRetry(tabId);
  if (!d?.name) return { ok: false, reason: 'not-found' };

  const { products = [] } = await chrome.storage.local.get('products');

  // Deduplicação por URL: recapturar a mesma página soma na quantidade em vez
  // de criar uma segunda linha idêntica no orçamento.
  const existing = d.url && products.find(p => p.url === d.url);
  if (existing) {
    existing.qty = (existing.qty || 1) + 1;
    await chrome.storage.local.set({ products });
    return { ok: true, deduped: true, name: existing.name, qty: existing.qty };
  }

  const category = studioAraciGuessCategory(d.name, d.siteCategory);

  // crypto.randomUUID() em vez de Date.now(): duas capturas no mesmo
  // milissegundo geravam ids iguais, e como a remoção filtra por id
  // (products.filter(x => x.id !== id)), apagar um item apagava os dois.
  products.push({
    id: crypto.randomUUID(),
    name: d.name,
    brand: d.brand || '',
    sku: d.sku || '',
    price: d.price || 0,
    qty: 1,
    category,
    img: d.img || '',
    dims: d.dims || '',
    url: d.url || '',
    unit: d.unit || ''
  });

  await chrome.storage.local.set({ products });

  const label = STUDIO_ARACI_CATEGORIES.find(c => c.id === category)?.label || 'Outros';
  return { ok: true, deduped: false, name: d.name, category, categoryLabel: label };
}


// ---------------------------------------------------------------------------
// ATALHO DE TECLADO — mostrar/ocultar os botões flutuantes
// ---------------------------------------------------------------------------
// Comandos declarados no manifest são capturados pelo Chrome no nível do
// navegador, antes de qualquer JavaScript da página poder interceptá-los.
// Repassamos o evento ao content script da aba ativa por mensagem.
chrome.commands.onCommand.addListener((command) => {
  if (command !== 'toggle-fab') return;
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    const id = tabs[0]?.id;
    if (!id) return;
    // A aba pode não ter content script (chrome://, Web Store, PDF). O callback
    // vazio + leitura de lastError evitam o "Unchecked runtime.lastError" no
    // console do service worker.
    chrome.tabs.sendMessage(id, { action: 'toggleFab' }, () => void chrome.runtime.lastError);
  });
});


// ---------------------------------------------------------------------------
// MENSAGENS — comunicação entre content script e páginas da extensão
// ---------------------------------------------------------------------------
// Retornar `true` de um listener onMessage é o contrato do MV3 para avisar o
// Chrome que sendResponse será chamado de forma assíncrona. Sem isso o canal é
// fechado assim que o listener retorna e a resposta se perde em silêncio.
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {

  // --- captureProduct ------------------------------------------------------
  // Chamado pelo botão flutuante (sem tabId — usamos a aba de origem) e pelo
  // botão "⊕ Capturar" do popup (que informa a aba ativa explicitamente,
  // porque o popup não roda dentro de uma aba de conteúdo).
  if (msg.action === 'captureProduct') {
    const tabId = msg.tabId ?? sender.tab?.id;
    if (!tabId) { sendResponse({ ok: false, reason: 'no-tab' }); return; }

    captureProduct(tabId)
      .then(sendResponse)
      // executeScript falha em páginas onde a extensão não pode injetar
      // (chrome://, Chrome Web Store, visualizador de PDF, arquivos locais sem
      // permissão). Devolvemos o motivo para o chamador mostrar um aviso útil.
      .catch(err => sendResponse({ ok: false, reason: 'blocked', message: String(err?.message || err) }));
    return true;
  }

  // --- Abertura de páginas da extensão -------------------------------------
  // Só o service worker pode chamar chrome.tabs.create com segurança em todos
  // os contextos, então os demais delegam aqui.
  const PAGES = {
    openPrint: 'print.html',
    openLibrary: 'library.html',
    openPopup: 'popup.html'
  };
  const page = PAGES[msg.action];
  if (page) {
    // getURL resolve o chrome-extension://<id>/… correto em tempo de execução,
    // funcionando tanto com a extensão empacotada quanto descompactada.
    chrome.tabs.create({ url: chrome.runtime.getURL(page) },
      tab => sendResponse({ ok: true, tabId: tab.id }));
    return true;
  }
});
