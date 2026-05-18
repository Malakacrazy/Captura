// content.js v3 — Decorafit FF&E · Floating capture button
//
// This script is injected into every page the user visits (declared in manifest.json
// under content_scripts). Its sole job is to add a floating "Orçamento" button that,
// when clicked, scrapes the current product page and saves the data to chrome.storage.

// Wrap everything in an IIFE to avoid polluting the host page's global scope.
// Any variable declared here is invisible to the page's own JavaScript.
(function () {
  'use strict';

  // Guard against duplicate injection — can happen on SPA navigation events
  // when Chrome re-runs content scripts without a full page reload.
  if (document.getElementById('sa-fab')) return;

  // ─── Floating Action Button ───────────────────────────────────────────────

  const fab = document.createElement('button');
  fab.id = 'sa-fab'; // styled in content.css; id is also used as the injection guard above
  fab.setAttribute('aria-label', 'Adicionar ao Orçamento Decorafit');
  // Inline SVG "+" icon — avoids a network request and is immune to CSP image-src policies
  fab.innerHTML = `
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round">
      <path d="M12 5v14M5 12h14"/>
    </svg>
    <span>Orçamento</span>
  `;

  // Toast notification element — hidden by default via CSS (opacity:0), revealed by class
  const toast = document.createElement('div');
  toast.id = 'sa-toast';

  document.body.append(fab, toast);

  // ─── Click handler ────────────────────────────────────────────────────────

  fab.addEventListener('click', async () => {
    // Enter loading state — disables pointer events (CSS) and shows feedback text
    fab.classList.add('loading');
    fab.querySelector('span').textContent = 'Capturando…';

    try {
      const product = await extractProduct();

      // If no product name was found, the page is likely not a product page
      if (!product.name) {
        showToast('⚠ Produto não identificado nesta página.', 'warn');
        return;
      }

      // Append the captured product to the existing list in storage.
      // We read-then-write instead of just writing to avoid clobbering
      // products added by another tab or the popup in the meantime.
      const storage = await chrome.storage.local.get('products');
      const products = storage.products || [];
      products.push(product);
      await chrome.storage.local.set({ products });

      // Truncate the name in the toast so it doesn't overflow
      showToast(`✓ Adicionado: ${product.name.substring(0, 48)}`, 'ok');
    } catch (e) {
      showToast('⚠ Erro ao capturar. Tente adicionar manualmente.', 'warn');
    } finally {
      // Always restore the button regardless of success or failure
      fab.classList.remove('loading');
      fab.querySelector('span').textContent = 'Orçamento';
    }
  });

  // ─── Product extraction ───────────────────────────────────────────────────

  // Orchestrates all the individual scrapers and assembles the product object.
  // Date.now() is used as a unique id — good enough since captures are user-triggered.
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

  // ── JSON-LD helper ────────────────────────────────────────────────────────
  // Most e-commerce sites embed structured product data in <script type="application/ld+json">
  // blocks. This helper parses all of them, flattens @graph arrays (a common JSON-LD
  // pattern where a single script contains multiple entities), and lets callers pick
  // a value via a callback rather than duplicating the traversal logic.
  function fromJsonLD(pick) {
    for (const s of document.querySelectorAll('script[type="application/ld+json"]')) {
      try {
        const root = JSON.parse(s.textContent);
        const nodes = [];
        // Recursively unwrap arrays and @graph so every entity ends up in nodes[]
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
          // Return the first non-null, non-empty value found across all scripts
          if (v !== null && v !== undefined && v !== '') return v;
        }
      } catch {} // malformed JSON-LD is common; skip silently
    }
    return null;
  }

  // ── Brazilian price parser ────────────────────────────────────────────────
  // Brazilian sites use two formats:
  //   "1.234,56" — thousands dot, decimal comma (standard BR)
  //   "1234,56"  — no thousands separator, decimal comma
  // Both must be converted to the JS float "1234.56".
  function parsePrice(str) {
    if (!str) return 0;
    const m = str.match(/[\d.,]+/);
    if (!m) return 0;
    const raw = m[0];
    // Pattern "\d{1,3}(\.\d{3})+" matches "1.234" style — dots are thousands separators
    if (/\d{1,3}(\.\d{3})+(,\d{2})?$/.test(raw))
      return parseFloat(raw.replace(/\./g, '').replace(',', '.'));
    // Otherwise the comma is the decimal separator (e.g. "199,90")
    if (raw.includes(','))
      return parseFloat(raw.replace(/\./g, '').replace(',', '.'));
    return parseFloat(raw) || 0;
  }

  // ── VTEX price fallback ───────────────────────────────────────────────────
  // VTEX is the dominant e-commerce platform in Brazil (Leroy Merlin, Tok&Stok, etc.).
  // It hydrates a global window.__STATE__ object with Redux store data including prices.
  // Prices in __STATE__ are stored as integers in cents (divide by 100 to get BRL).
  function getVtexPrice() {
    try {
      const state = window.__STATE__;
      if (!state) return null;
      for (const key of Object.keys(state)) {
        const node = state[key];
        if (node?.selling?.price) return node.selling.price / 100;
        if (node?.spotPrice)      return node.spotPrice; // already in BRL on some versions
      }
    } catch {}
    return null;
  }

  // Strip "www." so host comparisons like host.includes('leroymerlin') work
  // regardless of whether the user is on leroymerlin.com or www.leroymerlin.com
  const host = location.hostname.replace(/^www\./, '');

  // ── Name scraper ──────────────────────────────────────────────────────────
  // Priority: site-specific selectors → og:title meta → <h1> → document.title
  // Site-specific selectors come first because generic fallbacks sometimes pick
  // up page titles (e.g. "Leroy Merlin | Product Name") instead of just the name.
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

    // og:title is usually the clean product name without site branding
    const og = document.querySelector('meta[property="og:title"]')?.content?.trim();
    if (og && og.length > 3) return og; // length > 3 guards against placeholder "N/A" values

    const h1 = document.querySelector('h1');
    if (h1) return h1.innerText.trim();

    // Last resort: split document.title on common separators and take the first segment
    return document.title.split(/[|\-–·]/)[0].trim();
  }

  // ── Brand scraper ─────────────────────────────────────────────────────────
  // Priority: Open Graph / microdata meta → JSON-LD → DOM selector
  function getBrand() {
    const fromMeta = document.querySelector('meta[property="product:brand"]')?.content
      || document.querySelector('meta[itemprop="brand"]')?.content;
    if (fromMeta) return fromMeta.trim();

    const fromLD = fromJsonLD(d => {
      if (d?.brand?.name) return d.brand.name;            // schema.org Brand object
      if (typeof d?.brand === 'string' && d.brand) return d.brand; // plain string brand
      return null;
    });
    if (fromLD) return fromLD;

    // Common DOM patterns across VTEX and custom storefronts
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

  // ── SKU scraper ───────────────────────────────────────────────────────────
  // mpn (Manufacturer Part Number) is often the same as SKU and is the more
  // commonly populated field in JSON-LD for Brazilian retailers.
  function getSKU() {
    const fromLD = fromJsonLD(d => d?.sku || d?.mpn || null);
    if (fromLD) return String(fromLD);

    // Scan visible page text for common Brazilian SKU label patterns
    const bodyText = document.body.innerText;
    const m = bodyText.match(/(?:SKU|Cód\.?|Código|Referência|Ref\.?|Art\.?)[:\s#]*([A-Z0-9\-]{4,20})/i);
    return m ? m[1].trim() : '';
  }

  // ── Price scraper ─────────────────────────────────────────────────────────
  // Five-tier fallback strategy — each tier is tried only if the previous failed:
  //   1. JSON-LD offers — most reliable, site-independent
  //   2. product:price:amount meta tag — common on VTEX and Shopify
  //   3. VTEX window.__STATE__ — for sites that don't expose price in JSON-LD
  //   4. Site-specific CSS selectors — targeted for each known store
  //   5. TreeWalker text scan — last resort; picks the most-frequent "R$ X" value
  function getPrice() {
    // 1. JSON-LD: pick the lowest price across all offer objects
    //    (handles multi-seller pages where several prices may be listed)
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

    // 2. Meta tag (Open Graph for Commerce)
    const metaP = document.querySelector('meta[property="product:price:amount"]')?.content;
    if (metaP) { const v = parseFloat(metaP.replace(',', '.')); if (v > 0) return v; }

    // 3. VTEX Redux store
    const vtex = getVtexPrice();
    if (vtex && vtex > 0) return vtex;

    // 4. Site-specific selectors, keyed by hostname fragment
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
        break; // stop after the first matching host — don't fall through to other entries
      }
    }

    // 5. Walk every text node in the body looking for "R$ X" patterns.
    //    Product pages often repeat the price in multiple places (header, sticky bar,
    //    add-to-cart area). We collect all values and return the most frequent one,
    //    which is almost always the actual product price rather than a shipping fee or
    //    instalment amount. Cap at R$ 500,000 to discard absurd values.
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
      // Sort entries by frequency descending and return the most common price
      return parseFloat(Object.entries(freq).sort((a, b) => b[1] - a[1])[0][0]);
    }

    return 0;
  }

  // ── Image scraper ─────────────────────────────────────────────────────────
  // Priority: og:image → JSON-LD → largest visible <img>
  function getBestImage() {
    // og:image is the canonical share image — almost always the hero product photo
    const og = document.querySelector('meta[property="og:image"]')?.content;
    if (og && !/logo|icon/.test(og.toLowerCase())) return og;

    // JSON-LD image can be a string URL, an ImageObject, or an array of either
    const ldImg = fromJsonLD(d => {
      if (typeof d?.image === 'string' && d.image) return d.image;
      if (d?.image?.url) return d.image.url;
      if (Array.isArray(d?.image) && d.image.length)
        return typeof d.image[0] === 'string' ? d.image[0] : (d.image[0]?.url || null);
      return null;
    });
    if (ldImg) return ldImg;

    // Fall back to scanning all <img> elements.
    // Many sites lazy-load images: check multiple data attributes before src.
    // Filter rules:
    //   area >= 150×150  — eliminates small icons and decorative elements
    //   aspect ratio 0.4–2.5  — eliminates tall banners and wide strip graphics
    //   filename keywords  — eliminates logos, sprites, avatars, etc.
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
      .sort((a, b) => b.area - a.area); // largest first

    return candidates[0]?.src || '';
  }

  // ─── Category auto-detection ──────────────────────────────────────────────
  // Matches product names against keyword lists to guess the FF&E category.
  // Returns 'outros' when no keyword matches — a safe fallback the user can override.
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

  // ─── Toast notification ───────────────────────────────────────────────────
  // Replaces className entirely (instead of toggling) so switching from 'ok' to 'warn'
  // removes the previous state class in one operation. The CSS transition on opacity
  // handles the animated reveal; removing all classes hides it after the timer fires.
  let toastTimer = null;
  function showToast(msg, type = 'ok') {
    toast.textContent = msg;
    toast.className = 'sa-toast-' + type;
    clearTimeout(toastTimer); // cancel any in-progress hide from a previous toast
    toastTimer = setTimeout(() => { toast.className = ''; }, 3500);
  }

})();
