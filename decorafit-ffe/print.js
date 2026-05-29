// print.js — Decorafit FF&E
// Handles the print/export page: renders the product list for PDF printing
// and generates a formatted .xlsx spreadsheet from the same data.

// ─── PDF Print ───────────────────────────────────────────────────────────────

// Manifest V3 Content Security Policy blocks inline event handlers (onclick="…"),
// so we wire up all buttons here via addEventListener instead.
document.getElementById('printBtn').addEventListener('click', triggerPrint);
document.getElementById('backBtn').addEventListener('click', () => window.close());

// Waits for all images and fonts to settle before calling window.print(),
// so the PDF captures everything without blank image placeholders.
async function triggerPrint() {
  const btn = document.getElementById('printBtn');
  btn.textContent = '⏳ Preparando...';
  btn.disabled = true;

  // Collect every <img> on the page and wait for each to either load or error.
  // Promise.allSettled never rejects, so a broken image won't block printing.
  const imgs = [...document.querySelectorAll('img')];
  await Promise.allSettled(
    imgs.map(img => new Promise(resolve => {
      if (img.complete) { resolve(); return; }
      img.addEventListener('load',  resolve, { once: true });
      img.addEventListener('error', resolve, { once: true });
    }))
  );

  // document.fonts.ready resolves once all @font-face fonts have loaded.
  await document.fonts.ready;

  window.print();

  // The print dialog is synchronous on some browsers; give it a second before
  // re-enabling the button so the user can't double-trigger.
  setTimeout(() => {
    btn.textContent = '⬇ Salvar PDF';
    btn.disabled = false;
  }, 1000);
}

// ─── Categories ──────────────────────────────────────────────────────────────

// Canonical order and display labels for each product category.
// Used both for rendering sections in the PDF and for grouping rows in Excel.
const CATS = [
  { id: 'revestimentos',     label: 'Revestimentos' },
  { id: 'loucas-metais',     label: 'Louças e Metais' },
  { id: 'iluminacao',        label: 'Iluminação e Elétrica' },
  { id: 'eletros',           label: 'Eletros' },
  { id: 'moveis',            label: 'Móveis' },
  { id: 'decoracao-enxoval', label: 'Decoração e Enxoval' },
  { id: 'outros',            label: 'Outros' }
];

// Formats a number as Brazilian currency: R$ 1.234,56
function fmt(n) {
  return 'R$ ' + (n || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// Returns today's date in long Brazilian format: "18 de maio de 2026"
function fmtDate() {
  return new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' }).format(new Date());
}

// ─── PDF Render ───────────────────────────────────────────────────────────────

// Reads product data from chrome.storage.local and builds the full page DOM:
// header summaries, one section per category, and the grand total footer.
async function render() {
  const data = await chrome.storage.local.get(['products', 'projectName']);
  const products = data.products || [];
  const projectName = data.projectName || '';

  // Stamp today's date into the document header
  document.getElementById('docDate').textContent = fmtDate();

  // Show the project name bar, or hide it entirely if none was set
  if (projectName) {
    document.getElementById('projName').textContent = projectName;
  } else {
    document.getElementById('projectBar').style.display = 'none';
  }

  // Summary chips at the top: number of distinct products, total units, total value
  const totalUnits = products.reduce((s, p) => s + (p.qty || 1), 0);
  const totalValue = products.reduce((s, p) => s + (p.price || 0) * (p.qty || 1), 0);
  document.getElementById('sumProducts').textContent = products.length;
  document.getElementById('sumUnits').textContent = totalUnits;
  document.getElementById('sumTotal').textContent = fmt(totalValue);
  document.getElementById('grandTotal').textContent = fmt(totalValue);

  const sections = document.getElementById('sections');
  sections.innerHTML = '';

  if (products.length === 0) {
    const empty = document.createElement('div');
    empty.style.cssText = 'padding:40px;text-align:center;color:#7A6A60;font-size:14px';
    empty.textContent = 'Nenhum produto no orçamento. Feche esta aba e adicione produtos.';
    sections.appendChild(empty);
    return;
  }

  // Group products by their category id, preserving CATS order
  const grouped = {};
  CATS.forEach(c => { grouped[c.id] = []; });
  products.forEach(p => {
    const cat = p.category || 'outros';
    if (!grouped[cat]) grouped[cat] = [];
    grouped[cat].push(p);
  });

  // How many categories actually have items — used to decide whether to show subtotals
  const activeCats = CATS.filter(c => grouped[c.id]?.length > 0);

  CATS.forEach(cat => {
    const items = grouped[cat.id];
    if (!items || items.length === 0) return;

    const section = document.createElement('div');
    section.className = 'cat-section';

    // Category header row: colored label pill + horizontal rule + item count
    const catHeader = document.createElement('div');
    catHeader.className = 'cat-header';

    const labelEl = document.createElement('span');
    labelEl.className = 'cat-label ' + cat.id;
    labelEl.textContent = cat.label;

    const lineEl = document.createElement('div');
    lineEl.className = 'cat-line ' + cat.id;

    const countEl = document.createElement('span');
    countEl.className = 'cat-count';
    countEl.textContent = items.length + (items.length === 1 ? ' item' : ' itens');

    catHeader.append(labelEl, lineEl, countEl);

    // Column headings for the product table
    const tableHeader = document.createElement('div');
    tableHeader.className = 'table-header';
    tableHeader.innerHTML = '<div></div><div>Produto</div><div>Ambiente</div><div>Observações</div><div style="text-align:center">Qtd</div><div style="text-align:right">Subtotal</div>';

    section.append(catHeader, tableHeader);

    // Build and append one row per product, accumulating the category subtotal
    let catTotal = 0;
    items.forEach((p, idx) => {
      const row = buildProductRow(p, idx);
      catTotal += (p.price || 0) * (p.qty || 1);
      section.appendChild(row);
    });

    // Only render a per-category subtotal when there are multiple active categories;
    // with a single category the grand total is sufficient.
    if (activeCats.length > 1) {
      const subEl = document.createElement('div');
      subEl.className = 'cat-subtotal';
      const lbl = document.createElement('span');
      lbl.className = 'cat-sub-label';
      lbl.textContent = 'Subtotal ' + cat.label;
      const val = document.createElement('span');
      val.className = 'cat-sub-value';
      val.textContent = fmt(catTotal);
      subEl.append(lbl, val);
      section.appendChild(subEl);
    }

    sections.appendChild(section);
  });
}

// Builds a single product row element for the PDF table.
// Each row has five columns: image, product info, qty, unit price, subtotal.
function buildProductRow(p, idx) {
  const row = document.createElement('div');
  row.className = 'table-row';

  // Column A — product thumbnail or a fallback emoji placeholder
  const imgCell = document.createElement('div');
  if (p.img) {
    const img = document.createElement('img');
    img.className = 'prod-img';
    img.alt = p.name;
    img.src = p.img;
    // Replace broken images with a placeholder instead of showing a broken icon.
    // Using addEventListener avoids the inline onerror="" that MV3 CSP blocks.
    img.addEventListener('error', () => {
      const ph = document.createElement('div');
      ph.className = 'prod-img-ph';
      ph.textContent = '📦';
      img.replaceWith(ph);
    });
    imgCell.appendChild(img);
  } else {
    const ph = document.createElement('div');
    ph.className = 'prod-img-ph';
    ph.textContent = '📦';
    imgCell.appendChild(ph);
  }

  // Column B — product name + metadata line (brand · SKU · store link)
  const infoCell = document.createElement('div');
  const nameEl = document.createElement('div');
  nameEl.className = 'prod-name-print';
  nameEl.textContent = p.name;

  // Build the "brand · SKU" prefix; append a store link if a URL is available
  const metaParts = [];
  if (p.brand) metaParts.push(p.brand);
  if (p.sku)   metaParts.push('SKU ' + p.sku);

  const metaEl = document.createElement('div');
  metaEl.className = 'prod-meta-print';

  if (p.url && metaParts.length > 0) {
    metaEl.textContent = metaParts.join(' · ') + ' ';
    const link = document.createElement('a');
    link.href = p.url;
    link.target = '_blank';
    link.textContent = 'Ver na loja ↗';
    metaEl.appendChild(link);
  } else if (metaParts.length > 0) {
    metaEl.textContent = metaParts.join(' · ');
  } else if (p.url) {
    const link = document.createElement('a');
    link.href = p.url;
    link.target = '_blank';
    link.textContent = 'Ver na loja ↗';
    metaEl.appendChild(link);
  }

  infoCell.append(nameEl, metaEl);

  // Columns C, D, E — qty, unit price, subtotal
  const qtyCell = document.createElement('div');
  qtyCell.className = 'col-center';
  qtyCell.textContent = (p.qty || 1) + (p.unit ? ' ' + p.unit : '');

  const ambCell = document.createElement('div');
  ambCell.className = 'col-left';
  ambCell.style.fontSize = '11px';
  ambCell.textContent = p.ambiente || '';

  const obsCell = document.createElement('div');
  obsCell.className = 'col-left';
  obsCell.style.fontSize = '11px';
  obsCell.textContent = p.obs || '';

  const totalCell = document.createElement('div');
  totalCell.className = 'col-total';
  totalCell.textContent = fmt((p.price || 0) * (p.qty || 1));

  row.append(imgCell, infoCell, ambCell, obsCell, qtyCell, totalCell);
  return row;
}

render();

// ─── Excel Export (.xlsx) ────────────────────────────────────────────────────

// Triggers buildXLSX, creates a temporary <a> to download the blob, then cleans up.
document.getElementById('xlsxBtn').addEventListener('click', async () => {
  const btn = document.getElementById('xlsxBtn');
  btn.textContent = '⏳ Gerando arquivo...';
  btn.disabled = true;
  try {
    const { products = [], projectName = 'Orçamento' } =
      await chrome.storage.local.get(['products', 'projectName']);
    const blob = buildXLSX(products, projectName);
    // createObjectURL gives us a temporary URL pointing to the in-memory blob
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    // Sanitise the project name so it's a valid filename on all OSes
    a.download = projectName.replace(/[/\\?%*:|"<>]/g, '-') + '.xlsx';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url); // free the blob memory immediately after triggering download
  } catch (err) {
    console.error('xlsx export error:', err);
  } finally {
    btn.textContent = '📊 Salvar Excel';
    btn.disabled = false;
  }
});

// Builds a complete .xlsx file in memory and returns it as a Blob.
//
// An .xlsx file is a ZIP archive containing XML parts (OOXML spec).
// We implement only the minimum parts required by Excel:
//   [Content_Types].xml   — tells Excel what each file inside the ZIP is
//   _rels/.rels           — entry-point relationship to xl/workbook.xml
//   xl/workbook.xml       — lists the sheets
//   xl/_rels/workbook.xml.rels — points to sheet1.xml and styles.xml
//   xl/styles.xml         — all fonts, fills, borders and cell style combinations
//   xl/worksheets/sheet1.xml  — the actual cell data
//
// We write the ZIP from scratch (no library) to avoid bundling dependencies
// inside a Chrome extension.
function buildXLSX(products, projectName) {

  // ── Binary helpers ──────────────────────────────────────────────────────────

  // Encode a JS string to UTF-8 bytes (used for filenames and XML strings in the ZIP)
  const enc = s => new TextEncoder().encode(s);

  // Concatenate multiple Uint8Arrays into one
  const concat = arrs => {
    const out = new Uint8Array(arrs.reduce((s, a) => s + a.length, 0));
    let pos = 0; arrs.forEach(a => { out.set(a, pos); pos += a.length; });
    return out;
  };

  // Write a 16-bit little-endian integer (used in ZIP headers)
  const u16 = n => new Uint8Array([n & 0xFF, (n >> 8) & 0xFF]);

  // Write a 32-bit little-endian integer (used in ZIP headers and CRC fields)
  const u32 = n => { n = n >>> 0; return new Uint8Array([n & 0xFF, (n >>> 8) & 0xFF, (n >>> 16) & 0xFF, (n >>> 24) & 0xFF]); };

  // Escape special XML characters so cell values are safe inside XML text nodes
  const esc = s => String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');

  // ── CRC-32 ──────────────────────────────────────────────────────────────────
  // ZIP requires a CRC-32 checksum for every file entry.
  // We pre-compute the 256-entry lookup table once (standard Ethernet polynomial).

  const crcTab = (() => {
    const t = new Uint32Array(256);
    for (let i = 0; i < 256; i++) {
      let c = i; for (let j = 8; j--;) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
      t[i] = c;
    }
    return t;
  })();

  // Compute CRC-32 of a Uint8Array using the pre-built table
  const crc32 = buf => {
    let c = 0xFFFFFFFF;
    for (const b of buf) c = crcTab[(c ^ b) & 0xFF] ^ (c >>> 8);
    return (c ^ 0xFFFFFFFF) >>> 0;
  };

  // ── Minimal ZIP writer ───────────────────────────────────────────────────────
  // Produces a valid ZIP file containing all the OOXML parts.
  // Structure: [local file headers + data]… [central directory]… [EOCD record]
  // We use STORE compression (method 0) — XML compresses well but we avoid
  // implementing DEFLATE to keep the code simple.
  function zip(files) {
    const parts = [], centrals = [];
    let offset = 0; // running byte offset into the archive, needed by the central directory

    for (const [name, content] of files) {
      const nb   = enc(name);
      const data = typeof content === 'string' ? enc(content) : content;
      const crc  = crc32(data), sz = data.length;

      // Local file header (signature 0x04034B50) followed by the raw file data
      const local = concat([
        new Uint8Array([0x50,0x4B,0x03,0x04]), // local file header signature
        u16(20),         // version needed to extract (2.0)
        u16(0),          // general purpose bit flag
        u16(0),          // compression method: 0 = STORE
        u16(0), u16(0),  // last mod time / date (zeroed)
        u32(crc),        // CRC-32
        u32(sz),         // compressed size (= uncompressed for STORE)
        u32(sz),         // uncompressed size
        u16(nb.length),  // filename length
        u16(0),          // extra field length
        nb               // filename bytes
      ]);
      parts.push(local, data);

      // Central directory entry — mirrors the local header with an offset pointer
      centrals.push(concat([
        new Uint8Array([0x50,0x4B,0x01,0x02]), // central directory signature
        u16(20), u16(20),       // version made by / needed
        u16(0), u16(0), u16(0), // flags, compression, mod time
        u16(0),                 // mod date
        u32(crc), u32(sz), u32(sz),
        u16(nb.length), u16(0), u16(0), // filename len, extra len, comment len
        u16(0), u16(0),         // disk number start, internal attrs
        u32(0),                 // external file attributes
        u32(offset),            // offset of local header from start of archive
        nb
      ]));
      offset += local.length + sz;
    }

    // Central directory block followed by the End-of-Central-Directory record
    const cd = concat(centrals);
    const eocd = concat([
      new Uint8Array([0x50,0x4B,0x05,0x06]), // EOCD signature
      u16(0), u16(0),                  // disk number / disk with start of CD
      u16(files.length), u16(files.length), // entries on disk / total entries
      u32(cd.length),                  // size of central directory
      u32(offset),                     // offset of central directory
      u16(0)                           // comment length
    ]);

    return new Blob([concat([...parts, cd, eocd])], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    });
  }

  // ── Category label map ───────────────────────────────────────────────────────
  // Maps internal category ids (stored on each product) to display labels.
  // Must stay in sync with CATS above and the category ids used by content.js.
  const CATS_LABELS = {
    'revestimentos':     'Revestimentos',
    'loucas-metais':     'Louças e Metais',
    'iluminacao':        'Iluminação e Elétrica',
    'eletros':           'Eletros',
    'moveis':            'Móveis',
    'decoracao-enxoval': 'Decoração e Enxoval',
    'outros':            'Outros'
  };

  // Category → style index map for colored header rows
  const CAT_STYLES = {
    'revestimentos':22, 'loucas-metais':23, 'iluminacao':24, 'eletros':25,
    'moveis':26, 'decoracao-enxoval':27, 'outros':28
  };

  const cv = (v, t, s) => ({v, t, s});
  const rows = [];

  const imgRows      = new Set();
  const dataEven     = new Set();
  const dataOdd      = new Set();
  const subRows      = new Set();
  const catHeaderRows = new Set();
  const merges = [];

  // Row 1 — brand header (orange)
  merges.push(`A1:I1`);
  rows.push([cv('DECORAFIT', 's', 5)]);

  // Row 2 — doc type (dark blue)
  merges.push(`A2:I2`);
  rows.push([cv('SUGESTÃO DE ACABAMENTOS', 's', 17)]);

  // Row 3 — project name (light orange)
  merges.push(`A3:I3`);
  rows.push([cv(projectName || 'Orçamento', 's', 6)]);

  // Row 4 — blank
  rows.push([]);

  // Row 5 — summary cards
  const totalUnits = products.reduce((s, p) => s + (p.qty || 1), 0);
  const grandTotalVal = products.reduce((s, p) => s + (p.price || 0) * (p.qty || 1), 0);
  rows.push([
    cv('Produtos', 's', 18), cv(products.length, 'n', 19), cv('', 's', 18),
    cv('Unidades', 's', 18), cv(totalUnits, 'n', 19), cv('', 's', 18),
    cv('Total do Orçamento', 's', 20), cv(grandTotalVal, 'n', 21), cv('', 's', 20)
  ]);

  // Row 6 — blank
  rows.push([]);

  // Product rows grouped by category — mirrors PDF sections
  let grandTotal = 0;
  let pCounter = 0;

  for (const [catId, catLabel] of Object.entries(CATS_LABELS)) {
    const items = products
      .map((p, i) => ({p, i}))
      .filter(({p}) => (p.category || 'outros') === catId);
    if (!items.length) continue;

    // Category header row (colored, merged A:I)
    const catRowIdx = rows.length;
    catHeaderRows.add(catRowIdx);
    const catStyle = CAT_STYLES[catId] || 28;
    const cnt = items.length;
    merges.push(`A${catRowIdx+1}:I${catRowIdx+1}`);
    rows.push([cv(`${catLabel}  —  ${cnt} ${cnt === 1 ? 'item' : 'itens'}`, 's', catStyle)]);

    // Column headers (dark blue)
    rows.push([
      cv('','s',1), cv('Produto','s',1), cv('Marca','s',1),
      cv('Ambiente','s',1), cv('Observações','s',1), cv('Qtd','s',1),
      cv('Un.','s',1), cv('Subtotal','s',1), cv('URL','s',1)
    ]);

    let catTotal = 0;

    for (const {p} of items) {
      const rowIdx = rows.length;
      const odd = pCounter % 2 === 1;
      pCounter++;

      if (p.img) imgRows.add(rowIdx);
      if (odd) dataOdd.add(rowIdx); else dataEven.add(rowIdx);

      const ds = odd ? 8  : 7;
      const ns = odd ? 10 : 9;
      const us = odd ? 12 : 11;
      const qs = odd ? 16 : 15;

      const sub = (p.price || 0) * (p.qty || 1);
      catTotal += sub;

      rows.push([
        p.img ? cv(`IMAGE("${p.img}")`, 'f', ds) : cv('', 's', ds),
        cv(p.name||'',     's', ds),
        cv(p.brand||'',    's', ds),
        cv(p.ambiente||'', 's', ds),
        cv(p.obs||'',      's', ds),
        cv(p.qty||1,       'n', qs),
        cv(p.unit||'',     's', ds),
        cv(sub,            'n', ns),
        cv(p.url||'',      's', us)
      ]);
    }

    grandTotal += catTotal;

    const subIdx = rows.length;
    subRows.add(subIdx);
    rows.push([null,null,null,null,null,null,
      cv('Subtotal:', 's', 13),
      cv(catTotal,    'n', 14)
    ]);

    rows.push([]);
  }

  const totalIdx = rows.length;
  subRows.add(totalIdx);
  rows.push([null,null,null,null,null,null,
    cv('TOTAL GERAL:', 's', 13),
    cv(grandTotal,     'n', 14)
  ]);

  // ── Sheet XML ────────────────────────────────────────────────────────────────
  // Generates xl/worksheets/sheet1.xml — the core part of the workbook.

  const COLS = 'ABCDEFGHI'; // column letter lookup by 0-based index

  // Rows 0 and 1 (brand + project name) have fixed heights in points.
  // All other rows use the default height, except product image rows (ht=60).
  const fixedHeights = {
    0: ' ht="40" customHeight="1"',
    1: ' ht="26" customHeight="1"',
    2: ' ht="22" customHeight="1"'
  };

  let sheetXml =
    `<?xml version="1.0" encoding="UTF-8"?>` +
    `<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">` +
    `<sheetViews><sheetView showGridLines="0" workbookViewId="0"/></sheetViews>` +
    `<cols>` +
    `<col min="1" max="1" width="16" customWidth="1"/>` +
    `<col min="2" max="2" width="38" customWidth="1"/>` +
    `<col min="3" max="3" width="14" customWidth="1"/>` +
    `<col min="4" max="4" width="14" customWidth="1"/>` +
    `<col min="5" max="5" width="22" customWidth="1"/>` +
    `<col min="6" max="6" width="6"  customWidth="1"/>` +
    `<col min="7" max="7" width="8"  customWidth="1"/>` +
    `<col min="8" max="8" width="16" customWidth="1"/>` +
    `<col min="9" max="9" width="38" customWidth="1"/>` +
    `</cols><sheetData>`;

  rows.forEach((row, ri) => {
    // Determine row height: fixed for the two header rows, tall for image rows, default otherwise
    const isCatHdr = catHeaderRows.has(ri);
    const tall = fixedHeights[ri] ?? (imgRows.has(ri) ? ' ht="60" customHeight="1"' : (isCatHdr ? ' ht="24" customHeight="1"' : ''));

    const isData = dataEven.has(ri) || dataOdd.has(ri);
    const isSub  = subRows.has(ri);

    const numCols = (isData || isSub) ? 9 : row.length;

    if (!numCols) { sheetXml += `<row r="${ri+1}"${tall}/>`; return; }
    sheetXml += `<row r="${ri+1}"${tall}>`;

    for (let ci = 0; ci < numCols; ci++) {
      const cell = row[ci];
      const ref  = COLS[ci] + (ri + 1); // e.g. "C5"

      // Empty or absent cell — still emit it with a style so the border is visible
      if (!cell || cell.v === undefined || cell.v === null) {
        // Pick the appropriate fallback style for this row type
        const fallback = isSub ? 13 : (dataOdd.has(ri) ? 8 : (isData ? 7 : -1));
        if (fallback >= 0) sheetXml += `<c r="${ref}" s="${fallback}"/>`;
        continue;
      }

      // Cell has a value — emit the correct XML element for its type
      if (cell.v === '') {
        // Explicitly empty string — write a valueless cell so the style (border) still applies
        sheetXml += `<c r="${ref}" s="${cell.s}"/>`;
      } else if (cell.t === 'n') {
        // Numeric cell: <v> holds the raw number; the style's numFmt controls display
        sheetXml += `<c r="${ref}" s="${cell.s}"><v>${cell.v}</v></c>`;
      } else if (cell.t === 'f') {
        // Formula cell: <f> holds the formula text (e.g. IMAGE("url"))
        sheetXml += `<c r="${ref}" s="${cell.s}"><f>${esc(cell.v)}</f></c>`;
      } else {
        // Inline string: safer than shared strings for our use case (no shared-string table needed)
        sheetXml += `<c r="${ref}" t="inlineStr" s="${cell.s}"><is><t>${esc(cell.v)}</t></is></c>`;
      }
    }
    sheetXml += `</row>`;
  });

  sheetXml += `</sheetData>` +
    `<mergeCells count="${merges.length}">` +
    merges.map(m => `<mergeCell ref="${m}"/>`).join('') +
    `</mergeCells></worksheet>`;

  // ── OOXML namespace constants ────────────────────────────────────────────────
  const CT  = `http://schemas.openxmlformats.org/package/2006/content-types`;
  const PKG = `http://schemas.openxmlformats.org/package/2006/relationships`;
  const DOC = `http://schemas.openxmlformats.org/officeDocument/2006/relationships`;

  // ── Assemble and return the ZIP ──────────────────────────────────────────────
  return zip([

    // [Content_Types].xml — required by the OOXML spec; maps every file extension
    // and override path to its MIME-like content type so Excel knows how to parse each part.
    ['[Content_Types].xml',
      `<?xml version="1.0" encoding="UTF-8"?><Types xmlns="${CT}">` +
      `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>` +
      `<Default Extension="xml"  ContentType="application/xml"/>` +
      `<Override PartName="/xl/workbook.xml"          ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>` +
      `<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>` +
      `<Override PartName="/xl/styles.xml"            ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>` +
      `</Types>`],

    // _rels/.rels — the package entry point; points to the workbook as the main document
    ['_rels/.rels',
      `<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="${PKG}">` +
      `<Relationship Id="rId1" Type="${DOC}/officeDocument" Target="xl/workbook.xml"/>` +
      `</Relationships>`],

    // xl/workbook.xml — declares the single worksheet named "Orçamento"
    ['xl/workbook.xml',
      `<?xml version="1.0" encoding="UTF-8"?>` +
      `<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="${DOC}">` +
      `<sheets><sheet name="Orçamento" sheetId="1" r:id="rId1"/></sheets></workbook>`],

    // xl/_rels/workbook.xml.rels — links the workbook to its sheet and styles parts
    ['xl/_rels/workbook.xml.rels',
      `<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="${PKG}">` +
      `<Relationship Id="rId1" Type="${DOC}/worksheet" Target="worksheets/sheet1.xml"/>` +
      `<Relationship Id="rId2" Type="${DOC}/styles"    Target="styles.xml"/>` +
      `</Relationships>`],

    // xl/styles.xml — all formatting definitions.
    // Excel requires fonts, fills, and borders to be declared here; cells then reference
    // them by index through cellXfs (cell format) records.
    ['xl/styles.xml',
      `<?xml version="1.0" encoding="UTF-8"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">` +
      `<numFmts><numFmt numFmtId="164" formatCode="&quot;R$ &quot;#,##0.00"/></numFmts>` +
      `<fonts count="4">` +
      `<font><sz val="11"/><name val="Calibri"/></font>` +
      `<font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font>` +
      `<font><b/><sz val="11"/><name val="Calibri"/></font>` +
      `<font><b/><sz val="18"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font>` +
      `</fonts>` +
      `<fills count="13">` +
      `<fill><patternFill patternType="none"/></fill>` +
      `<fill><patternFill patternType="gray125"/></fill>` +
      `<fill><patternFill patternType="solid"><fgColor rgb="FFFF6633"/></patternFill></fill>` +
      `<fill><patternFill patternType="solid"><fgColor rgb="FFFFF0E8"/></patternFill></fill>` +
      `<fill><patternFill patternType="solid"><fgColor rgb="FFF5F0EE"/></patternFill></fill>` +
      `<fill><patternFill patternType="solid"><fgColor rgb="FF181F39"/></patternFill></fill>` +
      `<fill><patternFill patternType="solid"><fgColor rgb="FFCC4E1A"/></patternFill></fill>` +
      `<fill><patternFill patternType="solid"><fgColor rgb="FF5E6979"/></patternFill></fill>` +
      `<fill><patternFill patternType="solid"><fgColor rgb="FFAA9C79"/></patternFill></fill>` +
      `<fill><patternFill patternType="solid"><fgColor rgb="FF607080"/></patternFill></fill>` +
      `<fill><patternFill patternType="solid"><fgColor rgb="FF8D6E63"/></patternFill></fill>` +
      `<fill><patternFill patternType="solid"><fgColor rgb="FF8E9A6A"/></patternFill></fill>` +
      `<fill><patternFill patternType="solid"><fgColor rgb="FF9AA09A"/></patternFill></fill>` +
      `</fills>` +
      `<borders count="3">` +
      `<border><left/><right/><top/><bottom/><diagonal/></border>` +
      `<border><left/><right/><top/><bottom style="thin"><color rgb="FFD0D0D0"/></bottom><diagonal/></border>` +
      `<border><left/><right/><top/><bottom style="medium"><color rgb="FFFF6633"/></bottom><diagonal/></border>` +
      `</borders>` +
      `<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>` +
      `<cellXfs count="29">` +
      `<xf numFmtId="0"   fontId="0" fillId="0" borderId="0" xfId="0"/>` +
      `<xf numFmtId="0"   fontId="1" fillId="5" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1"><alignment horizontal="center" wrapText="1"/></xf>` +
      `<xf numFmtId="0"   fontId="2" fillId="0" borderId="0" xfId="0" applyFont="1"/>` +
      `<xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>` +
      `<xf numFmtId="0"   fontId="0" fillId="0" borderId="0" xfId="0"><alignment wrapText="1" vertical="top"/></xf>` +
      `<xf numFmtId="0"   fontId="3" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"><alignment horizontal="center" vertical="center"/></xf>` +
      `<xf numFmtId="0"   fontId="2" fillId="3" borderId="0" xfId="0" applyFont="1" applyFill="1"><alignment horizontal="center" vertical="center"/></xf>` +
      `<xf numFmtId="0"   fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1"/>` +
      `<xf numFmtId="0"   fontId="0" fillId="4" borderId="1" xfId="0" applyFill="1" applyBorder="1"/>` +
      `<xf numFmtId="164" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyBorder="1"/>` +
      `<xf numFmtId="164" fontId="0" fillId="4" borderId="1" xfId="0" applyNumberFormat="1" applyFill="1" applyBorder="1"/>` +
      `<xf numFmtId="0"   fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1"><alignment wrapText="1" vertical="top"/></xf>` +
      `<xf numFmtId="0"   fontId="0" fillId="4" borderId="1" xfId="0" applyFill="1" applyBorder="1"><alignment wrapText="1" vertical="top"/></xf>` +
      `<xf numFmtId="0"   fontId="2" fillId="0" borderId="2" xfId="0" applyFont="1" applyBorder="1"/>` +
      `<xf numFmtId="164" fontId="2" fillId="0" borderId="2" xfId="0" applyFont="1" applyNumberFormat="1" applyBorder="1"/>` +
      `<xf numFmtId="1"   fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyBorder="1"/>` +
      `<xf numFmtId="1"   fontId="0" fillId="4" borderId="1" xfId="0" applyNumberFormat="1" applyFill="1" applyBorder="1"/>` +
      `<xf numFmtId="0"   fontId="1" fillId="5" borderId="0" xfId="0" applyFont="1" applyFill="1"><alignment horizontal="center" vertical="center"/></xf>` +
      `<xf numFmtId="0"   fontId="0" fillId="3" borderId="0" xfId="0" applyFill="1"><alignment vertical="center"/></xf>` +
      `<xf numFmtId="0"   fontId="2" fillId="3" borderId="0" xfId="0" applyFont="1" applyFill="1"><alignment horizontal="center" vertical="center"/></xf>` +
      `<xf numFmtId="0"   fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"><alignment vertical="center"/></xf>` +
      `<xf numFmtId="164" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1" applyNumberFormat="1"><alignment vertical="center"/></xf>` +
      `<xf numFmtId="0"   fontId="1" fillId="6" borderId="0" xfId="0" applyFont="1" applyFill="1"><alignment vertical="center"/></xf>` +
      `<xf numFmtId="0"   fontId="1" fillId="7" borderId="0" xfId="0" applyFont="1" applyFill="1"><alignment vertical="center"/></xf>` +
      `<xf numFmtId="0"   fontId="1" fillId="8" borderId="0" xfId="0" applyFont="1" applyFill="1"><alignment vertical="center"/></xf>` +
      `<xf numFmtId="0"   fontId="1" fillId="9" borderId="0" xfId="0" applyFont="1" applyFill="1"><alignment vertical="center"/></xf>` +
      `<xf numFmtId="0"   fontId="1" fillId="10" borderId="0" xfId="0" applyFont="1" applyFill="1"><alignment vertical="center"/></xf>` +
      `<xf numFmtId="0"   fontId="1" fillId="11" borderId="0" xfId="0" applyFont="1" applyFill="1"><alignment vertical="center"/></xf>` +
      `<xf numFmtId="0"   fontId="1" fillId="12" borderId="0" xfId="0" applyFont="1" applyFill="1"><alignment vertical="center"/></xf>` +
      `</cellXfs></styleSheet>`],

    // xl/worksheets/sheet1.xml — the sheet data built above
    ['xl/worksheets/sheet1.xml', sheetXml],
  ]);
}
