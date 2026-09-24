// options.js — Studio Araci FF&E · Página de Configurações
//
// getPlatformSettings/savePlatformSettings/fetchPlatformProjects/
// sendProductsToPlatform vêm de platform-sync.js (carregado antes deste
// script em options.html). O ambiente de cada item é resolvido pela
// própria sendProductsToPlatform a partir do campo "Ambiente" que o
// orçamento já tem — esta tela só escolhe o Projeto.

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

// ─── Projeto ──────────────────────────────────────────────────────────────

async function loadProjects() {
  const select = $('sendProjectId');
  select.innerHTML = '<option value="">Carregando…</option>';
  let projects;
  try {
    projects = await fetchPlatformProjects();
  } catch (e) {
    // Sem isso, uma falha aqui deixava o select preso no placeholder
    // estático do HTML ("Selecione…") -- indistinguível de "a conta não
    // tem projeto nenhum" e sem nenhum aviso visível do motivo real.
    select.innerHTML = '<option value="">Erro ao carregar — veja abaixo</option>';
    showSendStatus(`⚠ ${e.message}`, 'warn');
    refreshSendReadiness();
    return;
  }
  select.innerHTML = projects.length === 0
    ? '<option value="">Nenhum projeto na plataforma</option>'
    : '<option value="">Selecione…</option>';
  for (const p of projects) {
    const opt = document.createElement('option');
    opt.value = p.id;
    opt.textContent = p.name;
    select.appendChild(opt);
  }
  refreshSendReadiness();
}

$('sendProjectId').addEventListener('change', refreshSendReadiness);

// ─── Envio ───────────────────────────────────────────────────────────────

// O botão de enviar reflete "tem itens no orçamento" + "um projeto foi
// escolhido" — se a conexão (URL/chave) estiver faltando, isso só é
// descoberto (e avisado) no clique, pra não duplicar essa checagem aqui
// e em sendProductsToPlatform.
async function refreshSendReadiness() {
  const { products = [] } = await chrome.storage.local.get('products');
  $('budgetCount').textContent = products.length;
  $('sendBtn').disabled = products.length === 0 || !$('sendProjectId').value;
}

$('sendBtn').addEventListener('click', async () => {
  const { products = [] } = await chrome.storage.local.get('products');
  const projectId = $('sendProjectId').value;
  if (products.length === 0 || !projectId) return;

  $('sendBtn').disabled = true;
  $('sendBtn').textContent = 'Enviando…';

  const result = await sendProductsToPlatform(products, projectId);

  $('sendBtn').textContent = '☁ Enviar para a plataforma';
  await refreshSendReadiness();

  if (!result.configured) {
    showSendStatus('⚠ Configure a URL e a chave de API acima antes de enviar.', 'warn');
    return;
  }
  const areasNote = result.areasCreated.length > 0
    ? ` Ambiente(s) criado(s): ${result.areasCreated.join(', ')}.`
    : '';
  if (result.failed === 0) {
    showSendStatus(`✓ ${result.sent} produto(s) enviado(s) com sucesso.${areasNote}`, 'ok');
  } else {
    const preview = result.errors.slice(0, 3).join('; ');
    showSendStatus(
      `⚠ ${result.sent} enviado(s), ${result.failed} falharam: ${preview}${result.errors.length > 3 ? '…' : ''}${areasNote}`,
      'warn'
    );
  }
});

initSettingsForm();
loadProjects();
refreshSendReadiness();
