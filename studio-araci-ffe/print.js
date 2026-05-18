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
  btn.textContent = '⏳ Buscando imagens...';
  btn.disabled = true;
  try {
    const { products = [], projectName = 'Orçamento' } =
      await chrome.storage.local.get(['products', 'projectName']);

    const fetchedImages = await Promise.all(products.map(async p => {
      if (!p.img) return null;
      try {
        const resp = await fetch(p.img);
        if (!resp.ok) return null;
        const ct = (resp.headers.get('content-type') || '').split(';')[0].trim();
        if (!ct.startsWith('image/')) return null;
        return { data: new Uint8Array(await resp.arrayBuffer()), ext: ct.includes('png') ? 'png' : 'jpeg' };
      } catch { return null; }
    }));

    btn.textContent = '⏳ Gerando arquivo...';
    const blob = buildXLSX(products, projectName, fetchedImages);
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

function buildXLSX(products, projectName, fetchedImages) {
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

  // ── Build rows + track product rows for image anchors ────────────────────────
  const cv = (v, t, s) => ({v, t, s});
  const rows = [];
  // {rowIdx (0-based xlsx row), img: {data, ext} | null}
  const productAnchors = [];

  rows.push([cv(projectName,'s',2)]);  // index 0
  rows.push([]);                        // index 1  (blank)
  rows.push([                           // index 2  (header)
    cv('Imagem','s',1), cv('Categoria','s',1), cv('Produto','s',1),
    cv('Marca','s',1), cv('SKU','s',1), cv('Qtd','s',1),
    cv('Preço Unit. (R$)','s',1), cv('Subtotal (R$)','s',1), cv('URL','s',1)
  ]);

  let grandTotal = 0;
  for (const [catId, catLabel] of Object.entries(CATS_LABELS)) {
    const items = products
      .map((p, i) => ({p, i}))
      .filter(({p}) => (p.category || 'outros') === catId);
    if (!items.length) continue;
    let catTotal = 0;
    for (const {p, i} of items) {
      const rowIdx = rows.length;
      const img = fetchedImages?.[i] ?? null;
      productAnchors.push({rowIdx, img});
      const sub = (p.price || 0) * (p.qty || 1);
      catTotal += sub;
      rows.push([
        cv('','s',0),
        cv(catLabel,'s',0), cv(p.name||'','s',0), cv(p.brand||'','s',0), cv(p.sku||'','s',0),
        cv(p.qty||1,'n',0), cv(p.price||0,'n',3), cv(sub,'n',3), cv(p.url||'','s',0)
      ]);
    }
    grandTotal += catTotal;
    rows.push([{},{},{},{},{},{}, cv('Subtotal:','s',2), cv(catTotal,'n',3)]);
    rows.push([]);
  }
  rows.push([{},{},{},{},{},{}, cv('TOTAL GERAL:','s',2), cv(grandTotal,'n',3)]);

  // ── Media files + drawing anchors ────────────────────────────────────────────
  const mediaFiles = [];
  const drawingRelEntries = [];
  let imgCounter = 0;

  for (const anchor of productAnchors) {
    if (!anchor.img) continue;
    imgCounter++;
    anchor.rId   = `rId${imgCounter}`;
    anchor.picId = imgCounter;
    const fname  = `xl/media/image${imgCounter}.${anchor.img.ext}`;
    mediaFiles.push([fname, anchor.img.data]);
    drawingRelEntries.push(
      `<Relationship Id="${anchor.rId}" ` +
      `Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" ` +
      `Target="../media/image${imgCounter}.${anchor.img.ext}"/>`
    );
  }

  const hasDrawing = imgCounter > 0;
  const hasJpeg    = productAnchors.some(a => a.img?.ext === 'jpeg');
  const hasPng     = productAnchors.some(a => a.img?.ext === 'png');
  const productRowSet = new Set(productAnchors.map(a => a.rowIdx));

  // ── Sheet XML ────────────────────────────────────────────────────────────────
  const COLS = 'ABCDEFGHI';
  let sheetXml =
    `<?xml version="1.0" encoding="UTF-8"?>` +
    `<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"` +
    (hasDrawing ? ` xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"` : '') + `>` +
    `<cols>` +
    `<col min="1" max="1" width="9"  customWidth="1"/>` +
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
    const tall = productRowSet.has(ri) ? ` ht="50" customHeight="1"` : '';
    if (!row.length) { sheetXml += `<row r="${ri+1}"${tall}/>`; return; }
    sheetXml += `<row r="${ri+1}"${tall}>`;
    row.forEach((cell, ci) => {
      if (!cell || cell.v === undefined || cell.v === '') return;
      const ref = COLS[ci] + (ri + 1);
      sheetXml += cell.t === 'n'
        ? `<c r="${ref}" s="${cell.s}"><v>${cell.v}</v></c>`
        : `<c r="${ref}" t="inlineStr" s="${cell.s}"><is><t>${esc(cell.v)}</t></is></c>`;
    });
    sheetXml += `</row>`;
  });
  sheetXml += `</sheetData>`;
  if (hasDrawing) sheetXml += `<drawing r:id="rId1"/>`;
  sheetXml += `</worksheet>`;

  // ── Drawing XML ──────────────────────────────────────────────────────────────
  let drawingXml = '';
  if (hasDrawing) {
    const NS_XDR = `xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing"`;
    const NS_A   = `xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"`;
    const NS_R   = `xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"`;
    drawingXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><xdr:wsDr ${NS_XDR} ${NS_A} ${NS_R}>`;
    for (const a of productAnchors) {
      if (!a.img) continue;
      // twoCellAnchor: col A, rowIdx → col B, rowIdx+1 (fills the cell); 76200 EMU = ~6pt padding
      drawingXml +=
        `<xdr:twoCellAnchor editAs="oneCell">` +
        `<xdr:from><xdr:col>0</xdr:col><xdr:colOff>76200</xdr:colOff><xdr:row>${a.rowIdx}</xdr:row><xdr:rowOff>76200</xdr:rowOff></xdr:from>` +
        `<xdr:to><xdr:col>1</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>${a.rowIdx + 1}</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:to>` +
        `<xdr:pic>` +
        `<xdr:nvPicPr>` +
        `<xdr:cNvPr id="${a.picId + 1}" name="Img${a.picId}"/>` +
        `<xdr:cNvPicPr><a:picLocks noChangeAspect="1"/></xdr:cNvPicPr>` +
        `</xdr:nvPicPr>` +
        `<xdr:blipFill><a:blip r:embed="${a.rId}" cstate="print"/><a:stretch><a:fillRect/></a:stretch></xdr:blipFill>` +
        `<xdr:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="457200" cy="457200"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></xdr:spPr>` +
        `</xdr:pic><xdr:clientData/>` +
        `</xdr:twoCellAnchor>`;
    }
    drawingXml += `</xdr:wsDr>`;
  }

  // ── XLSX package ─────────────────────────────────────────────────────────────
  const CT = `http://schemas.openxmlformats.org/package/2006/content-types`;
  const ctXml =
    `<?xml version="1.0" encoding="UTF-8"?><Types xmlns="${CT}">` +
    `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>` +
    `<Default Extension="xml" ContentType="application/xml"/>` +
    (hasJpeg ? `<Default Extension="jpeg" ContentType="image/jpeg"/>` : '') +
    (hasPng  ? `<Default Extension="png"  ContentType="image/png"/>` : '') +
    `<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>` +
    `<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>` +
    `<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>` +
    (hasDrawing ? `<Override PartName="/xl/drawings/drawing1.xml" ContentType="application/vnd.openxmlformats-officedocument.drawingml.spreadsheetDrawing+xml"/>` : '') +
    `</Types>`;

  const PKG = `http://schemas.openxmlformats.org/package/2006/relationships`;
  const DOC = `http://schemas.openxmlformats.org/officeDocument/2006/relationships`;

  const files = [
    ['[Content_Types].xml', ctXml],
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
      `<fonts count="3">` +
      `<font><sz val="11"/><name val="Calibri"/></font>` +
      `<font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font>` +
      `<font><b/><sz val="11"/><name val="Calibri"/></font>` +
      `</fonts>` +
      `<fills count="3">` +
      `<fill><patternFill patternType="none"/></fill>` +
      `<fill><patternFill patternType="gray125"/></fill>` +
      `<fill><patternFill patternType="solid"><fgColor rgb="FFFF6633"/></patternFill></fill>` +
      `</fills>` +
      `<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>` +
      `<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>` +
      `<cellXfs count="4">` +
      `<xf numFmtId="0"   fontId="0" fillId="0" borderId="0" xfId="0"/>` +
      `<xf numFmtId="0"   fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"><alignment horizontal="center" wrapText="1"/></xf>` +
      `<xf numFmtId="0"   fontId="2" fillId="0" borderId="0" xfId="0" applyFont="1"/>` +
      `<xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>` +
      `</cellXfs></styleSheet>`],
    ['xl/worksheets/sheet1.xml', sheetXml],
    ...mediaFiles,
    ...(hasDrawing ? [
      ['xl/drawings/drawing1.xml', drawingXml],
      ['xl/drawings/_rels/drawing1.xml.rels',
        `<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="${PKG}">` +
        drawingRelEntries.join('') +
        `</Relationships>`],
      ['xl/worksheets/_rels/sheet1.xml.rels',
        `<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="${PKG}">` +
        `<Relationship Id="rId1" Type="${DOC}/drawing" Target="../drawings/drawing1.xml"/>` +
        `</Relationships>`],
    ] : []),
  ];

  return zip(files);
}
