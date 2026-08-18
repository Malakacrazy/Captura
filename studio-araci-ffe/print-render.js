// print-render.js — Studio Araci FF&E · PDF Print & DOM Renderer
// Data loading, price validation, image/font readiness, and PDF quotation DOM rendering.

let sheetData = { products: [], projectName: '' };
let ready = null;

async function loadData() {
  const { products = [], projectName = '', printPayload = null } =
    await chrome.storage.local.get(['products', 'projectName', 'printPayload']);

  sheetData = printPayload
    ? { products: printPayload.products || [], projectName: printPayload.name || '' }
    : { products, projectName };
}

function ensurePricesJustified(formato) {
  const blocked = sheetData.products.filter(p => p.priceEdited && !p.diffPriceLink);
  if (blocked.length === 0) return true;

  alert(
    `⚠ ${formato} bloqueado!\n\n` +
    `${blocked.length} produto(s) com preço alterado sem "Link de Preço Diferente":\n\n` +
    blocked.map(p => '• ' + (p.name || 'Sem nome')).join('\n') +
    `\n\nAdicione o link na Biblioteca de Projetos para liberar o ${formato}.`
  );
  return false;
}

async function triggerPrint() {
  const btn = document.getElementById('printBtn');

  await ready;
  if (!ensurePricesJustified('PDF')) return;

  btn.textContent = '⏳ Preparando...';
  btn.disabled = true;

  const imgs = [...document.querySelectorAll('img')];
  await Promise.allSettled(
    imgs.map(img => new Promise(resolve => {
      if (img.complete) { resolve(); return; }
      img.addEventListener('load', resolve, { once: true });
      img.addEventListener('error', resolve, { once: true });
    }))
  );

  await document.fonts.ready;

  window.print();

  setTimeout(() => {
    btn.textContent = '⬇ Salvar PDF';
    btn.disabled = false;
  }, 1000);
}

function fmt(n) {
  return 'R$ ' + (n || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtDate() {
  return new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' }).format(new Date());
}

async function render() {
  await loadData();
  const { products, projectName } = sheetData;

  const CATS = typeof STUDIO_ARACI_CATEGORIES !== 'undefined' ? STUDIO_ARACI_CATEGORIES : [];

  document.getElementById('docDate').textContent = fmtDate();

  if (projectName) {
    document.getElementById('projName').textContent = projectName;
  } else {
    document.getElementById('projectBar').style.display = 'none';
  }

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

  const grouped = {};
  CATS.forEach(c => { grouped[c.id] = []; });
  products.forEach(p => {
    const cat = p.category || 'outros';
    if (!grouped[cat]) grouped[cat] = [];
    grouped[cat].push(p);
  });

  const activeCats = CATS.filter(c => grouped[c.id]?.length > 0);

  CATS.forEach(cat => {
    const items = grouped[cat.id];
    if (!items || items.length === 0) return;

    const section = document.createElement('div');
    section.className = 'cat-section';

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

    const tableHeader = document.createElement('div');
    tableHeader.className = 'table-header';
    tableHeader.innerHTML =
      '<div></div><div>Produto</div><div>Ambiente</div><div>Observações</div>' +
      '<div style="text-align:center">Qtd</div>' +
      '<div style="text-align:right">Subtotal</div>';

    section.append(catHeader, tableHeader);

    let catTotal = 0;
    items.forEach((p, idx) => {
      const row = buildProductRow(p, idx);
      catTotal += (p.price || 0) * (p.qty || 1);
      section.appendChild(row);
    });

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

  const imgCell = document.createElement('div');
  if (p.img) {
    const img = document.createElement('img');
    img.className = 'prod-img';
    img.alt = p.name || '';
    img.src = p.img;
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

  const infoCell = document.createElement('div');
  const nameEl = document.createElement('div');
  nameEl.className = 'prod-name-print';
  nameEl.textContent = p.name;

  const metaParts = [];
  if (p.brand) metaParts.push(p.brand);
  if (p.sku) metaParts.push('SKU ' + p.sku);

  const metaEl = document.createElement('div');
  metaEl.className = 'prod-meta-print';
  if (metaParts.length > 0) metaEl.textContent = metaParts.join(' · ');

  infoCell.append(nameEl, metaEl);

  const qtyCell = document.createElement('div');
  qtyCell.className = 'col-center';
  qtyCell.textContent = (p.qty || 1) + (p.unit ? ' ' + p.unit : '');

  const ambCell = document.createElement('div');
  ambCell.className = 'col-left';
  ambCell.style.fontSize = '11px';
  ambCell.textContent = Array.isArray(p.ambiente) ? p.ambiente.join(', ') : (p.ambiente || '');

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
