// print.js v2 — Studio Araci FF&E

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
  { id: 'revestimentos', label: 'Revestimentos' },
  { id: 'loucas-metais', label: 'Louças e Metais' },
  { id: 'iluminacao',    label: 'Iluminação & Decoração' },
  { id: 'enxoval',      label: 'Enxoval' },
  { id: 'outros',       label: 'Outros' }
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
