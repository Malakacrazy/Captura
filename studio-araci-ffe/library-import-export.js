// library-import-export.js — Studio Araci FF&E · Project Import & Export
// Handles export to .txt/clipboard, print payload delegation, and import validation/modal handlers.

async function openPrintFor(payload) {
  await chrome.storage.local.set({ printPayload: payload });
  chrome.runtime.sendMessage({ action: 'openPrint' });
}

async function shareProject(proj) {
  const payload = {
    _studio_araci: 1,
    name: proj.name,
    savedAt: proj.savedAt,
    products: proj.products || []
  };

  const json = JSON.stringify(payload, null, 2);

  const blob = new Blob([json], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const safeName = (proj.name || 'projeto').replace(/[^a-zA-Z0-9À-ú\s\-_]/g, '').trim().replace(/\s+/g, '_');
  a.href = url;
  a.download = `studio_araci_${safeName}.txt`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);

  try {
    await navigator.clipboard.writeText(json);
    showToast('⬇ Arquivo baixado e copiado! Envie o .txt para o outro usuário.');
  } catch {
    showToast('⬇ Arquivo baixado! Envie o .txt para o outro usuário importar.');
  }
}

function openImportModal() {
  $('importModal').classList.add('open');
  $('importFileInput').value = '';
  $('importCodeInput').value = '';
}

function closeImportModal() {
  $('importModal').classList.remove('open');
}

const MAX_IMPORT_PRODUCTS = 5000;

function sanitizeImportedProduct(raw) {
  if (!raw || typeof raw !== 'object') return null;

  const str = (v, max) => (typeof v === 'string' ? v.slice(0, max).trim() : '');
  const num = (v) => { const n = Number(v); return Number.isFinite(n) && n >= 0 ? n : 0; };

  const name = str(raw.name, 300);
  if (!name) return null;

  const ambiente = Array.isArray(raw.ambiente)
    ? raw.ambiente.filter(a => typeof a === 'string').slice(0, 30).map(a => a.slice(0, 60))
    : (typeof raw.ambiente === 'string' && raw.ambiente ? [raw.ambiente.slice(0, 60)] : []);

  const category = (typeof STUDIO_ARACI_CATEGORIES !== 'undefined' && STUDIO_ARACI_CATEGORIES.some(c => c.id === raw.category))
    ? raw.category
    : 'outros';

  const price = num(raw.price);

  return {
    id: crypto.randomUUID(),
    name,
    brand: str(raw.brand, 120),
    sku: str(raw.sku, 60),
    price,
    qty: Math.max(1, Math.floor(num(raw.qty)) || 1),
    category,
    img: safeUrl(raw.img),
    dims: str(raw.dims, 120),
    url: safeUrl(raw.url),
    unit: str(raw.unit, 20),
    ambiente,
    obs: str(raw.obs, 500),
    originalPrice: num(raw.originalPrice ?? price),
    priceEdited: !!raw.priceEdited,
    diffPriceLink: safeUrl(raw.diffPriceLink)
  };
}

async function saveImportedData(data) {
  if (!data || (!data._studio_araci && !data._parse) || !Array.isArray(data.products)) {
    closeImportModal();
    showToast('⚠ Este conteúdo não é um projeto Studio Araci.');
    return;
  }

  const bruto = data.products.slice(0, MAX_IMPORT_PRODUCTS);
  const produtos = bruto.map(sanitizeImportedProduct).filter(Boolean);
  const descartados = bruto.length - produtos.length;

  if (produtos.length === 0) {
    closeImportModal();
    showToast('⚠ Nenhum item válido encontrado neste projeto.');
    return;
  }

  const name = (typeof data.name === 'string' && data.name.trim())
    ? data.name.trim().slice(0, 120)
    : `Projeto importado ${new Intl.DateTimeFormat('pt-BR').format(new Date())}`;

  projects.push({
    id: crypto.randomUUID(),
    name,
    savedAt: new Date().toISOString(),
    products: produtos
  });

  await saveProjectsToStorage();
  if (typeof renderProjects === 'function') renderProjects();
  closeImportModal();

  showToast(descartados > 0
    ? `✓ "${name}" importado — ${descartados} item(ns) inválido(s) ignorado(s)`
    : `✓ "${name}" importado com sucesso!`);
}

function processImportFile(file) {
  if (!file) return;
  const reader = new FileReader();
  reader.onload = async (e) => {
    let data;
    try {
      data = JSON.parse(e.target.result);
    } catch {
      closeImportModal();
      showToast('⚠ Arquivo inválido. Selecione um .txt exportado pelo Studio Araci.');
      return;
    }
    await saveImportedData(data);
  };
  reader.readAsText(file, 'utf-8');
}

async function processImportCode() {
  const raw = $('importCodeInput').value.trim();
  if (!raw) {
    showToast('⚠ Cole o código do projeto antes de importar.');
    return;
  }
  let data;
  try {
    data = JSON.parse(raw);
  } catch {
    showToast('⚠ Código inválido. Verifique se copiou o conteúdo completo.');
    return;
  }
  await saveImportedData(data);
}
