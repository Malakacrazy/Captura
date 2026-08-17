// options.js — Studio Araci FF&E · Página de Configurações
//
// getPlatformSettings/savePlatformSettings/sendProductsToPlatform vêm de
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
  refreshSendButtonState();
});

// O botão de enviar só reflete "tem itens no orçamento" — se a
// configuração estiver faltando, isso só é descoberto (e avisado) no
// clique, para não duplicar a lógica de "está configurado?" em dois
// lugares (aqui e em sendProductsToPlatform).
async function refreshSendButtonState() {
  const { products = [] } = await chrome.storage.local.get('products');
  $('budgetCount').textContent = products.length;
  $('sendBtn').disabled = products.length === 0;
}

$('sendBtn').addEventListener('click', async () => {
  const { products = [] } = await chrome.storage.local.get('products');
  if (products.length === 0) return;

  $('sendBtn').disabled = true;
  $('sendBtn').textContent = 'Enviando…';

  const result = await sendProductsToPlatform(products);

  $('sendBtn').textContent = '☁ Enviar para a plataforma';
  $('sendBtn').disabled = products.length === 0;

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
refreshSendButtonState();
