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
  if (/piso|cerâmic|porcelan|revestimento|argamassa|rejunte|tijolet|pedra|mármo|granito|parquet|laminado|deck|azulejo|grês/.test(n))
    return 'revestimentos';
  if (/vaso sanitário|bacia sanitária|cuba|torneira|ducha|chuveiro|sifão|mictório|válvula|box|banheira|fechadura|cadeado|registro|misturador|metalic/.test(n))
    return 'loucas-metais';
  if (/luminária|lâmpada|lustre|arandela|spot|trilho|pendente|led|plafon/.test(n))
    return 'iluminacao';
  if (/geladeira|refrigerador|fogão|forno|microondas|máquina de lavar|máquina de secar|lava.louça|lavadora|secadora|air fryer|aspirador|purificador|climatizador|ar condicionado|ventilador|exaustor|coifa|cooktop/.test(n))
    return 'eletros';
  if (/sofá|poltrona|mesa|cadeira|cama|colchão|armário|guarda.roupa|estante|rack|prateleira|criado.mudo|aparador|buffet|escrivaninha|banco|pufe|cabeceira|penteadeira/.test(n))
    return 'moveis';
  if (/tapete|quadro|almofada|cortina|persiana|espelho|toalha|lençol|fronha|edredom|travesseiro|enxoval|roupa de cama|vaso decorat|planta|interruptor|tomada|decoração|objeto decorat/.test(n))
    return 'decoracao-enxoval';
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
  // ── JSON-LD helper — searches all scripts, unwraps @graph ────────────────
  function fromJsonLD(pick) {
    for (const s of document.querySelectorAll('script[type="application/ld+json"]')) {
      try {
        const root = JSON.parse(s.textContent);
        const nodes = [];
        const unwrap = o => {
          if (Array.isArray(o)) o.forEach(unwrap);
          else if (o && typeof o === 'object') {
            nodes.push(o);
            if (o['@graph']) unwrap(o['@graph']);
          }
        };
        unwrap(root);
        for (const n of nodes) {
          const v = pick(n);
          if (v !== null && v !== undefined && v !== '') return v;
        }
      } catch {}
    }
    return null;
  }

  // ── Parse Brazilian price string ─────────────────────────────────────────
  function parsePrice(str) {
    if (!str) return 0;
    const m = str.match(/[\d.,]+/);
    if (!m) return 0;
    const raw = m[0];
    if (/\d{1,3}(\.\d{3})+(,\d{2})?$/.test(raw))
      return parseFloat(raw.replace(/\./g, '').replace(',', '.'));
    if (raw.includes(','))
      return parseFloat(raw.replace(/\./g, '').replace(',', '.'));
    return parseFloat(raw) || 0;
  }

  // ── VTEX __STATE__ price fallback ────────────────────────────────────────
  function getVtexPrice() {
    try {
      const state = window.__STATE__;
      if (!state) return null;
      for (const key of Object.keys(state)) {
        const node = state[key];
        if (node?.selling?.price) return node.selling.price / 100;
        if (node?.spotPrice)      return node.spotPrice;
      }
    } catch {}
    return null;
  }

  const host = location.hostname.replace(/^www\./, '');

  // ── Name ─────────────────────────────────────────────────────────────────
  function getName() {
    if (host.includes('leroymerlin')) {
      const el = document.querySelector('[data-testid="product-name"], h1[class*="title"], h1[class*="product"]');
      if (el?.innerText) return el.innerText.trim();
    }
    if (host.includes('samsung')) {
      const el = document.querySelector('.pd-title, h1[class*="title"], h1[class*="product"]');
      if (el?.innerText) return el.innerText.trim();
    }
    if (host.includes('electrolux') || host.includes('brastemp')) {
      const el = document.querySelector('h1[class*="product"], h1[class*="name"], h1');
      if (el?.innerText) return el.innerText.trim();
    }
    if (host.includes('dexco') || host.includes('deca.')) {
      const el = document.querySelector('h1[class*="product"], h1[class*="title"], h1');
      if (el?.innerText) return el.innerText.trim();
    }

    const og = document.querySelector('meta[property="og:title"]')?.content?.trim();
    if (og && og.length > 3) return og;

    const h1 = document.querySelector('h1');
    if (h1) return h1.innerText.trim();

    return document.title.split(/[|\-–·]/)[0].trim();
  }

  // ── Brand ────────────────────────────────────────────────────────────────
  function getBrand() {
    const fromMeta = document.querySelector('meta[property="product:brand"]')?.content
      || document.querySelector('meta[itemprop="brand"]')?.content;
    if (fromMeta) return fromMeta.trim();

    const fromLD = fromJsonLD(d => {
      if (d?.brand?.name) return d.brand.name;
      if (typeof d?.brand === 'string' && d.brand) return d.brand;
      return null;
    });
    if (fromLD) return fromLD;

    const el = document.querySelector(
      '[data-testid="brand-name"], [class*="product-brand"], [class*="brandName"], [itemprop="brand"]'
    );
    if (el?.innerText) return el.innerText.trim();

    return '';
  }

  // ── SKU ──────────────────────────────────────────────────────────────────
  function getSKU() {
    const fromLD = fromJsonLD(d => d?.sku || d?.mpn || null);
    if (fromLD) return String(fromLD);

    const m = document.body.innerText.match(/(?:SKU|Cód\.?|Código|Referência|Ref\.?|Art\.?)[:\s#]*([A-Z0-9\-]{4,20})/i);
    return m ? m[1].trim() : '';
  }

  // ── Price ────────────────────────────────────────────────────────────────
  function getPrice() {
    // 1. JSON-LD — pick lowest offer price
    const ldPrice = fromJsonLD(d => {
      const offers = d?.offers || d?.Offers;
      if (!offers) return null;
      const arr = Array.isArray(offers) ? offers : [offers];
      const ps = arr
        .map(o => parseFloat(String(o?.price ?? o?.lowPrice ?? 0).replace(',', '.')))
        .filter(p => p > 0);
      return ps.length ? Math.min(...ps) : null;
    });
    if (ldPrice && ldPrice > 0) return ldPrice;

    // 2. Meta tag
    const metaP = document.querySelector('meta[property="product:price:amount"]')?.content;
    if (metaP) { const v = parseFloat(metaP.replace(',', '.')); if (v > 0) return v; }

    // 3. VTEX __STATE__
    const vtex = getVtexPrice();
    if (vtex && vtex > 0) return vtex;

    // 4. Site-specific selectors
    const SITE_PRICE_SEL = {
      'telhanorte':    '.priceSpot, [class*="priceSpot"], [class*="price-spot"], .valoper__price',
      'obrafacil':     '.price-spot, .price__selling, [class*="sellingPrice"]',
      'abcconstrucao': '.price-spot, .product-price, [class*="price"]',
      'leroymerlin':   '[data-testid="price"], [class*="sellingPrice"], [class*="price__selling"]',
      'andra':         '.price, [class*="product-price"], [class*="sellingPrice"]',
      'inspirehome':   '.price, [class*="product-price"]',
      'yamamura':      '.price, [class*="product-price"], [class*="sellingPrice"]',
      'belametais':    '.price, [class*="product-price"]',
      'tokstok':       '[class*="spotPrice"], [class*="priceContainer"] .price',
      'westwing':      '[class*="ProductPrice"], [class*="price__selling"]',
      'boobam':        '.price, [class*="product-price"], [class*="sellingPrice"]',
      'camicado':      '[class*="spotPrice"], [class*="sellingPrice"]',
      'muma':          '.price, [class*="product-price"]',
      'dexco':         '.price, [class*="product-price"]',
      'deca.':         '.price, [class*="product-price"]',
      'electrolux':    '[class*="product-price"], [class*="price-info"], .price',
      'fastshop':      '[class*="bestPrice"], [class*="price-best"], .price',
      'brastemp':      '[class*="product-price"], [class*="price-info"], .price',
      'samsung':       '[class*="price-info"], [class*="pd-price"], [class*="price"]',
    };

    for (const [key, sel] of Object.entries(SITE_PRICE_SEL)) {
      if (host.includes(key)) {
        const el = document.querySelector(sel);
        if (el) { const v = parsePrice(el.textContent); if (v > 0) return v; }
        break;
      }
    }

    // 5. Walk text nodes — pick most frequent R$ value
    const prices = [];
    const walk = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    let node;
    while ((node = walk.nextNode())) {
      const m = node.textContent.match(/R\$\s*([\d.,]+)/);
      if (m) {
        const v = parsePrice(m[1]);
        if (v > 0 && v < 500000) prices.push(v);
      }
    }
    if (prices.length > 0) {
      const freq = {};
      prices.forEach(v => freq[v] = (freq[v] || 0) + 1);
      return parseFloat(Object.entries(freq).sort((a, b) => b[1] - a[1])[0][0]);
    }

    return 0;
  }

  // ── Image ────────────────────────────────────────────────────────────────
  function getBestImage() {
    const og = document.querySelector('meta[property="og:image"]')?.content;
    if (og && !/logo|icon/.test(og.toLowerCase())) return og;

    const ldImg = fromJsonLD(d => {
      if (typeof d?.image === 'string' && d.image) return d.image;
      if (d?.image?.url) return d.image.url;
      if (Array.isArray(d?.image) && d.image.length)
        return typeof d.image[0] === 'string' ? d.image[0] : (d.image[0]?.url || null);
      return null;
    });
    if (ldImg) return ldImg;

    const candidates = [...document.images]
      .map(img => ({
        src: img.src || img.dataset.src || img.dataset.lazySrc || img.dataset.original || '',
        area: img.naturalWidth * img.naturalHeight,
        ratio: img.naturalWidth / (img.naturalHeight || 1),
      }))
      .filter(({ src, area, ratio }) => {
        if (!src || area < 150 * 150) return false;
        if (/logo|icon|sprite|banner|badge|avatar|header|footer/.test(src.toLowerCase())) return false;
        return ratio >= 0.4 && ratio <= 2.5;
      })
      .sort((a, b) => b.area - a.area);

    return candidates[0]?.src || '';
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
