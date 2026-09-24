// library.js — Studio Araci FF&E · Biblioteca de Projetos Main Entry Point
// Main application controller for the project library page (library.html).

// ─── Init ────────────────────────────────────────────────────────────────────
async function init() {
  const data = await chrome.storage.local.get(['products', 'projectName', 'currentProjectId', 'projects']);
  currentProducts = data.products || [];
  currentProjectName = data.projectName || '';
  currentProjectId = data.currentProjectId || null;
  projects = data.projects || [];

  renderCurrentInfo();
  renderProjects();
}

// ─── Current budget info bar ──────────────────────────────────────────────────
function renderCurrentInfo() {
  const name = currentProjectName || 'Sem nome';
  const count = currentProducts.length;
  const total = fmt(currentProducts.reduce((s, p) => s + (p.price || 0) * (p.qty || 1), 0));

  $('currentName').textContent = name;
  $('currentMeta').textContent = `${count} produto${count !== 1 ? 's' : ''} · ${total}`;

  const linked = currentProjectId && projects.find(p => p.id === currentProjectId);
  $('updateBtn').style.display = linked ? '' : 'none';
  if (linked) $('updateBtn').textContent = `↺ Atualizar "${linked.name}"`;
}

// ─── Project list ─────────────────────────────────────────────────────────────
function renderProjects() {
  const list = $('projectList');
  list.innerHTML = '';

  if (projects.length === 0) {
    $('emptyState').style.display = '';
    return;
  }
  $('emptyState').style.display = 'none';

  [...projects].reverse().forEach(proj => {
    list.appendChild(buildCard(proj));
  });
}

function buildCard(proj) {
  const card = document.createElement('div');
  card.className = 'project-card';
  card.dataset.id = proj.id;

  const isActive = proj.id === currentProjectId;

  const count = proj.products?.length || 0;
  const total = (proj.products || []).reduce((s, p) => s + (p.price || 0) * (p.qty || 1), 0);
  const date = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })
    .format(new Date(proj.savedAt));

  const icon = document.createElement('div');
  icon.className = 'project-icon';
  icon.textContent = isActive ? '📂' : '📁';

  const info = document.createElement('div');
  info.className = 'project-info';

  const nameWrap = document.createElement('div');
  nameWrap.className = 'project-name-wrap';

  const nameEl = document.createElement('div');
  nameEl.className = 'project-name';
  nameEl.textContent = proj.name;
  nameEl.title = proj.name;

  const editBtn = document.createElement('button');
  editBtn.className = 'act-btn';
  editBtn.style.cssText = 'padding:2px 7px;font-size:10px;flex-shrink:0';
  editBtn.textContent = '✎';
  editBtn.title = 'Renomear';

  nameWrap.append(nameEl, editBtn);

  const meta = document.createElement('div');
  meta.className = 'project-meta';
  meta.textContent = `Salvo em ${date} · ${count} produto${count !== 1 ? 's' : ''}`;

  info.append(nameWrap, meta);

  const totalEl = document.createElement('div');
  totalEl.className = 'project-total';
  totalEl.textContent = fmt(total);

  const actions = document.createElement('div');
  actions.className = 'project-actions';

  const loadBtn = document.createElement('button');
  loadBtn.className = 'act-btn load';
  loadBtn.textContent = isActive ? '✓ Em uso' : 'Carregar';
  loadBtn.disabled = isActive;

  const delBtn = document.createElement('button');
  delBtn.className = 'act-btn del';
  delBtn.textContent = '✕';
  delBtn.title = 'Excluir projeto';

  const expandBtn = document.createElement('button');
  expandBtn.className = 'act-btn expand';
  expandBtn.textContent = '▼ Ver itens';

  const shareBtn = document.createElement('button');
  shareBtn.className = 'act-btn';
  shareBtn.textContent = '📋 Compartilhar';
  shareBtn.title = 'Baixar projeto como .txt e copiar para a área de transferência';
  shareBtn.addEventListener('click', () => shareProject(proj));

  const pdfBtn = document.createElement('button');
  pdfBtn.className = 'act-btn';
  pdfBtn.textContent = '⬇ PDF';
  pdfBtn.title = `Exportar "${proj.name}" em PDF`;
  pdfBtn.addEventListener('click', () =>
    openPrintFor({ name: proj.name, products: proj.products || [] }));

  const xlsxBtn = document.createElement('button');
  xlsxBtn.className = 'act-btn';
  xlsxBtn.textContent = '📊 Excel';
  xlsxBtn.title = `Exportar "${proj.name}" em Excel`;
  xlsxBtn.addEventListener('click', () => {
    openPrintFor({ name: proj.name, products: proj.products || [] });
    showToast('Na aba que abriu, clique em "📊 Salvar Excel"');
  });

  // Painel (buildSendPanel, em library-platform-send.js) pede só o
  // Projeto na plataforma -- o ambiente de cada item vem do próprio
  // orçamento, não é escolhido aqui. Toggle igual ao expandBtn/itemsPanel
  // logo abaixo: primeiro clique abre, segundo fecha.
  const sendBtn = document.createElement('button');
  sendBtn.className = 'act-btn';
  sendBtn.textContent = '☁ Enviar';
  sendBtn.title = `Enviar "${proj.name}" para a plataforma`;

  let sendPanel = null;
  sendBtn.addEventListener('click', () => {
    if (sendPanel) {
      sendPanel.remove();
      sendPanel = null;
      return;
    }
    if ((proj.products || []).length === 0) {
      showToast('⚠ Este projeto não tem itens.');
      return;
    }
    sendPanel = buildSendPanel(proj, () => { sendPanel.remove(); sendPanel = null; });
    cardWrap.appendChild(sendPanel);
  });

  actions.append(expandBtn, pdfBtn, xlsxBtn, shareBtn, sendBtn, loadBtn, delBtn);

  const cardWrap = document.createElement('div');
  cardWrap.style.cssText = 'margin-bottom:10px';

  card.style.marginBottom = '0';
  card.append(icon, info, totalEl, actions);
  cardWrap.appendChild(card);

  loadBtn.addEventListener('click', () => loadProject(proj));
  delBtn.addEventListener('click', () => deleteProject(proj.id));
  editBtn.addEventListener('click', () => startRename(card, proj, nameEl, editBtn));

  function refreshCard() {
    const items = proj.products || [];
    const n = items.length;
    totalEl.textContent = fmt(items.reduce((s, p) => s + (p.price || 0) * (p.qty || 1), 0));
    meta.textContent = `Salvo em ${date} · ${n} produto${n !== 1 ? 's' : ''}`;
  }

  let itemsPanel = null;
  expandBtn.addEventListener('click', () => {
    if (itemsPanel) {
      itemsPanel.remove();
      itemsPanel = null;
      expandBtn.textContent = '▼ Ver itens';
      return;
    }
    itemsPanel = buildItemsPanel(proj, refreshCard);
    cardWrap.appendChild(itemsPanel);
    expandBtn.textContent = '▲ Ocultar';
  });

  return cardWrap;
}

// ─── Inline rename ────────────────────────────────────────────────────────────
function startRename(card, proj, nameEl, editBtn) {
  const input = document.createElement('input');
  input.className = 'project-name-input';
  input.value = proj.name;
  nameEl.replaceWith(input);
  editBtn.textContent = '✓';
  input.focus();
  input.select();

  const commit = async () => {
    const newName = input.value.trim() || proj.name;
    proj.name = newName;
    await saveProjectsToStorage();

    if (proj.id === currentProjectId) {
      currentProjectName = newName;
      await chrome.storage.local.set({ projectName: newName });
      renderCurrentInfo();
    }
    renderProjects();
    showToast(`Projeto renomeado para "${newName}"`);
  };

  editBtn.addEventListener('click', commit, { once: true });

  input.addEventListener('keydown', e => {
    if (e.key === 'Enter') commit();
    if (e.key === 'Escape') renderProjects();
  });

  input.addEventListener('blur', () => setTimeout(renderProjects, 150));
}

// ─── Load project ─────────────────────────────────────────────────────────────
async function loadProject(proj) {
  if (!confirm(`Carregar o projeto "${proj.name}"?\n\nO orçamento atual será substituído.`)) return;

  await chrome.storage.local.set({
    products: proj.products || [],
    projectName: proj.name,
    currentProjectId: proj.id
  });

  currentProducts = proj.products || [];
  currentProjectName = proj.name;
  currentProjectId = proj.id;

  renderCurrentInfo();
  renderProjects();
  showToast(`✓ "${proj.name}" carregado`);
}

// ─── Delete project ───────────────────────────────────────────────────────────
async function deleteProject(id) {
  const proj = projects.find(p => p.id === id);
  if (!proj) return;
  if (!confirm(`Excluir o projeto "${proj.name}"? Esta ação não pode ser desfeita.`)) return;

  projects = projects.filter(p => p.id !== id);
  await saveProjectsToStorage();

  if (currentProjectId === id) {
    currentProjectId = null;
    await chrome.storage.local.set({ currentProjectId: null });
    renderCurrentInfo();
  }

  renderProjects();
  showToast(`"${proj.name}" excluído`);
}

// ─── Button Listeners & Event Setup ───────────────────────────────────────────
$('saveNewBtn').addEventListener('click', async () => {
  if (currentProducts.length === 0) {
    showToast('⚠ O orçamento atual está vazio');
    return;
  }

  const defaultName = currentProjectName || `Projeto ${new Intl.DateTimeFormat('pt-BR').format(new Date())}`;
  const name = prompt('Nome do projeto:', defaultName);
  if (!name) return;

  const proj = {
    id: crypto.randomUUID(),
    name: name.trim() || defaultName,
    savedAt: new Date().toISOString(),
    products: JSON.parse(JSON.stringify(currentProducts))
  };

  projects.push(proj);
  await saveProjectsToStorage();

  currentProjectId = proj.id;
  currentProjectName = proj.name;
  await chrome.storage.local.set({ currentProjectId: proj.id, projectName: proj.name });

  renderCurrentInfo();
  renderProjects();
  showToast(`✓ "${proj.name}" salvo`);
});

$('updateBtn').addEventListener('click', async () => {
  const proj = projects.find(p => p.id === currentProjectId);
  if (!proj) return;
  if (!confirm(`Atualizar "${proj.name}" com o orçamento atual?`)) return;

  proj.products = JSON.parse(JSON.stringify(currentProducts));
  proj.savedAt = new Date().toISOString();
  await saveProjectsToStorage();

  renderProjects();
  showToast(`✓ "${proj.name}" atualizado`);
});

$('backBtn').addEventListener('click', () => window.close());

$('settingsBtn').addEventListener('click', () => {
  chrome.runtime.sendMessage({ action: 'openOptions' }, () => {
    if (chrome.runtime.lastError) {
      chrome.tabs.create({ url: chrome.runtime.getURL('options.html') });
    }
  });
});

$('exportBtn').addEventListener('click', () => openPrintFor(null));

$('exportXlsxBtn').addEventListener('click', () => {
  openPrintFor(null);
  showToast('Na aba que abriu, clique em "📊 Salvar Excel"');
});

// Import modal listeners
$('importBtn').addEventListener('click', () => openImportModal());
$('importCancelBtn').addEventListener('click', () => closeImportModal());
$('importCodeBtn').addEventListener('click', () => processImportCode());

$('importModal').addEventListener('click', (e) => {
  if (e.target === $('importModal')) closeImportModal();
});

$('importDropzone').addEventListener('click', () => $('importFileInput').click());

$('importFileInput').addEventListener('change', (e) => {
  processImportFile(e.target.files[0]);
});

$('importDropzone').addEventListener('dragover', (e) => {
  e.preventDefault();
  $('importDropzone').classList.add('dragover');
});
$('importDropzone').addEventListener('dragleave', () => {
  $('importDropzone').classList.remove('dragover');
});
$('importDropzone').addEventListener('drop', (e) => {
  e.preventDefault();
  $('importDropzone').classList.remove('dragover');
  processImportFile(e.dataTransfer.files[0]);
});

// Boot
init();
