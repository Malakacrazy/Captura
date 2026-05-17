// content.js v2 — Studio Araci FF&E · Floating capture button

(function () {
  'use strict';

  // Only inject once
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

      // Load current list, append, save
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
    const name  = getName();
    const brand = getBrand();
    const sku   = getSKU();
    const price = getPrice();
    const img   = getBestImage();
    const dims  = '';
    const url   = window.location.href;
    const id    = Date.now();
    const qty   = 1;
    const category = ''; // guessed in popup.js

    return { id, name, brand, sku, price, img, dims, url, qty, category };
  }

  // ── Name ──────────────────────────────────────────────────────────────────
  function getName() {
    // OG title is usually the clean product name
    const og = document.querySelector('meta[property="og:title"]')?.content?.trim();
    if (og && og.length > 4) return og;

    const h1 = document.querySelector('h1');
    if (h1) return h1.innerText.trim();

    return document.title.split(/[|\-–]/)[0].trim();
  }

  // ── Brand ─────────────────────────────────────────────────────────────────
  function getBrand() {
    const fromMeta = document.querySelector('meta[property="product:brand"]')?.content
      || document.querySelector('meta[itemprop="brand"]')?.content;
    if (fromMeta) return fromMeta.trim();

    const fromLD = fromJsonLD(d => d?.brand?.name || (typeof d?.brand === 'string' ? d.brand : null));
    if (fromLD) return fromLD;

    return '';
  }

  // ── SKU ───────────────────────────────────────────────────────────────────
  function getSKU() {
    const fromLD = fromJsonLD(d => d?.sku || d?.mpn || null);
    if (fromLD) return String(fromLD);

    const bodyText = document.body.innerText;
    const match = bodyText.match(/(?:SKU|Cód\.?|Código|Referência|Ref\.?)[:\s#]*([A-Z0-9\-]{4,20})/i);
    return match ? match[1].trim() : '';
  }

  // ── Price ─────────────────────────────────────────────────────────────────
  function getPrice() {
    // 1. JSON-LD offers — most reliable
    const ldPrice = fromJsonLD(d => {
      const offer = d?.offers || d?.Offers;
      if (!offer) return null;
      const arr = Array.isArray(offer) ? offer : [offer];
      for (const o of arr) {
        const p = o.price || o.lowPrice;
        if (p !== undefined && p !== null) return parseFloat(String(p).replace(',', '.'));
      }
      return null;
    });
    if (ldPrice && ldPrice > 0) return ldPrice;

    // 2. Meta product price
    const metaP = document.querySelector('meta[property="product:price:amount"]')?.content;
    if (metaP) {
      const v = parseFloat(metaP.replace(',', '.'));
      if (v > 0) return v;
    }

    // 3. Walk text nodes for "R$ X"
    const prices = [];
    const walk = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    let node;
    while ((node = walk.nextNode())) {
      const text = node.textContent;
      const match = text.match(/R\$\s*([\d.,]+)/);
      if (match) {
        // Normalize: "1.234,56" → 1234.56  |  "1234.56" → 1234.56
        const raw = match[1];
        let val;
        if (/\d{1,3}(\.\d{3})+(,\d{2})?$/.test(raw)) {
          // Brazilian format: 1.234,56
          val = parseFloat(raw.replace(/\./g, '').replace(',', '.'));
        } else {
          val = parseFloat(raw.replace(',', '.'));
        }
        if (val > 0 && val < 500000) prices.push(val);
      }
    }

    // Prefer the most-seen price value (likely the actual product price)
    if (prices.length > 0) {
      const freq = {};
      prices.forEach(v => freq[v] = (freq[v] || 0) + 1);
      return parseFloat(Object.entries(freq).sort((a, b) => b[1] - a[1])[0][0]);
    }

    return 0;
  }

  // ── Image ─────────────────────────────────────────────────────────────────
  // Fix #3: og:image is the most reliable canonical product image.
  // We also filter by aspect ratio and size to avoid grabbing icons/sprites.
  function getBestImage() {
    // 1. og:image — canonical, usually high quality
    const og = document.querySelector('meta[property="og:image"]')?.content;
    if (og) return og;

    // 2. JSON-LD image
    const ldImg = fromJsonLD(d => {
      if (typeof d?.image === 'string') return d.image;
      if (d?.image?.url) return d.image.url;
      if (Array.isArray(d?.image)) return d.image[0];
      return null;
    });
    if (ldImg) return ldImg;

    // 3. Largest img element with good aspect ratio
    const candidates = [...document.images]
      .filter(img => {
        const w = img.naturalWidth, h = img.naturalHeight;
        if (w < 150 || h < 150) return false;
        // Filter obvious non-product images by URL patterns
        const src = (img.src + img.dataset.src || '').toLowerCase();
        if (/logo|icon|sprite|banner|badge|avatar|header|footer|svg/.test(src)) return false;
        // Reasonable aspect ratio (not extremely wide banners or very tall)
        const ratio = w / h;
        return ratio >= 0.4 && ratio <= 2.5;
      })
      .sort((a, b) => (b.naturalWidth * b.naturalHeight) - (a.naturalWidth * a.naturalHeight));

    return candidates[0]?.src || '';
  }

  // ── JSON-LD helper ────────────────────────────────────────────────────────
  function fromJsonLD(extractor) {
    const scripts = document.querySelectorAll('script[type="application/ld+json"]');
    for (const script of scripts) {
      try {
        const parsed = JSON.parse(script.textContent);
        const items = Array.isArray(parsed) ? parsed : [parsed];
        for (const item of items) {
          const result = extractor(item);
          if (result !== null && result !== undefined) return result;
          // Also check @graph
          if (item['@graph']) {
            for (const node of item['@graph']) {
              const r = extractor(node);
              if (r !== null && r !== undefined) return r;
            }
          }
        }
      } catch {}
    }
    return null;
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
