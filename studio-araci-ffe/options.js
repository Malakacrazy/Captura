// options.js — Studio Araci FF&E · Página de Configurações
//
// getPlatformSettings/savePlatformSettings/fetchPlatformProjects/
// fetchPlatformAreas/createPlatformArea/sendProductsToPlatform vêm de
// platform-sync.js (carregado antes deste script em options.html).

const $ = id => document.getElementById(id);

let settingsStatusTimer;
function showSettingsStatus(msg, type) {
  const el = $('settingsStatus');
  el.textContent = msg;
  el.className = 'status-bar ' + type;
  clearTimeout(settingsStatusTimer);
  settingsStatusTimer = setTimeout(() => { el.className = 'status-bar'; }, 4000);
}

let sendStatusTimer;
function showSendStatus(msg, type) {
  const el = $('sendStatus');
  el.textContent = msg;
  el.className = 'status-bar ' + type;
  clearTimeout(sendStatusTimer);
  sendStatusTimer = setTimeout(() => { el.className = 'status-bar'; }, 8000);
}

async function initSettingsForm() {
  const { apiUrl, apiKey } = await getPlatformSettings();
  $('apiUrl').value = apiUrl;
  $('apiKey').value = apiKey;
}

$('saveSettingsBtn').addEventListener('click', async () => {
  const apiUrl = $('apiUrl').value.trim();
  const apiKey = $('apiKey').value.trim();
  if (!apiUrl || !apiKey) {
    showSettingsStatus('⚠ Preencha a URL e a chave antes de salvar.', 'warn');
    return;
  }
  await savePlatformSettings(apiUrl, apiKey);
  showSettingsStatus('✓ Configurações salvas.', 'ok');
  loadProjects();
});

// ─── Projeto / Ambiente ─────────────────────────────────────────────────

async function loadProjects() {
  const projects = await fetchPlatformProjects();
  const select = $('sendProjectId');
  select.innerHTML = '<option value="">Selecione…</option>';
  for (const p of projects) {
    const opt = document.createElement('option');
    opt.value = p.id;
    opt.textContent = p.name;
    select.appendChild(opt);
  }
  resetAreaSelect();
}

function resetAreaSelect() {
  const select = $('sendAreaId');
  select.innerHTML = '<option value="">Selecione um projeto primeiro…</option>';
  select.disabled = true;
  $('toggleNewAreaBtn').style.display = 'none';
  hideNewAreaRow();
  refreshSendReadiness();
}

async function loadAreas(projectId) {
  const areas = await fetchPlatformAreas(projectId);
  const select = $('sendAreaId');
  select.innerHTML = '<option value="">Selecione…</option>';
  for (const a of areas) {
    const opt = document.createElement('option');
    opt.value = a.id;
    opt.textContent = a.name;
    select.appendChild(opt);
  }
  select.disabled = false;
  $('toggleNewAreaBtn').style.display = '';
  refreshSendReadiness();
}

$('sendProjectId').addEventListener('change', () => {
  const projectId = $('sendProjectId').value;
  if (!projectId) {
    resetAreaSelect();
    return;
  }
  loadAreas(projectId);
});

$('sendAreaId').addEventListener('change', refreshSendReadiness);

function hideNewAreaRow() {
  $('newAreaRow').style.display = 'none';
  $('newAreaName').value = '';
}

$('toggleNewAreaBtn').addEventListener('click', () => {
  const row = $('newAreaRow');
  row.style.display = row.style.display === 'none' ? 'flex' : 'none';
  if (row.style.display === 'flex') $('newAreaName').focus();
});

$('createAreaBtn').addEventListener('click', async () => {
  const projectId = $('sendProjectId').value;
  const name = $('newAreaName').value.trim();
  if (!projectId || !name) {
    showSendStatus('⚠ Escolha o projeto e digite um nome para o ambiente.', 'warn');
    return;
  }
  $('createAreaBtn').disabled = true;
  try {
    const area = await createPlatformArea(projectId, name);
    await loadAreas(projectId);
    $('sendAreaId').value = area.id;
    hideNewAreaRow();
    refreshSendReadiness();
    showSendStatus(`✓ Ambiente "${area.name}" criado.`, 'ok');
  } catch (e) {
    showSendStatus(`⚠ ${e.message}`, 'warn');
  } finally {
    $('createAreaBtn').disabled = false;
  }
});

// ─── Envio ───────────────────────────────────────────────────────────────

// O botão de enviar reflete "tem itens no orçamento" + "um ambiente foi
// escolhido" — se a conexão (URL/chave) estiver faltando, isso só é
// descoberto (e avisado) no clique, pra não duplicar essa checagem aqui
// e em sendProductsToPlatform.
async function refreshSendReadiness() {
  const { products = [] } = await chrome.storage.local.get('products');
  $('budgetCount').textContent = products.length;
  $('sendBtn').disabled = products.length === 0 || !$('sendAreaId').value;
}

$('sendBtn').addEventListener('click', async () => {
  const { products = [] } = await chrome.storage.local.get('products');
  const areaId = $('sendAreaId').value;
  if (products.length === 0 || !areaId) return;

  $('sendBtn').disabled = true;
  $('sendBtn').textContent = 'Enviando…';

  const result = await sendProductsToPlatform(products, areaId);

  $('sendBtn').textContent = '☁ Enviar para a plataforma';
  await refreshSendReadiness();

  if (!result.configured) {
    showSendStatus('⚠ Configure a URL e a chave de API acima antes de enviar.', 'warn');
    return;
  }
  if (result.failed === 0) {
    showSendStatus(`✓ ${result.sent} produto(s) enviado(s) com sucesso.`, 'ok');
  } else {
    const preview = result.errors.slice(0, 3).join('; ');
    showSendStatus(
      `⚠ ${result.sent} enviado(s), ${result.failed} falharam: ${preview}${result.errors.length > 3 ? '…' : ''}`,
      'warn'
    );
  }
});

initSettingsForm();
loadProjects();
refreshSendReadiness();
