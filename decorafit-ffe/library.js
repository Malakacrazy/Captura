// library.js — Decorafit FF&E · Biblioteca de Projetos

const $ = id => document.getElementById(id);

let projects = [];
let currentProducts = [];
let currentProjectName = '';
let currentProjectId = null;

// ─── Init ──────────────────────────────────────────────────────────────────

async function init() {
  const data = await chrome.storage.local.get(['products', 'projectName', 'currentProjectId', 'projects']);
  currentProducts   = data.products || [];
  currentProjectName = data.projectName || '';
  currentProjectId  = data.currentProjectId || null;
  projects          = data.projects || [];

  renderCurrentInfo();
  renderProjects();
}

// ─── Current budget info bar ───────────────────────────────────────────────

function renderCurrentInfo() {
  const name  = currentProjectName || 'Sem nome';
  const count = currentProducts.length;
  const total = fmt(currentProducts.reduce((s, p) => s + (p.price || 0) * (p.qty || 1), 0));

  $('currentName').textContent = name;
  $('currentMeta').textContent = `${count} produto${count !== 1 ? 's' : ''} · ${total}`;

  // Show "Atualizar" only when the current budget came from a saved project
  const linked = currentProjectId && projects.find(p => p.id === currentProjectId);
  $('updateBtn').style.display = linked ? '' : 'none';
  if (linked) $('updateBtn').textContent = `↺ Atualizar "${linked.name}"`;
}

// ─── Render project list ───────────────────────────────────────────────────

function renderProjects() {
  const list = $('projectList');
  list.innerHTML = '';

  if (projects.length === 0) {
    $('emptyState').style.display = '';
    return;
  }
  $('emptyState').style.display = 'none';

  // Most recent first
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
  const date  = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(new Date(proj.savedAt));

  // Icon
  const icon = document.createElement('div');
  icon.className = 'project-icon';
  icon.textContent = isActive ? '📂' : '📁';

  // Info
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

  // Total
  const totalEl = document.createElement('div');
  totalEl.className = 'project-total';
  totalEl.textContent = fmt(total);

  // Actions
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

  actions.append(loadBtn, delBtn);
  card.append(icon, info, totalEl, actions);

  // ── Handlers ──

  loadBtn.addEventListener('click', () => loadProject(proj));

  delBtn.addEventListener('click', () => deleteProject(proj.id));

  editBtn.addEventListener('click', () => startRename(card, proj, nameEl, editBtn));

  return card;
}

// ─── Rename inline ──────────────────────────────────────────────────────────

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
    // If this is the current project, update projectName too
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

// ─── Load project ───────────────────────────────────────────────────────────

async function loadProject(proj) {
  if (!confirm(`Carregar o projeto "${proj.name}"?\n\nO orçamento atual será substituído.`)) return;

  await chrome.storage.local.set({
    products:         proj.products || [],
    projectName:      proj.name,
    currentProjectId: proj.id
  });

  currentProducts    = proj.products || [];
  currentProjectName = proj.name;
  currentProjectId   = proj.id;

  renderCurrentInfo();
  renderProjects();
  showToast(`✓ "${proj.name}" carregado`);
}

// ─── Delete project ─────────────────────────────────────────────────────────

async function deleteProject(id) {
  const proj = projects.find(p => p.id === id);
  if (!proj) return;
  if (!confirm(`Excluir o projeto "${proj.name}"? Esta ação não pode ser desfeita.`)) return;

  projects = projects.filter(p => p.id !== id);
  await saveProjectsToStorage();

  // If the deleted project was the current one, clear the link
  if (currentProjectId === id) {
    currentProjectId = null;
    await chrome.storage.local.set({ currentProjectId: null });
    renderCurrentInfo();
  }

  renderProjects();
  showToast(`"${proj.name}" excluído`);
}

// ─── Save as new project ────────────────────────────────────────────────────

$('saveNewBtn').addEventListener('click', async () => {
  if (currentProducts.length === 0) {
    showToast('⚠ O orçamento atual está vazio');
    return;
  }

  const defaultName = currentProjectName || `Projeto ${new Intl.DateTimeFormat('pt-BR').format(new Date())}`;
  const name = prompt('Nome do projeto:', defaultName);
  if (!name) return;

  const proj = {
    id:       Date.now(),
    name:     name.trim() || defaultName,
    savedAt:  new Date().toISOString(),
    products: JSON.parse(JSON.stringify(currentProducts)) // deep copy
  };

  projects.push(proj);
  await saveProjectsToStorage();

  // Link current session to this new project
  currentProjectId   = proj.id;
  currentProjectName = proj.name;
  await chrome.storage.local.set({ currentProjectId: proj.id, projectName: proj.name });

  renderCurrentInfo();
  renderProjects();
  showToast(`✓ "${proj.name}" salvo`);
});

// ─── Update existing project ────────────────────────────────────────────────

$('updateBtn').addEventListener('click', async () => {
  const proj = projects.find(p => p.id === currentProjectId);
  if (!proj) return;
  if (!confirm(`Atualizar "${proj.name}" com o orçamento atual?`)) return;

  proj.products = JSON.parse(JSON.stringify(currentProducts));
  proj.savedAt  = new Date().toISOString();
  await saveProjectsToStorage();

  renderProjects();
  showToast(`✓ "${proj.name}" atualizado`);
});

// ─── Back button ────────────────────────────────────────────────────────────

$('backBtn').addEventListener('click', () => window.close());

// ─── Storage helper ─────────────────────────────────────────────────────────

async function saveProjectsToStorage() {
  await chrome.storage.local.set({ projects });
}

// ─── Utilities ──────────────────────────────────────────────────────────────

function fmt(n) {
  return 'R$ ' + (n || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

let toastTimer;
function showToast(msg) {
  const t = $('toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 3000);
}

// ─── Boot ────────────────────────────────────────────────────────────────────
init();
