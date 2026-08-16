// extractor.js — Decorafit FF&E · Raspagem da página de produto
//
// ARQUIVO INJETADO NA PÁGINA. Não é um content script declarado no manifest:
// background.js o injeta sob demanda com chrome.scripting.executeScript.
//
// Por que existe: antes esta lógica estava duplicada entre content.js e
// popup.js (~300 linhas espelhadas) e as duas cópias já haviam divergido.
// Agora há uma implementação só, e os dois caminhos de captura (botão flutuante
// e botão "⊕ Capturar" do popup) passam pelo mesmo código.
//
// Roda no MUNDO PRINCIPAL da página (world: 'MAIN'). Isso é essencial: a
// leitura de preço da VTEX depende de window.__STATE__, que é uma variável da
// própria página e é INVISÍVEL do mundo isolado dos content scripts. A versão
// antiga rodava isolada, então esse fallback nunca funcionou de verdade.
//
// Consequência do mundo principal: nenhuma API chrome.* está disponível aqui.
// A função é puramente leitura de DOM e devolve um objeto serializável.
//
// O arquivo declara APENAS uma function declaration — reinjetá-lo é seguro
// (redeclarar função não gera erro, ao contrário de `const`) e não executa nada
// por si só.

function __decorafitExtract__() {
  'use strict';

  // Sem "www." para que comparações como host.includes('leroymerlin') funcionem
  // tanto em leroymerlin.com.br quanto em www.leroymerlin.com.br
  const host = location.hostname.replace(/^www\./, '');

  // ── Helper JSON-LD ─────────────────────────────────────────────────────────
  // Percorre todos os <script type="application/ld+json">, achata arrays e
  // @graph (padrão comum onde um script carrega várias entidades) e deixa o
  // chamador escolher o valor por callback.
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
      } catch {} // JSON-LD malformado é comum; ignora em silêncio
    }
    return null;
  }

  // ── Preço em formato brasileiro ────────────────────────────────────────────
  // "1.234,56" (ponto de milhar + vírgula decimal) e "199,90" viram floats.
  function parsePrice(str) {
    if (!str) return 0;
    const m = String(str).match(/[\d.,]+/);
    if (!m) return 0;
    const raw = m[0];
    if (/\d{1,3}(\.\d{3})+(,\d{2})?$/.test(raw))
      return parseFloat(raw.replace(/\./g, '').replace(',', '.'));
    if (raw.includes(','))
      return parseFloat(raw.replace(/\./g, '').replace(',', '.'));
    return parseFloat(raw) || 0;
  }

  // Primeiro elemento de `sel` que tem texto visível. querySelector puro
  // devolve o primeiro match mesmo quando é um <h1> vazio/oculto — comum em
  // páginas VTEX, onde um <h1> de layout pré-hidratação vem antes do título
  // real e produzia o bug "Produto não identificado".
  function firstText(sel) {
    for (const el of document.querySelectorAll(sel)) {
      const t = el.innerText && el.innerText.trim();
      if (t) return t;
    }
    return '';
  }

  // ── Preço via store Redux da VTEX ──────────────────────────────────────────
  // A VTEX (Leroy Merlin, Tok&Stok, ABC…) hidrata window.__STATE__ com os
  // dados do produto. Preços vêm em centavos nessa estrutura.
  function getVtexPrice() {
    try {
      const state = window.__STATE__;
      if (!state) return null;
      for (const key of Object.keys(state)) {
        const node = state[key];
        if (node?.selling?.price) return node.selling.price / 100;
        if (node?.spotPrice)      return node.spotPrice; // já em BRL em algumas versões
      }
    } catch {}
    return null;
  }

  // ── Nome ───────────────────────────────────────────────────────────────────
  // Seletor específico do site → og:title → <h1> → document.title.
  // Os seletores específicos vêm primeiro porque os genéricos às vezes pegam o
  // título da página inteira ("Leroy Merlin | Nome do Produto").
  function getName() {
    if (host.includes('leroymerlin')) {
      const t = firstText('[data-testid="product-name"], h1[class*="title"], h1[class*="product"]');
      if (t) return t;
    }
    if (host.includes('samsung')) {
      const t = firstText('.pd-title, h1[class*="title"], h1[class*="product"]');
      if (t) return t;
    }
    if (host.includes('electrolux') || host.includes('brastemp')) {
      const t = firstText('h1[class*="product"], h1[class*="name"], h1');
      if (t) return t;
    }
    if (host.includes('dexco') || host.includes('deca.')) {
      const t = firstText('h1[class*="product"], h1[class*="title"], h1');
      if (t) return t;
    }
    if (host.includes('abcdaconstrucao')) {
      // A ABC (VTEX) renderiza um selo de disponibilidade ("Retirada Disponível")
      // como <h1> próprio, que pode vir ANTES do <h1> do título. Tentamos os h1
      // qualificados por classe primeiro, removemos o texto do selo de cada
      // candidato e aceitamos o primeiro que ainda tenha conteúdo real.
      const strip = s => s
        .replace(/\s*retirada\s+dispon[íi]vel\s*/gi, '')
        .replace(/\s*entrega\s+dispon[íi]vel\s*/gi, '')
        .trim();
      for (const sel of ['h1[class*="product"]', 'h1[class*="title"]', 'h1']) {
        for (const el of document.querySelectorAll(sel)) {
          const cleaned = strip((el.innerText || '').trim());
          if (cleaned) return cleaned;
        }
      }
    }

    // og:title costuma ser o nome limpo, sem a marca da loja
    const og = document.querySelector('meta[property="og:title"]')?.content?.trim();
    if (og && og.length > 3) return og; // > 3 descarta placeholders tipo "N/A"

    const h1 = firstText('h1');
    if (h1) return h1;

    return document.title.split(/[|\-–·]/)[0].trim();
  }

  // ── Marca ──────────────────────────────────────────────────────────────────
  function getBrand() {
    const fromMeta = document.querySelector('meta[property="product:brand"]')?.content
      || document.querySelector('meta[itemprop="brand"]')?.content;
    if (fromMeta) return fromMeta.trim();

    const fromLD = fromJsonLD(d => {
      if (d?.brand?.name) return d.brand.name;                     // objeto schema.org Brand
      if (typeof d?.brand === 'string' && d.brand) return d.brand; // marca como string
      return null;
    });
    if (fromLD) return String(fromLD);

    const el = document.querySelector(
      '[data-testid="brand-name"], [class*="product-brand"], [class*="brandName"], [itemprop="brand"]'
    );
    if (el?.innerText) return el.innerText.trim();
    return '';
  }

  // ── SKU ────────────────────────────────────────────────────────────────────
  // mpn (part number do fabricante) costuma ser o mesmo que o SKU e é o campo
  // mais preenchido no JSON-LD dos varejistas brasileiros.
  function getSKU() {
    const fromLD = fromJsonLD(d => d?.sku || d?.mpn || null);
    if (fromLD) return String(fromLD);

    const m = document.body.innerText
      .match(/(?:SKU|Cód\.?|Código|Referência|Ref\.?|Art\.?)[:\s#]*([A-Z0-9\-]{4,20})/i);
    return m ? m[1].trim() : '';
  }

  // ── Preço ──────────────────────────────────────────────────────────────────
  // Cascata de 6 níveis; cada um só roda se o anterior falhou.
  function getPrice() {
    // 1. JSON-LD — menor preço entre todas as ofertas (páginas multi-vendedor)
    const ldPrice = fromJsonLD(d => {
      const offers = d?.offers || d?.Offers;
      if (!offers) return null;
      const arr = Array.isArray(offers) ? offers : [offers];
      const ps = arr
        .map(o => parseFloat(String(o?.price ?? o?.lowPrice ?? 0).replace(',', '.')))
        .filter(p => p > 0);
      return ps.length ? Math.min(...ps) : null;
    });
    if (ldPrice > 0) return ldPrice;

    // 2. Meta tag (Open Graph for Commerce)
    const metaP = document.querySelector('meta[property="product:price:amount"]')?.content;
    if (metaP) { const v = parseFloat(metaP.replace(',', '.')); if (v > 0) return v; }

    // 3. Store Redux da VTEX (só acessível porque rodamos no mundo principal)
    const vtex = getVtexPrice();
    if (vtex > 0) return vtex;

    // 4. Seletores CSS por loja
    const SITE_PRICE_SEL = {
      'telhanorte':      '.priceSpot, [class*="priceSpot"], [class*="price-spot"], .valoper__price',
      'obrafacil':       '.price-spot, .price__selling, [class*="sellingPrice"]',
      'abcdaconstrucao': '.price-spot, .product-price, [class*="sellingPrice"], [class*="price"]',
      'leroymerlin':     '[data-testid="price"], [class*="sellingPrice"], [class*="price__selling"]',
      'andra':           '.price, [class*="product-price"], [class*="sellingPrice"]',
      'inspirehome':     '.price, [class*="product-price"]',
      'yamamura':        '.price, [class*="product-price"], [class*="sellingPrice"]',
      'belametais':      '.price, [class*="product-price"]',
      'tokstok':         '[class*="spotPrice"], [class*="priceContainer"] .price',
      'westwing':        '[class*="ProductPrice"], [class*="price__selling"]',
      'boobam':          '.price, [class*="product-price"], [class*="sellingPrice"]',
      'camicado':        '[class*="spotPrice"], [class*="sellingPrice"]',
      'muma':            '.price, [class*="product-price"]',
      'dexco':           '.price, [class*="product-price"]',
      'deca.':           '.price, [class*="product-price"]',
      'electrolux':      '[class*="product-price"], [class*="price-info"], .price',
      'fastshop':        '[class*="bestPrice"], [class*="price-best"], .price',
      'brastemp':        '[class*="product-price"], [class*="price-info"], .price',
      'samsung':         '[class*="price-info"], [class*="pd-price"], [class*="price"]',
      'decorafit':       '.woocommerce-Price-amount, [class*="woocommerce-Price"], .price .amount',
    };
    for (const [key, sel] of Object.entries(SITE_PRICE_SEL)) {
      if (host.includes(key)) {
        const el = document.querySelector(sel);
        if (el) { const v = parsePrice(el.textContent); if (v > 0) return v; }
        break; // primeiro host que casa manda — não cai nas outras entradas
      }
    }

    // 5. WooCommerce genérico. Em faixas de preço ("R$X – R$Y") o primeiro
    //    match é o mínimo, que é o que queremos.
    const wcEl = document.querySelector('.woocommerce-Price-amount');
    if (wcEl) { const v = parsePrice(wcEl.textContent); if (v > 0) return v; }

    // 6. Varredura de nós de texto atrás de "R$ X". Páginas de produto repetem
    //    o preço em vários lugares (topo, barra fixa, área de compra); o valor
    //    mais frequente é quase sempre o preço real, e não frete ou parcela.
    //    Teto de R$ 500.000 descarta valores absurdos.
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

  // ── Imagem ─────────────────────────────────────────────────────────────────
  // og:image → JSON-LD → maior <img> visível.
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
    if (ldImg) return String(ldImg);

    // Varre <img>. Muitos sites usam lazy-load, então checamos data-attributes
    // antes de src. Filtros: área ≥ 150×150 (corta ícones), proporção entre
    // 0,4 e 2,5 (corta banners e faixas) e palavras-chave no nome do arquivo.
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

  // ── Unidade de medida ──────────────────────────────────────────────────────
  function getUnit() {
    const UNIT_WORDS = 'm²|m2|m³|m3|ml|un|pç|peça|cx|caixa|kg|litro|rolo|par|jogo|conjunto|metro linear|metro quadrado|metro';
    const body = document.body.innerText;
    const patterns = [
      new RegExp(`(?:vendido|venda|preço)\\s+(?:por|p\\/)\\s*(${UNIT_WORDS})`, 'i'),
      new RegExp(`(?:unidade\\s+de\\s+medida|und\\.?\\s*medida|un\\.?\\s*med\\.?)[:\\s]*(${UNIT_WORDS})`, 'i'),
      /\b\d+[.,]\d+\s*(m²|m2)\b/i,
    ];
    for (const re of patterns) {
      const m = body.match(re);
      if (m && m[1]) {
        const raw = m[1].trim().toLowerCase();
        const map = {
          'm2': 'm²', 'm3': 'm³', 'metro quadrado': 'm²',
          'metro linear': 'ml', 'peca': 'pç', 'peça': 'pç', 'caixa': 'cx'
        };
        return map[raw] || raw;
      }
    }
    const el = document.querySelector('[class*="unit"], [class*="unidade"], [data-unit]');
    if (el?.innerText) {
      const t = el.innerText.trim().toLowerCase();
      if (t.length < 20) return t;
    }
    return '';
  }

  // ── Categoria declarada pelo site ──────────────────────────────────────────
  // Devolve a string BRUTA; o mapeamento para os ids internos acontece fora da
  // página, em categories.js.
  function getSiteCategory() {
    const fromLD = fromJsonLD(d => {
      if (typeof d?.category === 'string' && d.category) return d.category;
      if (d?.['@type'] === 'BreadcrumbList' && Array.isArray(d?.itemListElement)) {
        const items = d.itemListElement.map(i => i?.item?.name || i?.name || '').filter(Boolean);
        // O ÚLTIMO item do breadcrumb é a página atual (o nome do produto), não
        // a categoria. O penúltimo é o segmento de categoria mais específico.
        if (items.length >= 2) return items[items.length - 2];
        if (items.length === 1) return items[0];
      }
      return null;
    });
    if (fromLD) return String(fromLD);

    const meta = document.querySelector('meta[property="product:category"]')?.content
      || document.querySelector('meta[name="product_type"]')?.content;
    if (meta) return meta;

    const nav = document.querySelector(
      'nav[aria-label*="readcrumb"], [class*="breadcrumb"], [class*="Breadcrumb"], ol[itemtype*="BreadcrumbList"]'
    );
    if (nav) {
      const segs = [...nav.querySelectorAll('a, li, span')]
        .map(el => el.textContent.trim())
        .filter(t => t.length > 2 && t.length < 60);
      if (segs.length >= 2) return segs[segs.length - 2]; // penúltimo = categoria
      if (segs.length === 1) return segs[0];
    }
    return '';
  }

  return {
    name:         getName(),
    brand:        getBrand(),
    sku:          getSKU(),
    price:        getPrice(),
    img:          getBestImage(),
    unit:         getUnit(),
    siteCategory: getSiteCategory(),
    dims:         '',
    url:          location.href
  };
}
