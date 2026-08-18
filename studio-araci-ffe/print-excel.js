// print-excel.js — Studio Araci FF&E · Excel Export Engine (.xlsx)
// Generates formatted OOXML Excel spreadsheets without external dependencies.

function setupExcelExport() {
  const xlsxBtn = document.getElementById('xlsxBtn');
  if (!xlsxBtn) return;

  xlsxBtn.addEventListener('click', async () => {
    await ready;
    if (!ensurePricesJustified('Excel')) return;

    xlsxBtn.textContent = '⏳ Gerando arquivo...';
    xlsxBtn.disabled = true;
    try {
      const products = sheetData.products;
      const projectName = sheetData.projectName || 'Orçamento';
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
      xlsxBtn.textContent = '📊 Salvar Excel';
      xlsxBtn.disabled = false;
    }
  });
}

function buildXLSX(products, projectName) {
  const enc = s => new TextEncoder().encode(s);

  const concat = arrs => {
    const out = new Uint8Array(arrs.reduce((s, a) => s + a.length, 0));
    let pos = 0; arrs.forEach(a => { out.set(a, pos); pos += a.length; });
    return out;
  };

  const u16 = n => new Uint8Array([n & 0xFF, (n >> 8) & 0xFF]);
  const u32 = n => { n = n >>> 0; return new Uint8Array([n & 0xFF, (n >>> 8) & 0xFF, (n >>> 16) & 0xFF, (n >>> 24) & 0xFF]); };
  const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

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

  function zip(files) {
    const parts = [], centrals = [];
    let offset = 0;

    for (const [name, content] of files) {
      const nb = enc(name);
      const data = typeof content === 'string' ? enc(content) : content;
      const crc = crc32(data), sz = data.length;

      const local = concat([
        new Uint8Array([0x50, 0x4B, 0x03, 0x04]),
        u16(20), u16(0), u16(0), u16(0), u16(0),
        u32(crc), u32(sz), u32(sz),
        u16(nb.length), u16(0), nb
      ]);
      parts.push(local, data);

      centrals.push(concat([
        new Uint8Array([0x50, 0x4B, 0x01, 0x02]),
        u16(20), u16(20), u16(0), u16(0), u16(0), u16(0),
        u32(crc), u32(sz), u32(sz),
        u16(nb.length), u16(0), u16(0), u16(0), u16(0),
        u32(0), u32(offset), nb
      ]));
      offset += local.length + sz;
    }

    const cd = concat(centrals);
    const eocd = concat([
      new Uint8Array([0x50, 0x4B, 0x05, 0x06]),
      u16(0), u16(0),
      u16(files.length), u16(files.length),
      u32(cd.length), u32(offset), u16(0)
    ]);

    return new Blob([concat([...parts, cd, eocd])], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    });
  }

  const CATS = typeof STUDIO_ARACI_CATEGORIES !== 'undefined' ? STUDIO_ARACI_CATEGORIES : [];
  const CATS_LABELS = Object.fromEntries(CATS.map(c => [c.id, c.label]));

  const CAT_STYLES = {
    'revestimentos': 22, 'loucas-metais': 23, 'iluminacao': 24, 'eletros': 25,
    'moveis': 26, 'decoracao-enxoval': 27, 'outros': 28
  };

  const cv = (v, t, s) => ({ v, t, s });
  const rows = [];

  const imgRows = new Set();
  const dataEven = new Set();
  const dataOdd = new Set();
  const subRows = new Set();
  const catHeaderRows = new Set();
  const merges = [];

  const COLS = 'ABCDEFGHIJK';
  const LAST = COLS[COLS.length - 1];
  const NUM_COLS = COLS.length;

  // Row 1 — brand header
  merges.push(`A1:${LAST}1`);
  rows.push([cv('STUDIO ARACI', 's', 5)]);

  // Row 2 — doc type
  merges.push(`A2:${LAST}2`);
  rows.push([cv('SUGESTÃO DE ACABAMENTOS', 's', 17)]);

  // Row 3 — project name
  merges.push(`A3:${LAST}3`);
  rows.push([cv(projectName || 'Orçamento', 's', 6)]);

  // Row 4 — blank
  rows.push([]);

  // Row 5 — summary cards
  const totalUnits = products.reduce((s, p) => s + (p.qty || 1), 0);
  const grandTotalVal = products.reduce((s, p) => s + (p.price || 0) * (p.qty || 1), 0);
  rows.push([
    cv('Produtos', 's', 18), cv(products.length, 'n', 19), cv('', 's', 18),
    cv('Unidades', 's', 18), cv(totalUnits, 'n', 19), cv('', 's', 18),
    cv('Total do Orçamento', 's', 20), cv(grandTotalVal, 'n', 21), cv('', 's', 20),
    cv('', 's', 0)
  ]);

  // Row 6 — blank
  rows.push([]);

  let grandTotal = 0;
  let pCounter = 0;

  for (const [catId, catLabel] of Object.entries(CATS_LABELS)) {
    const items = products
      .map((p, i) => ({ p, i }))
      .filter(({ p }) => (p.category || 'outros') === catId);
    if (!items.length) continue;

    const catRowIdx = rows.length;
    catHeaderRows.add(catRowIdx);
    const catStyle = CAT_STYLES[catId] || 28;
    const cnt = items.length;
    merges.push(`A${catRowIdx + 1}:${LAST}${catRowIdx + 1}`);
    rows.push([cv(`${catLabel}  —  ${cnt} ${cnt === 1 ? 'item' : 'itens'}`, 's', catStyle)]);

    rows.push([
      cv('', 's', 1), cv('Produto', 's', 1), cv('Marca', 's', 1),
      cv('Ambiente', 's', 1), cv('Observações', 's', 1), cv('Qtd', 's', 1),
      cv('Un.', 's', 1), cv('Custo Unit.', 's', 1), cv('Subtotal', 's', 1),
      cv('URL', 's', 1), cv('Link Preço Dif.', 's', 1)
    ]);

    let catTotal = 0;

    for (const { p } of items) {
      const rowIdx = rows.length;
      const odd = pCounter % 2 === 1;
      pCounter++;

      if (p.img) imgRows.add(rowIdx);
      if (odd) dataOdd.add(rowIdx); else dataEven.add(rowIdx);

      const ds = odd ? 8 : 7;
      const ns = odd ? 10 : 9;
      const us = odd ? 12 : 11;
      const qs = odd ? 16 : 15;

      const sub = (p.price || 0) * (p.qty || 1);
      catTotal += sub;

      const ambStr = Array.isArray(p.ambiente) ? p.ambiente.join(', ') : (p.ambiente || '');
      const priceStyle = p.priceEdited ? (odd ? 30 : 29) : ns;

      const imgFormula = p.img
        ? `_xlfn.IMAGE("${String(p.img).replace(/"/g, '')}")`
        : null;

      rows.push([
        imgFormula ? cv(imgFormula, 'f', ds) : cv('', 's', ds),
        cv(p.name || '', 's', ds),
        cv(p.brand || '', 's', ds),
        cv(ambStr, 's', ds),
        cv(p.obs || '', 's', ds),
        cv(p.qty || 1, 'n', qs),
        cv(p.unit || '', 's', ds),
        cv(p.price || 0, 'n', priceStyle),
        cv(sub, 'n', ns),
        cv(p.url || '', 's', us),
        cv(p.diffPriceLink || '', 's', us)
      ]);
    }

    grandTotal += catTotal;

    const subIdx = rows.length;
    subRows.add(subIdx);
    rows.push([null, null, null, null, null, null, null,
      cv('Subtotal:', 's', 13),
      cv(catTotal, 'n', 14)
    ]);

    rows.push([]);
  }

  const totalIdx = rows.length;
  subRows.add(totalIdx);
  rows.push([null, null, null, null, null, null, null,
    cv('TOTAL GERAL:', 's', 13),
    cv(grandTotal, 'n', 14)
  ]);

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
    `<col min="9" max="9" width="16" customWidth="1"/>` +
    `<col min="10" max="10" width="38" customWidth="1"/>` +
    `<col min="11" max="11" width="38" customWidth="1"/>` +
    `</cols><sheetData>`;

  rows.forEach((row, ri) => {
    const isCatHdr = catHeaderRows.has(ri);
    const tall = fixedHeights[ri] ?? (imgRows.has(ri) ? ' ht="60" customHeight="1"' : (isCatHdr ? ' ht="24" customHeight="1"' : ''));

    const isData = dataEven.has(ri) || dataOdd.has(ri);
    const isSub = subRows.has(ri);
    const numCols = (isData || isSub) ? NUM_COLS : row.length;

    if (!numCols) { sheetXml += `<row r="${ri + 1}"${tall}/>`; return; }
    sheetXml += `<row r="${ri + 1}"${tall}>`;

    for (let ci = 0; ci < numCols; ci++) {
      const cell = row[ci];
      const ref = COLS[ci] + (ri + 1);

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

  sheetXml += `</sheetData>` +
    `<mergeCells count="${merges.length}">` +
    merges.map(m => `<mergeCell ref="${m}"/>`).join('') +
    `</mergeCells></worksheet>`;

  const sharePayload = JSON.stringify(
    { _studio_araci: 1, name: projectName, savedAt: new Date().toISOString(), products },
    null, 2
  );
  const codeCell = sharePayload.length > 32000
    ? 'Projeto muito grande para exportar como código nesta aba. Use o botão "Compartilhar" na Biblioteca de Projetos para gerar o arquivo .txt e importá-lo no outro computador.'
    : sharePayload;
  const sheet2Xml =
    `<?xml version="1.0" encoding="UTF-8"?>` +
    `<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">` +
    `<sheetData>` +
    `<row r="1"><c r="A1" t="inlineStr"><is><t>${esc('Cole este código no botão "Importar Projeto" da extensão Studio Araci para carregar esta lista em outro computador.')}</t></is></c></row>` +
    `<row r="2"><c r="A2" t="inlineStr"><is><t>${esc(codeCell)}</t></is></c></row>` +
    `</sheetData></worksheet>`;

  const CT = `http://schemas.openxmlformats.org/package/2006/content-types`;
  const PKG = `http://schemas.openxmlformats.org/package/2006/relationships`;
  const DOC = `http://schemas.openxmlformats.org/officeDocument/2006/relationships`;

  return zip([
    ['[Content_Types].xml',
      `<?xml version="1.0" encoding="UTF-8"?><Types xmlns="${CT}">` +
      `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>` +
      `<Default Extension="xml"  ContentType="application/xml"/>` +
      `<Override PartName="/xl/workbook.xml"          ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>` +
      `<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>` +
      `<Override PartName="/xl/worksheets/sheet2.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>` +
      `<Override PartName="/xl/styles.xml"            ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>` +
      `</Types>`],
    ['_rels/.rels',
      `<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="${PKG}">` +
      `<Relationship Id="rId1" Type="${DOC}/officeDocument" Target="xl/workbook.xml"/>` +
      `</Relationships>`],
    ['xl/workbook.xml',
      `<?xml version="1.0" encoding="UTF-8"?>` +
      `<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="${DOC}">` +
      `<sheets><sheet name="Orçamento" sheetId="1" r:id="rId1"/><sheet name="código da extensão" sheetId="2" r:id="rId3"/></sheets></workbook>`],
    ['xl/_rels/workbook.xml.rels',
      `<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="${PKG}">` +
      `<Relationship Id="rId1" Type="${DOC}/worksheet" Target="worksheets/sheet1.xml"/>` +
      `<Relationship Id="rId2" Type="${DOC}/styles"    Target="styles.xml"/>` +
      `<Relationship Id="rId3" Type="${DOC}/worksheet" Target="worksheets/sheet2.xml"/>` +
      `</Relationships>`],
    ['xl/styles.xml',
      `<?xml version="1.0" encoding="UTF-8"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">` +
      `<numFmts><numFmt numFmtId="164" formatCode="&quot;R$ &quot;#,##0.00"/></numFmts>` +
      `<fonts count="5">` +
      `<font><sz val="11"/><name val="Calibri"/></font>` +
      `<font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font>` +
      `<font><b/><sz val="11"/><name val="Calibri"/></font>` +
      `<font><b/><sz val="18"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font>` +
      `<font><sz val="11"/><color rgb="FFFF0000"/><name val="Calibri"/></font>` +
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
      `<cellXfs count="31">` +
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
      `<xf numFmtId="164" fontId="4" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyFont="1" applyBorder="1"/>` +
      `<xf numFmtId="164" fontId="4" fillId="4" borderId="1" xfId="0" applyNumberFormat="1" applyFont="1" applyBorder="1"/>` +
      `</cellXfs></styleSheet>`],
    ['xl/worksheets/sheet1.xml', sheetXml],
    ['xl/worksheets/sheet2.xml', sheet2Xml],
  ]);
}
