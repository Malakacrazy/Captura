// popup.js v2 — Studio Araci FF&E

const $ = id => document.getElementById(id);

const CATEGORIES = [
  { id: 'revestimentos', label: 'Revestimentos' },
  { id: 'loucas-metais', label: 'Louças e Metais' },
  { id: 'iluminacao',    label: 'Iluminação' },
  { id: 'eletros',      label: 'Eletros' },
  { id: 'moveis',      label: 'Movéis' },
  { id: 'decoracao-enxoval',      label: 'Decoração e Enxoval' },
  { id: 'outros',       label: 'Outros' }
];

let products = [];
let projectName = '';
let activeFilter = 'all';
let statusTimer = null;

// ─── Utilities ─────────────────────────────────────────────────────────────

function fmt(n) {
  return 'R$ ' + (n || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function save() {
  return chrome.storage.local.set({ products, projectName });
}

function showStatus(msg, type = 'ok', duration = 2800) {
  const bar = $('statusBar');
  bar.textContent = msg;
  bar.className = 'status-bar ' + type;
  clearTimeout(statusTimer);
  statusTimer = setTimeout(() => { bar.className = 'status-bar'; }, duration);
}

// ─── Init ──────────────────────────────────────────────────────────────────

async function init() {
  const data = await chrome.storage.local.get(['products', 'projectName']);
  products = data.products || [];
  projectName = data.projectName || '';
  $('projectName').value = projectName;
  render();
}

// ─── Render ────────────────────────────────────────────────────────────────

function render() {
  const list = $('productList');
  const empty = $('emptyState');

  // Remove old rows
  list.querySelectorAll('.product-item').forEach(el => el.remove());

  const visible = activeFilter === 'all'
    ? products
    : products.filter(p => p.category === activeFilter);

  if (visible.length === 0) {
    empty.style.display = '';
    $('generateBtn').disabled = true;
    $('prodCount').textContent = products.length;
    $('totalValue').textContent = fmt(0);
    return;
  }

  empty.style.display = 'none';
  $('generateBtn').disabled = false;

  let total = 0;
  visible.forEach(p => {
    total += (p.price || 0) * (p.qty || 1);
    list.appendChild(buildRow(p));
  });

  $('prodCount').textContent = products.length;
  $('totalValue').textContent = fmt(products.reduce((s, p) => s + (p.price || 0) * (p.qty || 1), 0));
}

function buildRow(p) {
  const item = document.createElement('div');
  item.className = 'product-item';
  item.dataset.id = p.id;

  // Image
  const imgWrap = document.createElement('div');
  imgWrap.className = 'prod-img-wrap';

  if (p.img) {
    const img = document.createElement('img');
    img.src = p.img;
    img.alt = p.name;
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

  // Body
  const body = document.createElement('div');
  body.className = 'prod-body';

  const name = document.createElement('div');
  name.className = 'prod-name';
  name.title = p.name;
  name.textContent = p.name;

  const meta = document.createElement('div');
  meta.className = 'prod-meta';
  meta.textContent = [p.brand, p.sku ? 'SKU ' + p.sku : ''].filter(Boolean).join(' · ');

  // Category badge + select
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

  badge.addEventListener('click', () => {
    badge.classList.add('hidden');
    badge.style.display = 'none';
    sel.classList.add('visible');
    sel.focus();
  });

  sel.addEventListener('change', async () => {
    const idx = products.findIndex(x => x.id === p.id);
    if (idx !== -1) {
      products[idx].category = sel.value;
      await save();
      render(); // re-render to update badge
    }
  });

  sel.addEventListener('blur', () => {
    sel.classList.remove('visible');
    badge.style.display = '';
  });

  catWrap.append(badge, sel);
  body.append(name, meta, catWrap);

  // Right side: price + controls
  const right = document.createElement('div');
  right.className = 'prod-right';

  const price = document.createElement('div');
  price.className = 'prod-price';
  price.textContent = fmt((p.price || 0) * (p.qty || 1));

  const controls = document.createElement('div');
  controls.className = 'prod-controls';

  const decBtn = document.createElement('button');
  decBtn.className = 'qty-btn';
  decBtn.textContent = '−';
  decBtn.title = 'Diminuir quantidade';

  const qtySpan = document.createElement('span');
  qtySpan.className = 'qty-val';
  qtySpan.textContent = p.qty || 1;

  const incBtn = document.createElement('button');
  incBtn.className = 'qty-btn';
  incBtn.textContent = '+';
  incBtn.title = 'Aumentar quantidade';

  const delBtn = document.createElement('button');
  delBtn.className = 'del-btn';
  delBtn.title = 'Remover';
  delBtn.textContent = '×';

  decBtn.addEventListener('click', async () => {
    const idx = products.findIndex(x => x.id === p.id);
    if (idx === -1) return;
    products[idx].qty = Math.max(1, (products[idx].qty || 1) - 1);
    await save(); render();
  });

  incBtn.addEventListener('click', async () => {
    const idx = products.findIndex(x => x.id === p.id);
    if (idx === -1) return;
    products[idx].qty = (products[idx].qty || 1) + 1;
    await save(); render();
  });

  delBtn.addEventListener('click', async () => {
    products = products.filter(x => x.id !== p.id);
    await save(); render();
  });

  controls.append(decBtn, qtySpan, incBtn, delBtn);
  right.append(price, controls);
  item.append(imgWrap, body, right);
  return item;
}

// ─── Category tabs ─────────────────────────────────────────────────────────

$('catTabs').addEventListener('click', e => {
  const tab = e.target.closest('.cat-tab');
  if (!tab) return;
  document.querySelectorAll('.cat-tab').forEach(t => t.classList.remove('active'));
  tab.classList.add('active');
  activeFilter = tab.dataset.cat;
  render();
});

// ─── Project name ──────────────────────────────────────────────────────────

$('projectName').addEventListener('input', async e => {
  projectName = e.target.value;
  await save();
});

// ─── Toggle add form ───────────────────────────────────────────────────────

$('toggleAddBtn').addEventListener('click', () => {
  $('addForm').classList.toggle('open');
  if ($('addForm').classList.contains('open')) $('f-name').focus();
});

// ─── Add manual product ────────────────────────────────────────────────────

$('addManualBtn').addEventListener('click', async () => {
  const name  = $('f-name').value.trim();
  if (!name) { showStatus('⚠ Informe o nome do produto', 'warn'); $('f-name').focus(); return; }

  const brand = $('f-brand').value.trim();
  const sku   = $('f-sku').value.trim();
  const price = parseFloat($('f-price').value) || 0;
  const qty   = Math.max(1, parseInt($('f-qty').value) || 1);
  const category = $('f-cat').value;

  products.push({ id: Date.now(), name, brand, sku, price, qty, category, img: '', dims: '', url: '' });
  await save();

  $('f-name').value = ''; $('f-brand').value = ''; $('f-sku').value = '';
  $('f-price').value = ''; $('f-qty').value = '1';

  showStatus('✓ Produto adicionado', 'ok');

  // Switch to "all" view to see the new product
  if (activeFilter !== 'all' && activeFilter !== category) {
    activeFilter = 'all';
    document.querySelectorAll('.cat-tab').forEach(t => t.classList.toggle('active', t.dataset.cat === 'all'));
  }
  render();
});

// ─── Capture from page ─────────────────────────────────────────────────────

$('captureBtn').addEventListener('click', async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) return;

  showStatus('⏳ Capturando produto...', 'info', 8000);

  try {
    const results = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: extractProductFromPage
    });

    const d = results?.[0]?.result;

    if (!d?.name) {
      showStatus('⚠ Produto não identificado nesta página', 'warn');
      return;
    }

    // Assign category based on keywords in product name
    const cat = guessCategory(d.name);

    products.push({
      id: Date.now(),
      name: d.name,
      brand: d.brand || '',
      sku: d.sku || '',
      price: d.price || 0,
      qty: 1,
      category: cat,
      img: d.img || '',
      dims: d.dims || '',
      url: d.url || ''
    });

    await save();
    activeFilter = 'all';
    document.querySelectorAll('.cat-tab').forEach(t => t.classList.toggle('active', t.dataset.cat === 'all'));
    render();

    showStatus(`✓ "${d.name.substring(0, 42)}…" adicionado como ${CATEGORIES.find(c=>c.id===cat)?.label}`, 'ok');
  } catch (err) {
    showStatus('⚠ Erro ao acessar esta página. Tente em uma loja online.', 'warn');
  }
});

// ─── Auto-guess category from product name ─────────────────────────────────

function guessCategory(name) {
  const n = name.toLowerCase();
  if (/piso|cerâmic|porcelana|revestimento|argamassa|rejunte|tijolet|pedra|mármo|granito|parquet|laminado|deck/.test(n))
    return 'revestimentos';
  if (/vaso|sanitário|cuba|torneira|ducha|chuveiro|bacia|sifão|mictório|válvula|box|espelho|banheira|fechadura|cadeado/.test(n))
    return 'loucas-metais';
  if (/luminária|lâmpada|lustre|arandela|spot|trilho|pendente|led|interruptor|tomada|cortina|persiana|tapete|quadro|vaso decorat|planta/.test(n))
    return 'iluminacao';
  if (/toalha|roupa|cama|lençol|fronha|edredom|almofada|colchão|travesseiro|enxoval/.test(n))
    return 'enxoval';
  return 'outros';
}

// ─── Clear all ─────────────────────────────────────────────────────────────

$('clearBtn').addEventListener('click', async () => {
  if (products.length === 0) return;
  if (!confirm('Deseja limpar todos os produtos do orçamento?')) return;
  products = [];
  await save();
  render();
});

// ─── Generate PDF ──────────────────────────────────────────────────────────

$('generateBtn').addEventListener('click', () => {
  chrome.runtime.sendMessage({ action: 'openPrint' });
});

// ─── Product extractor (injected into page) ────────────────────────────────
// This function runs in the context of the store page.

function extractProductFromPage() {
  // ── Image: og:image is the most canonical product image ──
  function getBestImage() {
    const og = document.querySelector('meta[property="og:image"]')?.content;
    if (og) return og;

    // Collect all images, score by size + position
    const candidates = [...document.images]
      .filter(img => {
        const w = img.naturalWidth, h = img.naturalHeight;
        if (w < 100 || h < 100) return false;
        // Exclude logos, icons, banners
        const src = img.src.toLowerCase();
        if (/logo|icon|sprite|banner|badge|brand|avatar|flag/.test(src)) return false;
        const ratio = w / h;
        if (ratio < 0.3 || ratio > 3) return false; // extreme aspect ratios
        return true;
      })
      .map(img => ({
        src: img.src,
        area: img.naturalWidth * img.naturalHeight,
        rendered: img.getBoundingClientRect()
      }))
      .sort((a, b) => b.area - a.area);

    return candidates[0]?.src || '';
  }

  // ── Price ──
  function getPrice() {
    // JSON-LD structured data (most reliable)
    const ld = document.querySelector('script[type="application/ld+json"]');
    if (ld) {
      try {
        const data = JSON.parse(ld.textContent);
        const arr = Array.isArray(data) ? data : [data];
        for (const item of arr) {
          const offer = item.offers || item.Offers;
          if (offer) {
            const price = offer.price || offer.lowPrice;
            if (price) return parseFloat(String(price).replace(',', '.'));
          }
        }
      } catch {}
    }
    // Meta
    const metaPrice = document.querySelector('meta[property="product:price:amount"]')?.content;
    if (metaPrice) return parseFloat(metaPrice.replace(',', '.'));

    // DOM: find elements containing "R$"
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    const prices = [];
    let node;
    while ((node = walker.nextNode())) {
      const match = node.textContent.match(/R\$\s*([\d.,]+)/);
      if (match) {
        const val = parseFloat(match[1].replace(/\./g, '').replace(',', '.'));
        if (val > 0) prices.push(val);
      }
    }
    // Return the most common or first reasonable price
    return prices.filter(p => p < 50000)[0] || 0;
  }

  // ── SKU ──
  function getSKU() {
    const ld = document.querySelector('script[type="application/ld+json"]');
    if (ld) {
      try {
        const data = JSON.parse(ld.textContent);
        const arr = Array.isArray(data) ? data : [data];
        for (const item of arr) {
          if (item.sku) return String(item.sku);
          if (item.mpn) return String(item.mpn);
        }
      } catch {}
    }
    // Look for SKU in page text
    const match = document.body.innerText.match(/(?:SKU|Cód\.?|Código|Ref\.?)[:\s#]*([A-Z0-9\-]{4,20})/i);
    return match ? match[1] : '';
  }

  // ── Brand ──
  function getBrand() {
    const meta = document.querySelector('meta[property="product:brand"]')?.content
      || document.querySelector('meta[itemprop="brand"]')?.content;
    if (meta) return meta;
    const ld = document.querySelector('script[type="application/ld+json"]');
    if (ld) {
      try {
        const data = JSON.parse(ld.textContent);
        const arr = Array.isArray(data) ? data : [data];
        for (const item of arr) {
          if (item.brand?.name) return item.brand.name;
          if (typeof item.brand === 'string') return item.brand;
        }
      } catch {}
    }
    return '';
  }

  // ── Name ──
  function getName() {
    const og = document.querySelector('meta[property="og:title"]')?.content;
    if (og) return og.trim();
    const h1 = document.querySelector('h1');
    if (h1) return h1.innerText.trim();
    return document.title.split('|')[0].trim();
  }

  return {
    name:  getName(),
    brand: getBrand(),
    sku:   getSKU(),
    price: getPrice(),
    img:   getBestImage(),
    dims:  '',
    url:   window.location.href
  };
}

// ─── Boot ───────────────────────────────────────────────────────────────────
init();
