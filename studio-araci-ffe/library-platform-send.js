// library-platform-send.js — Studio Araci FF&E · Enviar projeto salvo para a plataforma
//
// Painel aberto pelo botão "☁ Enviar" de um card da Biblioteca (ver
// buildCard em library.js). Só pede o Projeto na plataforma -- o
// ambiente de cada item vem do próprio campo "Ambiente" que o orçamento
// já tem (ver sendProductsToPlatform em platform-sync.js), então não há
// mais um segundo seletor nem um "criar ambiente" aqui: a extensão já
// sabe pra qual cômodo cada produto é.
//
// Projeto não é lembrado como padrão em lugar nenhum -- cada projeto
// salvo na Biblioteca pode ir para um projeto diferente na plataforma,
// então perguntar de novo a cada envio é o comportamento certo.
function buildSendPanel(proj, onClose) {
  const panel = document.createElement('div');
  panel.className = 'send-panel';

  const row = document.createElement('div');
  row.className = 'send-panel-row';

  const projectSelect = document.createElement('select');
  projectSelect.innerHTML = '<option value="">Carregando projetos…</option>';
  projectSelect.disabled = true;

  row.append(projectSelect);

  const actionsRow = document.createElement('div');
  actionsRow.className = 'send-panel-actions';

  const confirmBtn = document.createElement('button');
  confirmBtn.type = 'button';
  confirmBtn.className = 'btn btn-primary';
  confirmBtn.disabled = true;
  const itemCount = (proj.products || []).length;
  confirmBtn.textContent = `☁ Enviar ${itemCount} ${itemCount === 1 ? 'item' : 'itens'}`;

  const status = document.createElement('span');
  status.className = 'send-panel-status';

  actionsRow.append(confirmBtn, status);
  panel.append(row, actionsRow);

  function setStatus(msg, type) {
    status.textContent = msg;
    status.className = 'send-panel-status' + (type ? ' ' + type : '');
  }

  projectSelect.addEventListener('change', () => {
    confirmBtn.disabled = !projectSelect.value;
  });

  confirmBtn.addEventListener('click', async () => {
    const projectId = projectSelect.value;
    if (!projectId) return;
    confirmBtn.disabled = true;
    confirmBtn.textContent = 'Enviando…';
    const result = await sendProductsToPlatform(proj.products || [], projectId);
    confirmBtn.textContent = `☁ Enviar ${itemCount} ${itemCount === 1 ? 'item' : 'itens'}`;

    if (!result.configured) {
      setStatus('⚠ Configure a URL e a chave de API em ⚙ Configurações antes de enviar.', 'warn');
      confirmBtn.disabled = false;
      return;
    }
    const areasNote = result.areasCreated.length > 0
      ? ` Ambiente(s) criado(s): ${result.areasCreated.join(', ')}.`
      : '';
    if (result.failed === 0) {
      showToast(`✓ ${result.sent} produto(s) enviado(s) para a plataforma.${areasNote}`);
      onClose();
      return;
    }
    setStatus(`⚠ ${result.sent} enviado(s), ${result.failed} falharam: ${result.errors.slice(0, 2).join('; ')}${areasNote}`, 'warn');
    console.warn('Studio Araci · falhas ao enviar para a plataforma:', result.errors);
    confirmBtn.disabled = false;
  });

  // Carrega os projetos por último, depois de todo o painel já montado —
  // o select existe desde o início (mostrando "Carregando…"), só o
  // conteúdo chega depois.
  fetchPlatformProjects()
    .then((projects) => {
      if (projects.length === 0) {
        projectSelect.innerHTML = '<option value="">Nenhum projeto — configure a integração em ⚙</option>';
        return;
      }
      projectSelect.innerHTML = '<option value="">Selecione…</option>';
      for (const p of projects) {
        const opt = document.createElement('option');
        opt.value = p.id;
        opt.textContent = p.name;
        projectSelect.appendChild(opt);
      }
      projectSelect.disabled = false;
    })
    .catch((e) => {
      projectSelect.innerHTML = '<option value="">Erro ao carregar</option>';
      setStatus(`⚠ ${e.message}`, 'warn');
    });

  return panel;
}
