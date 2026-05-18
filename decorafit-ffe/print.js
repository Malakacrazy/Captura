// print.js v2 — Decorafit FF&E

// ─── Fix #1: Event listeners instead of inline onclick ─────────────────────
// (Manifest V3 CSP blocks inline handlers — this is why "Salvar PDF" didn't work)

document.getElementById('printBtn').addEventListener('click', triggerPrint);
document.getElementById('backBtn').addEventListener('click', () => window.close());

async function triggerPrint() {
  const btn = document.getElementById('printBtn');
  btn.textContent = '⏳ Preparando...';
  btn.disabled = true;

  // Wait for all images to settle (load or error)
  const imgs = [...document.querySelectorAll('img')];
  await Promise.allSettled(
    imgs.map(img => new Promise(resolve => {
      if (img.complete) { resolve(); return; }
      img.addEventListener('load',  resolve, { once: true });
      img.addEventListener('error', resolve, { once: true });
    }))
  );

  // Give fonts a beat
  await document.fonts.ready;

  window.print();

  // Reset button after print dialog closes
  setTimeout(() => {
    btn.textContent = '⬇ Salvar PDF';
    btn.disabled = false;
  }, 1000);
}

// ─── Categories config ─────────────────────────────────────────────────────

const CATS = [
  { id: 'revestimentos',     label: 'Revestimentos' },
  { id: 'loucas-metais',     label: 'Louças e Metais' },
  { id: 'iluminacao',        label: 'Iluminação' },
  { id: 'eletros',           label: 'Eletros' },
  { id: 'moveis',            label: 'Móveis' },
  { id: 'decoracao-enxoval', label: 'Decoração e Enxoval' },
  { id: 'outros',            label: 'Outros' }
];

function fmt(n) {
  return 'R$ ' + (n || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtDate() {
  return new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' }).format(new Date());
}

// ─── Render ────────────────────────────────────────────────────────────────

async function render() {
  const data = await chrome.storage.local.get(['products', 'projectName']);
  const products = data.products || [];
  const projectName = data.projectName || '';

  // Date
  document.getElementById('docDate').textContent = fmtDate();

  // Project
  if (projectName) {
    document.getElementById('projName').textContent = projectName;
  } else {
    document.getElementById('projectBar').style.display = 'none';
  }

  // Totals
  const totalUnits = products.reduce((s, p) => s + (p.qty || 1), 0);
  const totalValue = products.reduce((s, p) => s + (p.price || 0) * (p.qty || 1), 0);
  document.getElementById('sumProducts').textContent = products.length;
  document.getElementById('sumUnits').textContent = totalUnits;
  document.getElementById('sumTotal').textContent = fmt(totalValue);
  document.getElementById('grandTotal').textContent = fmt(totalValue);

  // Sections grouped by category
  const sections = document.getElementById('sections');
  sections.innerHTML = '';

  if (products.length === 0) {
    const empty = document.createElement('div');
    empty.style.cssText = 'padding:40px;text-align:center;color:#7A6A60;font-size:14px';
    empty.textContent = 'Nenhum produto no orçamento. Feche esta aba e adicione produtos.';
    sections.appendChild(empty);
    return;
  }

  // Group products by category
  const grouped = {};
  CATS.forEach(c => { grouped[c.id] = []; });
  products.forEach(p => {
    const cat = p.category || 'outros';
    if (!grouped[cat]) grouped[cat] = [];
    grouped[cat].push(p);
  });

  // Render each category that has products
  CATS.forEach(cat => {
    const items = grouped[cat.id];
    if (!items || items.length === 0) return;

    const section = document.createElement('div');
    section.className = 'cat-section';

    // Category header
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

    // Table header
    const tableHeader = document.createElement('div');
    tableHeader.className = 'table-header';
    tableHeader.innerHTML = '<div></div><div>Produto</div><div style="text-align:center">Qtd</div><div style="text-align:right">Preço Unit.</div><div style="text-align:right">Subtotal</div>';

    section.append(catHeader, tableHeader);

    // Product rows
    let catTotal = 0;
    items.forEach((p, idx) => {
      const row = buildProductRow(p, idx);
      catTotal += (p.price || 0) * (p.qty || 1);
      section.appendChild(row);
    });

    // Category subtotal (only if multiple categories exist)
    const activeCats = CATS.filter(c => grouped[c.id]?.length > 0);
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

function buildProductRow(p, idx) {
  const row = document.createElement('div');
  row.className = 'table-row';

  // Image cell
  const imgCell = document.createElement('div');
  if (p.img) {
    const img = document.createElement('img');
    img.className = 'prod-img';
    img.alt = p.name;
    img.src = p.img;
    // Fix #3: Handle image errors properly (no inline onerror)
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

  // Product info cell
  const infoCell = document.createElement('div');
  const nameEl = document.createElement('div');
  nameEl.className = 'prod-name-print';
  nameEl.textContent = p.name;

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

  // Qty
  const qtyCell = document.createElement('div');
  qtyCell.className = 'col-center';
  qtyCell.textContent = p.qty || 1;

  // Unit price
  const unitCell = document.createElement('div');
  unitCell.className = 'col-right';
  unitCell.textContent = fmt(p.price || 0);

  // Subtotal
  const totalCell = document.createElement('div');
  totalCell.className = 'col-total';
  totalCell.textContent = fmt((p.price || 0) * (p.qty || 1));

  row.append(imgCell, infoCell, qtyCell, unitCell, totalCell);
  return row;
}

render();

// ─── Export XLSX ─────────────────────────────────────────────────────────────

document.getElementById('xlsxBtn').addEventListener('click', async () => {
  const btn = document.getElementById('xlsxBtn');
  btn.textContent = '⏳ Gerando arquivo...';
  btn.disabled = true;
  try {
    const { products = [], projectName = 'Orçamento' } =
      await chrome.storage.local.get(['products', 'projectName']);
    const blob = buildXLSX(products, projectName);
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = projectName.replace(/[/\\?%*:|"<>]/g, '-') + '.xlsx';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  } catch (err) {
    console.error('xlsx export error:', err);
  } finally {
    btn.textContent = '📊 Salvar Excel';
    btn.disabled = false;
  }
});

function buildXLSX(products, projectName) {
  // ── Binary helpers ──────────────────────────────────────────────────────────
  const enc = s => new TextEncoder().encode(s);
  const concat = arrs => {
    const out = new Uint8Array(arrs.reduce((s, a) => s + a.length, 0));
    let pos = 0; arrs.forEach(a => { out.set(a, pos); pos += a.length; });
    return out;
  };
  const u16 = n => new Uint8Array([n & 0xFF, (n >> 8) & 0xFF]);
  const u32 = n => { n = n >>> 0; return new Uint8Array([n & 0xFF, (n >>> 8) & 0xFF, (n >>> 16) & 0xFF, (n >>> 24) & 0xFF]); };
  const esc = s => String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');

  // ── CRC-32 ──────────────────────────────────────────────────────────────────
  const crcTab = (() => {
    const t = new Uint32Array(256);
    for (let i = 0; i < 256; i++) {
      let c = i; for (let j = 8; j--;) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
      t[i] = c;
    }
    return t;
  })();
  const crc32 = buf => {
    let c = 0xFFFFFFFF;
    for (const b of buf) c = crcTab[(c ^ b) & 0xFF] ^ (c >>> 8);
    return (c ^ 0xFFFFFFFF) >>> 0;
  };

  // ── Minimal ZIP ─────────────────────────────────────────────────────────────
  function zip(files) {
    const parts = [], centrals = [];
    let offset = 0;
    for (const [name, content] of files) {
      const nb = enc(name);
      const data = typeof content === 'string' ? enc(content) : content;
      const crc = crc32(data), sz = data.length;
      const local = concat([
        new Uint8Array([0x50,0x4B,0x03,0x04]),
        u16(20), u16(0), u16(0), u16(0), u16(0),
        u32(crc), u32(sz), u32(sz), u16(nb.length), u16(0), nb
      ]);
      parts.push(local, data);
      centrals.push(concat([
        new Uint8Array([0x50,0x4B,0x01,0x02]),
        u16(20), u16(20), u16(0), u16(0), u16(0), u16(0),
        u32(crc), u32(sz), u32(sz),
        u16(nb.length), u16(0), u16(0), u16(0), u16(0),
        u32(0), u32(offset), nb
      ]));
      offset += local.length + sz;
    }
    const cd = concat(centrals);
    const eocd = concat([
      new Uint8Array([0x50,0x4B,0x05,0x06]),
      u16(0), u16(0), u16(files.length), u16(files.length),
      u32(cd.length), u32(offset), u16(0)
    ]);
    return new Blob([concat([...parts, cd, eocd])], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    });
  }

  // ── Category labels ─────────────────────────────────────────────────────────
  const CATS_LABELS = {
    'revestimentos':     'Revestimentos',
    'loucas-metais':     'Louças e Metais',
    'iluminacao':        'Iluminação',
    'eletros':           'Eletros',
    'moveis':            'Móveis',
    'decoracao-enxoval': 'Decoração e Enxoval',
    'outros':            'Outros'
  };

  // ── Build rows ───────────────────────────────────────────────────────────────
  // Style index map (see styles.xml below):
  //  0=default  1=col-header  2=bold  3=currency  4=url-wrap
  //  5=brand-hdr  6=proj-name
  //  7=data-even  8=data-odd  9=num-even  10=num-odd  11=url-even  12=url-odd
  //  13=sub-label  14=sub-num
  const cv = (v, t, s) => ({v, t, s});
  const rows = [];
  const imgRows   = new Set(); // rows with IMAGE() formula → taller height
  const dataEven  = new Set(); // product rows (even) → emit all 9 cols
  const dataOdd   = new Set(); // product rows (odd)
  const subRows   = new Set(); // subtotal/total rows → emit all 9 cols

  rows.push([cv('DECORAFIT','s',5)]);
  rows.push([cv(projectName,'s',6)]);
  rows.push([]);
  rows.push([
    cv('Imagem','s',1), cv('Categoria','s',1), cv('Produto','s',1),
    cv('Marca','s',1), cv('SKU','s',1), cv('Qtd','s',1),
    cv('Preço Unit. (R$)','s',1), cv('Subtotal (R$)','s',1), cv('URL','s',1)
  ]);

  let grandTotal = 0;
  let pCounter = 0;
  for (const [catId, catLabel] of Object.entries(CATS_LABELS)) {
    const items = products
      .map((p, i) => ({p, i}))
      .filter(({p}) => (p.category || 'outros') === catId);
    if (!items.length) continue;
    let catTotal = 0;
    for (const {p} of items) {
      const rowIdx = rows.length;
      const odd = pCounter % 2 === 1;
      pCounter++;
      if (p.img) imgRows.add(rowIdx);
      if (odd) dataOdd.add(rowIdx); else dataEven.add(rowIdx);
      const ds = odd ? 8  : 7;   // data style
      const ns = odd ? 10 : 9;   // number/currency style
      const us = odd ? 12 : 11;  // url style
      const qs = odd ? 16 : 15;  // qty style (integer, no decimals)
      const sub = (p.price || 0) * (p.qty || 1);
      catTotal += sub;
      rows.push([
        p.img ? cv(`IMAGE("${p.img}")`, 'f', ds) : cv('', 's', ds),
        cv(catLabel,'s',ds), cv(p.name||'','s',ds), cv(p.brand||'','s',ds), cv(p.sku||'','s',ds),
        cv(p.qty||1,'n',qs), cv(p.price||0,'n',ns), cv(sub,'n',ns), cv(p.url||'','s',us)
      ]);
    }
    grandTotal += catTotal;
    const subIdx = rows.length;
    subRows.add(subIdx);
    rows.push([null,null,null,null,null,null, cv('Subtotal:','s',13), cv(catTotal,'n',14)]);
    rows.push([]);
  }
  const totalIdx = rows.length;
  subRows.add(totalIdx);
  rows.push([null,null,null,null,null,null, cv('TOTAL GERAL:','s',13), cv(grandTotal,'n',14)]);

  // ── Sheet XML ────────────────────────────────────────────────────────────────
  const COLS = 'ABCDEFGHI';
  const fixedHeights = { 0: ' ht="40" customHeight="1"', 1: ' ht="22" customHeight="1"' };
  let sheetXml =
    `<?xml version="1.0" encoding="UTF-8"?>` +
    `<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">` +
    `<sheetViews><sheetView showGridLines="0" workbookViewId="0"/></sheetViews>` +
    `<cols>` +
    `<col min="1" max="1" width="18" customWidth="1"/>` +
    `<col min="2" max="2" width="18" customWidth="1"/>` +
    `<col min="3" max="3" width="40" customWidth="1"/>` +
    `<col min="4" max="4" width="15" customWidth="1"/>` +
    `<col min="5" max="5" width="15" customWidth="1"/>` +
    `<col min="6" max="6" width="6"  customWidth="1"/>` +
    `<col min="7" max="7" width="18" customWidth="1"/>` +
    `<col min="8" max="8" width="18" customWidth="1"/>` +
    `<col min="9" max="9" width="45" customWidth="1"/>` +
    `</cols><sheetData>`;

  rows.forEach((row, ri) => {
    const tall = fixedHeights[ri] ?? (imgRows.has(ri) ? ' ht="60" customHeight="1"' : '');
    const isData = dataEven.has(ri) || dataOdd.has(ri);
    const isSub  = subRows.has(ri);
    const numCols = (isData || isSub) ? 9 : row.length;
    if (!numCols) { sheetXml += `<row r="${ri+1}"${tall}/>`; return; }
    sheetXml += `<row r="${ri+1}"${tall}>`;
    for (let ci = 0; ci < numCols; ci++) {
      const cell = row[ci];
      const ref  = COLS[ci] + (ri + 1);
      // Emit empty styled cell to carry border across the full row
      if (!cell || cell.v === undefined || cell.v === null) {
        const fallback = isSub ? 13 : (dataOdd.has(ri) ? 8 : (isData ? 7 : -1));
        if (fallback >= 0) sheetXml += `<c r="${ref}" s="${fallback}"/>`;
        continue;
      }
      if (cell.v === '') {
        sheetXml += `<c r="${ref}" s="${cell.s}"/>`;
      } else if (cell.t === 'n') {
        sheetXml += `<c r="${ref}" s="${cell.s}"><v>${cell.v}</v></c>`;
      } else if (cell.t === 'f') {
        sheetXml += `<c r="${ref}" s="${cell.s}"><f>${esc(cell.v)}</f></c>`;
      } else {
        sheetXml += `<c r="${ref}" t="inlineStr" s="${cell.s}"><is><t>${esc(cell.v)}</t></is></c>`;
      }
    }
    sheetXml += `</row>`;
  });
  sheetXml +=
    `</sheetData>` +
    `<mergeCells count="2"><mergeCell ref="A1:I1"/><mergeCell ref="A2:I2"/></mergeCells>` +
    `</worksheet>`;

  // ── XLSX package ─────────────────────────────────────────────────────────────
  const CT  = `http://schemas.openxmlformats.org/package/2006/content-types`;
  const PKG = `http://schemas.openxmlformats.org/package/2006/relationships`;
  const DOC = `http://schemas.openxmlformats.org/officeDocument/2006/relationships`;

  return zip([
    ['[Content_Types].xml',
      `<?xml version="1.0" encoding="UTF-8"?><Types xmlns="${CT}">` +
      `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>` +
      `<Default Extension="xml" ContentType="application/xml"/>` +
      `<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>` +
      `<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>` +
      `<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>` +
      `</Types>`],
    ['_rels/.rels',
      `<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="${PKG}">` +
      `<Relationship Id="rId1" Type="${DOC}/officeDocument" Target="xl/workbook.xml"/>` +
      `</Relationships>`],
    ['xl/workbook.xml',
      `<?xml version="1.0" encoding="UTF-8"?>` +
      `<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="${DOC}">` +
      `<sheets><sheet name="Orçamento" sheetId="1" r:id="rId1"/></sheets></workbook>`],
    ['xl/_rels/workbook.xml.rels',
      `<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="${PKG}">` +
      `<Relationship Id="rId1" Type="${DOC}/worksheet" Target="worksheets/sheet1.xml"/>` +
      `<Relationship Id="rId2" Type="${DOC}/styles"    Target="styles.xml"/>` +
      `</Relationships>`],
    ['xl/styles.xml',
      `<?xml version="1.0" encoding="UTF-8"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">` +
      `<numFmts><numFmt numFmtId="164" formatCode="&quot;R$ &quot;#,##0.00"/></numFmts>` +
      // Fonts: 0=normal  1=bold-white(headers)  2=bold-black  3=bold-white-18pt(brand)
      `<fonts count="4">` +
      `<font><sz val="11"/><name val="Calibri"/></font>` +
      `<font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font>` +
      `<font><b/><sz val="11"/><name val="Calibri"/></font>` +
      `<font><b/><sz val="18"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font>` +
      `</fonts>` +
      // Fills: 0=none  1=gray125  2=orange#FF6633  3=light-orange#FFF0E8  4=alt-row#F5F0EE
      `<fills count="5">` +
      `<fill><patternFill patternType="none"/></fill>` +
      `<fill><patternFill patternType="gray125"/></fill>` +
      `<fill><patternFill patternType="solid"><fgColor rgb="FFFF6633"/></patternFill></fill>` +
      `<fill><patternFill patternType="solid"><fgColor rgb="FFFFF0E8"/></patternFill></fill>` +
      `<fill><patternFill patternType="solid"><fgColor rgb="FFF5F0EE"/></patternFill></fill>` +
      `</fills>` +
      // Borders: 0=none  1=thin-bottom-gray  2=medium-bottom-orange
      `<borders count="3">` +
      `<border><left/><right/><top/><bottom/><diagonal/></border>` +
      `<border><left/><right/><top/><bottom style="thin"><color rgb="FFD0D0D0"/></bottom><diagonal/></border>` +
      `<border><left/><right/><top/><bottom style="medium"><color rgb="FFFF6633"/></bottom><diagonal/></border>` +
      `</borders>` +
      `<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>` +
      // cellXfs:
      //  0=default  1=col-hdr  2=bold  3=currency  4=url-wrap
      //  5=brand-hdr  6=proj-name
      //  7=data-even  8=data-odd  9=num-even  10=num-odd  11=url-even  12=url-odd
      //  13=sub-label  14=sub-num
      `<cellXfs count="17">` +
      `<xf numFmtId="0"   fontId="0" fillId="0" borderId="0" xfId="0"/>` +
      `<xf numFmtId="0"   fontId="1" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1"><alignment horizontal="center" wrapText="1"/></xf>` +
      `<xf numFmtId="0"   fontId="2" fillId="0" borderId="0" xfId="0" applyFont="1"/>` +
      `<xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>` +
      `<xf numFmtId="0"   fontId="0" fillId="0" borderId="0" xfId="0"><alignment wrapText="1"/></xf>` +
      `<xf numFmtId="0"   fontId="3" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"><alignment horizontal="center" vertical="center"/></xf>` +
      `<xf numFmtId="0"   fontId="2" fillId="3" borderId="0" xfId="0" applyFont="1" applyFill="1"><alignment horizontal="center" vertical="center"/></xf>` +
      `<xf numFmtId="0"   fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1"/>` +
      `<xf numFmtId="0"   fontId="0" fillId="4" borderId="1" xfId="0" applyFill="1" applyBorder="1"/>` +
      `<xf numFmtId="164" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyBorder="1"/>` +
      `<xf numFmtId="164" fontId="0" fillId="4" borderId="1" xfId="0" applyNumberFormat="1" applyFill="1" applyBorder="1"/>` +
      `<xf numFmtId="0"   fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1"><alignment wrapText="1"/></xf>` +
      `<xf numFmtId="0"   fontId="0" fillId="4" borderId="1" xfId="0" applyFill="1" applyBorder="1"><alignment wrapText="1"/></xf>` +
      `<xf numFmtId="0"   fontId="2" fillId="0" borderId="2" xfId="0" applyFont="1" applyBorder="1"/>` +
      `<xf numFmtId="164" fontId="2" fillId="0" borderId="2" xfId="0" applyFont="1" applyNumberFormat="1" applyBorder="1"/>` +
      `<xf numFmtId="1"   fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyBorder="1"/>` +
      `<xf numFmtId="1"   fontId="0" fillId="4" borderId="1" xfId="0" applyNumberFormat="1" applyFill="1" applyBorder="1"/>` +
      `</cellXfs></styleSheet>`],
    ['xl/worksheets/sheet1.xml', sheetXml],
  ]);
}

