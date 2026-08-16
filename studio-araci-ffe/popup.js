// popup.js v3 — Studio Araci FF&E
//
// Controla o popup da extensão (o painel que abre ao clicar no ícone da barra
// de ferramentas): lista de produtos, entrada manual, botão de captura, filtro
// por categoria e navegação para as páginas de PDF e Biblioteca.
//
// A raspagem NÃO mora mais aqui. Este arquivo tinha uma cópia inteira do
// extrator, espelhando a de content.js, e as duas já haviam divergido. Hoje a
// captura é delegada a background.js, que injeta extractor.js — implementação
// única para os dois botões.

// Atalho para document.getElementById, usado o tempo todo
const $ = id => document.getElementById(id);

// Categorias vêm de categories.js (carregado antes deste script em popup.html),
// a mesma fonte usada por background.js e print.js.
const CATEGORIES = STUDIO_ARACI_CATEGORIES;

// Module-level state — the popup is a single-page UI that re-renders from these
let products = [];    // full product array loaded from storage
let projectName = '';    // current budget name, synced to the input field
let activeFilter = 'all'; // which category tab is selected ('all' or a category id)
let statusTimer = null; // handle for the status bar auto-hide timeout

// ─── Utilities ───────────────────────────────────────────────────────────────

// Formats a number as Brazilian currency: "R$ 1.234,56"
function fmt(n) {
  return 'R$ ' + (n || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// Persists the current products and projectName to chrome.storage.local.
// Returns the Promise so callers can await the write before rendering.
function save() {
  return chrome.storage.local.set({ products, projectName });
}

// Shows a temporary status bar message and auto-hides after `duration` ms.
// clearTimeout before setting ensures only the latest call's timer runs —
// rapid successive calls won't stack multiple hide timers.
function showStatus(msg, type = 'ok', duration = 2800) {
  const bar = $('statusBar');
  bar.textContent = msg;
  bar.className = 'status-bar ' + type;
  clearTimeout(statusTimer);
  statusTimer = setTimeout(() => { bar.className = 'status-bar'; }, duration);
}

// ─── Init ────────────────────────────────────────────────────────────────────

// Loads persisted data and renders the UI. Called once on popup open.
async function init() {
  const data = await chrome.storage.local.get(['products', 'projectName']);
  products = data.products || [];
  projectName = data.projectName || '';
  $('projectName').value = projectName; // pre-fill the name input
  render();
}

// ─── Render ──────────────────────────────────────────────────────────────────

// Rebuilds the product list in the DOM from current state.
// Only removes existing .product-item rows — not the entire list — so that
// static elements (empty-state placeholder, etc.) are preserved.
function render() {
  const list = $('productList');
  const empty = $('emptyState');

  list.querySelectorAll('.product-item').forEach(el => el.remove());

  // Apply the active category filter. 'all' shows every product.
  const visible = activeFilter === 'all'
    ? products
    : products.filter(p => p.category === activeFilter);

  if (visible.length === 0) {
    empty.style.display = '';
    $('generateBtn').disabled = true;
    // Contagem e total seguem refletindo o orçamento inteiro, mesmo com um
    // filtro vazio na tela — antes o total zerava aqui, dando a impressão de
    // que o orçamento tinha se perdido ao clicar numa categoria sem itens.
    refreshTotals();
    return;
  }

  empty.style.display = 'none';
  $('generateBtn').disabled = false;

  visible.forEach(p => list.appendChild(buildRow(p)));

  refreshTotals();
}

// Contagem e total do rodapé. Extraído de render() para que alterar a
// quantidade digitando possa atualizar o rodapé sem redesenhar a lista —
// redesenhar tiraria o foco do campo no meio da digitação.
// Os números sempre refletem TODOS os produtos, não apenas o filtro ativo.
function refreshTotals() {
  $('prodCount').textContent = products.length;
  $('totalValue').textContent = fmt(products.reduce((s, p) => s + (p.price || 0) * (p.qty || 1), 0));
}

// Builds a single product row DOM element.
// Each row has: thumbnail | product info + category badge | price + qty controls
function buildRow(p) {
  const item = document.createElement('div');
  item.className = 'product-item';
  item.dataset.id = p.id; // stored for potential future lookup by id

  // ── Thumbnail ──
  const imgWrap = document.createElement('div');
  imgWrap.className = 'prod-img-wrap';

  if (p.img) {
    const img = document.createElement('img');
    img.src = p.img;
    img.alt = p.name;
    // Replace broken images with an emoji placeholder; using onerror here is
    // acceptable in a trusted extension context (not a public web page)
    img.onerror = () => {
      imgWrap.removeChild(img);
      imgWrap.textContent = '📦';
      imgWrap.style.fontSize = '20px';
    };
    imgWrap.appendChild(img);
  } else {
    imgWrap.textContent = '📦';
    imgWrap.style.fontSize = '20px';
    imgWrap.style.color = '#CDB8A3';
  }

  // ── Product info ──
  const body = document.createElement('div');
  body.className = 'prod-body';

  // Render the title as a link to the source page when a URL was captured,
  // otherwise as a plain div. The anchor keeps the same colour (see CSS) and
  // opens the store page in a new tab.
  const name = document.createElement(p.url ? 'a' : 'div');
  name.className = 'prod-name';
  name.textContent = p.name;
  if (p.url) {
    name.href = p.url;
    name.target = '_blank';
    name.rel = 'noopener noreferrer';
    name.title = p.url; // show the destination on hover
  } else {
    name.title = p.name; // full name as tooltip in case it's truncated by CSS
  }

  // Secondary line: "Brand · SKU 12345" — only shows fields that exist
  const meta = document.createElement('div');
  meta.className = 'prod-meta';
  meta.textContent = [p.brand, p.sku ? 'SKU ' + p.sku : ''].filter(Boolean).join(' · ');

  // ── Category badge + inline select ──
  // The category badge is the default display state. Clicking it hides the badge
  // and shows a <select> in its place. On change the new category is saved and
  // the list re-renders to update the badge label and colour.
  const catWrap = document.createElement('div');
  catWrap.className = 'prod-cat-wrap';

  const badge = document.createElement('button');
  badge.className = 'cat-badge ' + (p.category || 'outros');
  badge.textContent = CATEGORIES.find(c => c.id === p.category)?.label || 'Outros';

  const sel = document.createElement('select');
  sel.className = 'cat-inline-select';
  CATEGORIES.forEach(c => {
    const opt = document.createElement('option');
    opt.value = c.id;
    opt.textContent = c.label;
    if (c.id === p.category) opt.selected = true;
    sel.appendChild(opt);
  });

  // Show select when badge is clicked
  badge.addEventListener('click', () => {
    badge.classList.add('hidden');
    badge.style.display = 'none';
    sel.classList.add('visible');
    sel.focus();
  });

  // Save category change and re-render to reflect the new badge label/colour
  sel.addEventListener('change', async () => {
    const idx = products.findIndex(x => x.id === p.id);
    if (idx !== -1) {
      products[idx].category = sel.value;
      await save();
      render();
    }
  });

  // When the select loses focus without a change, restore the badge display.
  // setTimeout 0 defers the restore slightly so the change event fires first
  // if the user clicked another option (blur fires before change on some browsers).
  sel.addEventListener('blur', () => {
    sel.classList.remove('visible');
    badge.style.display = '';
  });

  catWrap.append(badge, sel);
  body.append(name, meta, catWrap);

  // ── Price + qty controls ──
  const right = document.createElement('div');
  right.className = 'prod-right';

  // Display the line total (unit price × qty)
  const price = document.createElement('div');
  price.className = 'prod-price';
  price.textContent = fmt((p.price || 0) * (p.qty || 1));

  const controls = document.createElement('div');
  controls.className = 'prod-controls';

  const decBtn = document.createElement('button');
  decBtn.className = 'qty-btn';
  decBtn.textContent = '−';
  decBtn.title = 'Diminuir quantidade';

  // Campo digitável para lançar quantidades grandes de uma vez, em vez de
  // clicar em + dezenas de vezes. Os botões continuam para o ajuste fino.
  const qtyInput = document.createElement('input');
  qtyInput.type = 'number';
  qtyInput.className = 'qty-val';
  qtyInput.min = '1';
  qtyInput.step = '1';
  qtyInput.value = p.qty || 1;
  qtyInput.title = 'Quantidade';

  const incBtn = document.createElement('button');
  incBtn.className = 'qty-btn';
  incBtn.textContent = '+';
  incBtn.title = 'Aumentar quantidade';

  const delBtn = document.createElement('button');
  delBtn.className = 'del-btn';
  delBtn.title = 'Remover';
  delBtn.textContent = '×';

  // Altera a quantidade e atualiza só o que mudou na tela (preço da linha e
  // rodapé), sem redesenhar a lista — um render() completo tiraria o foco do
  // campo no meio da digitação.
  // Somente inteiros: 2,5 vira 2; qualquer coisa inválida vira 1.
  // `refletir` diz se o valor normalizado volta para dentro do campo — durante
  // a digitação não mexemos nele para não atrapalhar o cursor.
  const setQty = (valor, refletir) => {
    const idx = products.findIndex(x => x.id === p.id);
    if (idx === -1) return;
    const q = Math.max(1, Math.floor(valor) || 1);
    products[idx].qty = q;
    p.qty = q;
    if (refletir) qtyInput.value = q;
    price.textContent = fmt((p.price || 0) * q);
    refreshTotals();
    save();
  };

  // Só aceitamos valores já válidos enquanto digita: sem isso, apagar o "1"
  // para escrever "40" faria o campo se reescrever como 1 a cada tecla.
  qtyInput.addEventListener('input', () => {
    const v = parseInt(qtyInput.value, 10);
    if (Number.isFinite(v) && v >= 1) setQty(v, false);
  });
  // Ao sair do campo, normaliza e devolve o valor final para a tela
  qtyInput.addEventListener('change', () => setQty(parseInt(qtyInput.value, 10), true));
  qtyInput.addEventListener('keydown', e => { if (e.key === 'Enter') qtyInput.blur(); });

  decBtn.addEventListener('click', () => setQty((p.qty || 1) - 1, true));
  incBtn.addEventListener('click', () => setQty((p.qty || 1) + 1, true));

  // Filter returns a new array so the module-level reference is replaced atomically
  delBtn.addEventListener('click', async () => {
    products = products.filter(x => x.id !== p.id);
    await save(); render();
  });

  controls.append(decBtn, qtyInput, incBtn, delBtn);
  right.append(price, controls);
  item.append(imgWrap, body, right);
  return item;
}

// ─── Category tabs ────────────────────────────────────────────────────────────

// Event delegation: listen on the container instead of each tab so dynamically
// added tabs work and we avoid attaching N separate listeners.
$('catTabs').addEventListener('click', e => {
  const tab = e.target.closest('.cat-tab'); // handles clicks on child spans/icons
  if (!tab) return;
  document.querySelectorAll('.cat-tab').forEach(t => t.classList.remove('active'));
  tab.classList.add('active');
  activeFilter = tab.dataset.cat;
  render();
});

// ─── Project name ─────────────────────────────────────────────────────────────

// Auto-save on every keystroke so the name is never lost if the popup closes
$('projectName').addEventListener('input', async e => {
  projectName = e.target.value;
  await save();
});

// ─── Manual product add form ──────────────────────────────────────────────────

// Toggle the add-product form panel open/closed; auto-focus the name field on open
$('toggleAddBtn').addEventListener('click', () => {
  $('addForm').classList.toggle('open');
  if ($('addForm').classList.contains('open')) $('f-name').focus();
});

$('addManualBtn').addEventListener('click', async () => {
  const name = $('f-name').value.trim();
  if (!name) { showStatus('⚠ Informe o nome do produto', 'warn'); $('f-name').focus(); return; }

  const brand = $('f-brand').value.trim();
  const sku = $('f-sku').value.trim();
  const price = parseFloat($('f-price').value) || 0;       // NaN-safe default
  const qty = Math.max(1, parseInt($('f-qty').value) || 1); // floor at 1
  const category = $('f-cat').value;

  const unit = $('f-unit').value.trim();
  // crypto.randomUUID() em vez de Date.now(): dois itens criados no mesmo
  // milissegundo recebiam o mesmo id, e como a exclusão filtra por id, remover
  // um deles removia os dois.
  products.push({ id: crypto.randomUUID(), name, brand, sku, price, qty, category, img: '', dims: '', url: '', unit });
  await save();

  // Clear the form fields for the next entry
  $('f-name').value = ''; $('f-brand').value = ''; $('f-sku').value = '';
  $('f-price').value = ''; $('f-qty').value = '1'; $('f-unit').value = '';

  showStatus('✓ Produto adicionado', 'ok');

  // If the user is viewing a filtered category that doesn't match the new product,
  // switch back to 'all' so the newly added item is immediately visible
  if (activeFilter !== 'all' && activeFilter !== category) {
    activeFilter = 'all';
    document.querySelectorAll('.cat-tab').forEach(t => t.classList.toggle('active', t.dataset.cat === 'all'));
  }
  render();
});

// ─── Capture from current tab ─────────────────────────────────────────────────

// A captura é delegada a background.js: ele injeta extractor.js na aba, repete
// até a SPA hidratar, classifica, deduplica e grava no orçamento. O popup só
// pede, relê o storage e redesenha.
//
// O popup roda no contexto da extensão e não enxerga o DOM da loja, por isso
// precisa informar qual aba deve ser capturada.
$('captureBtn').addEventListener('click', async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) return;

  showStatus('⏳ Capturando produto...', 'info', 8000);

  const res = await chrome.runtime.sendMessage({ action: 'captureProduct', tabId: tab.id })
    .catch(() => null); // service worker indisponível

  if (!res) {
    showStatus('⚠ Erro ao capturar. Tente novamente.', 'warn');
    return;
  }
  if (!res.ok) {
    showStatus(res.reason === 'blocked'
      ? '⚠ Não é possível capturar nesta página. Tente em uma loja online.'
      : '⚠ Produto não identificado nesta página', 'warn');
    return;
  }

  // background.js já escreveu em storage; recarregamos para refletir a mudança
  const data = await chrome.storage.local.get('products');
  products = data.products || [];

  // Volta para "Todos" para que o item capturado apareça mesmo com filtro ativo
  activeFilter = 'all';
  document.querySelectorAll('.cat-tab').forEach(t => t.classList.toggle('active', t.dataset.cat === 'all'));
  render();

  showStatus(res.deduped
    ? `✓ Já estava no orçamento — quantidade: ${res.qty}`
    : `✓ "${(res.name || '').substring(0, 42)}…" adicionado como ${res.categoryLabel}`, 'ok');
});

// ─── Clear all ────────────────────────────────────────────────────────────────

$('clearBtn').addEventListener('click', async () => {
  if (products.length === 0) return; // nothing to clear
  if (!confirm('Deseja limpar todos os produtos do orçamento?')) return;
  products = [];
  await save();
  render();
});

// ─── Open PDF / Library pages ─────────────────────────────────────────────────

// Send messages to background.js which opens the extension pages in new tabs.
// The popup cannot call chrome.tabs.create directly without the 'tabs' permission
// (which it has), but delegating to the background keeps the popup clean and
// makes it easy to add behaviour (e.g. focus an existing tab) in one place.
// Sends a message to background.js and falls back to chrome.tabs.create if the
// service worker is inactive (common in MV3 — worker can be terminated when idle).
function openExtPage(action, file) {
  chrome.runtime.sendMessage({ action }, () => {
    if (chrome.runtime.lastError) {
      // Service worker didn't respond — open the tab directly as fallback
      chrome.tabs.create({ url: chrome.runtime.getURL(file) });
    }
  });
}

// Exportar daqui significa "exportar o orçamento em andamento". Limpamos
// printPayload para que a página de impressão não reaproveite um projeto salvo
// que a Biblioteca tenha enfileirado antes.
$('generateBtn').addEventListener('click', async () => {
  await chrome.storage.local.set({ printPayload: null });
  openExtPage('openPrint', 'print.html');
});

$('libraryBtn').addEventListener('click', () => openExtPage('openLibrary', 'library.html'));

// ─── Boot ─────────────────────────────────────────────────────────────────────
init();
