// content.js v3 — Studio Araci FF&E · Floating capture button

(function () {
  'use strict';

  if (document.getElementById('sa-fab')) return;

  // ─── Floating button ─────────────────────────────────────────────────────

  const fab = document.createElement('button');
  fab.id = 'sa-fab';
  fab.setAttribute('aria-label', 'Adicionar ao Orçamento Studio Araci');
  fab.innerHTML = `
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round">
      <path d="M12 5v14M5 12h14"/>
    </svg>
    <span>Orçamento</span>
  `;

  const toast = document.createElement('div');
  toast.id = 'sa-toast';

  document.body.append(fab, toast);

  // ─── Click handler ───────────────────────────────────────────────────────

  fab.addEventListener('click', async () => {
    fab.classList.add('loading');
    fab.querySelector('span').textContent = 'Capturando…';

    try {
      const product = await extractProduct();

      if (!product.name) {
        showToast('⚠ Produto não identificado nesta página.', 'warn');
        return;
      }

      const storage = await chrome.storage.local.get('products');
      const products = storage.products || [];
      products.push(product);
      await chrome.storage.local.set({ products });

      showToast(`✓ Adicionado: ${product.name.substring(0, 48)}`, 'ok');
    } catch (e) {
      showToast('⚠ Erro ao capturar. Tente adicionar manualmente.', 'warn');
    } finally {
      fab.classList.remove('loading');
      fab.querySelector('span').textContent = 'Orçamento';
    }
  });

  // ─── Product extraction ──────────────────────────────────────────────────

  async function extractProduct() {
    const name     = getName();
    const brand    = getBrand();
    const sku      = getSKU();
    const price    = getPrice();
    const img      = getBestImage();
    const url      = window.location.href;
    const category = guessCategory(name);

    return { id: Date.now(), name, brand, sku, price, img, dims: '', url, qty: 1, category };
  }

  // ── JSON-LD helper — searches all scripts, unwraps @graph ─────────────────
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

  // ── Parse Brazilian price string ──────────────────────────────────────────
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

  // ── VTEX __STATE__ price fallback ─────────────────────────────────────────
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

  // ── Name ──────────────────────────────────────────────────────────────────
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

  // ── Brand ─────────────────────────────────────────────────────────────────
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

    // Site-specific brand containers
    const brandSel = [
      '[data-testid="brand-name"]',
      '[class*="product-brand"]',
      '[class*="brandName"]',
      '[itemprop="brand"]',
    ].join(',');
    const el = document.querySelector(brandSel);
    if (el?.innerText) return el.innerText.trim();

    return '';
  }

  // ── SKU ───────────────────────────────────────────────────────────────────
  function getSKU() {
    const fromLD = fromJsonLD(d => d?.sku || d?.mpn || null);
    if (fromLD) return String(fromLD);

    const bodyText = document.body.innerText;
    const m = bodyText.match(/(?:SKU|Cód\.?|Código|Referência|Ref\.?|Art\.?)[:\s#]*([A-Z0-9\-]{4,20})/i);
    return m ? m[1].trim() : '';
  }

  // ── Price ─────────────────────────────────────────────────────────────────
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

    // 4. Site-specific selectors (most-specific first)
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

  // ── Image ─────────────────────────────────────────────────────────────────
  function getBestImage() {
    // 1. og:image — canonical product image
    const og = document.querySelector('meta[property="og:image"]')?.content;
    if (og && !/logo|icon/.test(og.toLowerCase())) return og;

    // 2. JSON-LD image
    const ldImg = fromJsonLD(d => {
      if (typeof d?.image === 'string' && d.image) return d.image;
      if (d?.image?.url) return d.image.url;
      if (Array.isArray(d?.image) && d.image.length)
        return typeof d.image[0] === 'string' ? d.image[0] : (d.image[0]?.url || null);
      return null;
    });
    if (ldImg) return ldImg;

    // 3. Largest loaded image with sensible dimensions and aspect ratio
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

  // ─── Category auto-guess ──────────────────────────────────────────────────
  function guessCategory(name) {
    const n = (name || '').toLowerCase();
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

  // ─── Toast notification ──────────────────────────────────────────────────
  let toastTimer = null;
  function showToast(msg, type = 'ok') {
    toast.textContent = msg;
    toast.className = 'sa-toast-' + type;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { toast.className = ''; }, 3500);
  }

})();
