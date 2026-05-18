// library.js — Decorafit FF&E · Biblioteca de Projetos
//
// Controls the project library page (library.html), which lets the user save
// snapshots of the current budget as named projects, reload them later, and
// manage the saved project list (rename, delete, update).

const $ = id => document.getElementById(id);

// Module-level state
let projects           = [];   // all saved projects loaded from storage
let currentProducts    = [];   // products from the active (in-progress) budget
let currentProjectName = '';   // name of the active budget
let currentProjectId   = null; // id of the saved project the current budget was loaded from,
                               // or null if the budget was never saved / was cleared

// ─── Init ────────────────────────────────────────────────────────────────────

// Load all state from storage and render the page.
async function init() {
  const data = await chrome.storage.local.get(['products', 'projectName', 'currentProjectId', 'projects']);
  currentProducts    = data.products          || [];
  currentProjectName = data.projectName       || '';
  currentProjectId   = data.currentProjectId  || null;
  projects           = data.projects          || [];

  renderCurrentInfo();
  renderProjects();
}

// ─── Current budget info bar ──────────────────────────────────────────────────

// Updates the top bar that summarises the in-progress budget (name, count, total).
// Also shows/hides the "Atualizar" button — only relevant when the current budget
// was loaded from a saved project (i.e. currentProjectId is set and the project exists).
function renderCurrentInfo() {
  const name  = currentProjectName || 'Sem nome';
  const count = currentProducts.length;
  const total = fmt(currentProducts.reduce((s, p) => s + (p.price || 0) * (p.qty || 1), 0));

  $('currentName').textContent = name;
  $('currentMeta').textContent = `${count} produto${count !== 1 ? 's' : ''} · ${total}`;

  // linked is the saved project this budget originated from, if any
  const linked = currentProjectId && projects.find(p => p.id === currentProjectId);
  $('updateBtn').style.display = linked ? '' : 'none';
  if (linked) $('updateBtn').textContent = `↺ Atualizar "${linked.name}"`;
}

// ─── Project list ─────────────────────────────────────────────────────────────

// Rebuilds the project card list from scratch each time.
// [...projects].reverse() creates a shallow copy before reversing so the
// module-level array is never mutated — the stored order (oldest first) is preserved.
function renderProjects() {
  const list = $('projectList');
  list.innerHTML = '';

  if (projects.length === 0) {
    $('emptyState').style.display = '';
    return;
  }
  $('emptyState').style.display = 'none';

  // Show most recent project first
  [...projects].reverse().forEach(proj => {
    list.appendChild(buildCard(proj));
  });
}

// Builds the DOM card for a single saved project.
function buildCard(proj) {
  const card = document.createElement('div');
  card.className  = 'project-card';
  card.dataset.id = proj.id;

  // Track whether this project is the one currently loaded in the budget
  const isActive = proj.id === currentProjectId;

  const count = proj.products?.length || 0;
  const total = (proj.products || []).reduce((s, p) => s + (p.price || 0) * (p.qty || 1), 0);
  // Format the saved date in Brazilian short format: "18/05/2026"
  const date  = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })
    .format(new Date(proj.savedAt));

  // Open folder icon for the active project, closed folder for others
  const icon = document.createElement('div');
  icon.className   = 'project-icon';
  icon.textContent = isActive ? '📂' : '📁';

  // ── Project info (name + metadata) ──
  const info = document.createElement('div');
  info.className = 'project-info';

  const nameWrap = document.createElement('div');
  nameWrap.className = 'project-name-wrap';

  const nameEl = document.createElement('div');
  nameEl.className   = 'project-name';
  nameEl.textContent = proj.name;
  nameEl.title       = proj.name; // tooltip in case the name is truncated

  // Small pencil button to trigger inline rename
  const editBtn = document.createElement('button');
  editBtn.className  = 'act-btn';
  editBtn.style.cssText = 'padding:2px 7px;font-size:10px;flex-shrink:0';
  editBtn.textContent = '✎';
  editBtn.title      = 'Renomear';

  nameWrap.append(nameEl, editBtn);

  const meta = document.createElement('div');
  meta.className   = 'project-meta';
  meta.textContent = `Salvo em ${date} · ${count} produto${count !== 1 ? 's' : ''}`;

  info.append(nameWrap, meta);

  // ── Total value ──
  const totalEl = document.createElement('div');
  totalEl.className   = 'project-total';
  totalEl.textContent = fmt(total);

  // ── Action buttons ──
  const actions = document.createElement('div');
  actions.className = 'project-actions';

  const loadBtn = document.createElement('button');
  loadBtn.className   = 'act-btn load';
  loadBtn.textContent = isActive ? '✓ Em uso' : 'Carregar';
  loadBtn.disabled    = isActive; // disable if already the active project

  const delBtn = document.createElement('button');
  delBtn.className   = 'act-btn del';
  delBtn.textContent = '✕';
  delBtn.title       = 'Excluir projeto';

  actions.append(loadBtn, delBtn);
  card.append(icon, info, totalEl, actions);

  loadBtn.addEventListener('click', () => loadProject(proj));
  delBtn.addEventListener('click',  () => deleteProject(proj.id));
  editBtn.addEventListener('click', () => startRename(card, proj, nameEl, editBtn));

  return card;
}

// ─── Inline rename ────────────────────────────────────────────────────────────

// Replaces the project name div with a text input in-place for inline editing.
// The edit is committed on Enter, the ✓ button click, or cancelled on Escape.
function startRename(card, proj, nameEl, editBtn) {
  const input = document.createElement('input');
  input.className = 'project-name-input';
  input.value     = proj.name;
  nameEl.replaceWith(input); // DOM swap — no need to hide/show, the node is replaced
  editBtn.textContent = '✓'; // change icon to confirm button
  input.focus();
  input.select(); // pre-select text for quick replacement

  const commit = async () => {
    // Fall back to the original name if the user clears the field
    const newName = input.value.trim() || proj.name;
    proj.name = newName; // mutate the object in the projects array directly
    await saveProjectsToStorage();

    // If the renamed project is the one currently loaded, keep projectName in sync
    // so the popup's project name input reflects the change immediately
    if (proj.id === currentProjectId) {
      currentProjectName = newName;
      await chrome.storage.local.set({ projectName: newName });
      renderCurrentInfo();
    }
    renderProjects();
    showToast(`Projeto renomeado para "${newName}"`);
  };

  // { once: true } auto-removes the listener after first call, preventing double-commit
  editBtn.addEventListener('click', commit, { once: true });

  input.addEventListener('keydown', e => {
    if (e.key === 'Enter')  commit();
    if (e.key === 'Escape') renderProjects(); // discard and re-render original
  });

  // setTimeout 150ms: gives any pending click on editBtn time to fire its 'commit'
  // handler before blur triggers renderProjects and removes the input from the DOM
  input.addEventListener('blur', () => setTimeout(renderProjects, 150));
}

// ─── Load project ─────────────────────────────────────────────────────────────

// Replaces the in-progress budget with the selected project's saved snapshot.
// Sets currentProjectId so the "Atualizar" button becomes available.
async function loadProject(proj) {
  if (!confirm(`Carregar o projeto "${proj.name}"?\n\nO orçamento atual será substituído.`)) return;

  await chrome.storage.local.set({
    products:         proj.products || [],
    projectName:      proj.name,
    currentProjectId: proj.id       // link the budget to this project for future updates
  });

  // Mirror the storage write into module state
  currentProducts    = proj.products || [];
  currentProjectName = proj.name;
  currentProjectId   = proj.id;

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

  // If the deleted project was the active one, clear the link so "Atualizar"
  // disappears and the user can't accidentally update a non-existent project
  if (currentProjectId === id) {
    currentProjectId = null;
    await chrome.storage.local.set({ currentProjectId: null });
    renderCurrentInfo();
  }

  renderProjects();
  showToast(`"${proj.name}" excluído`);
}

// ─── Save as new project ──────────────────────────────────────────────────────

$('saveNewBtn').addEventListener('click', async () => {
  if (currentProducts.length === 0) {
    showToast('⚠ O orçamento atual está vazio');
    return;
  }

  const defaultName = currentProjectName || `Projeto ${new Intl.DateTimeFormat('pt-BR').format(new Date())}`;
  const name = prompt('Nome do projeto:', defaultName);
  if (!name) return; // user cancelled

  const proj = {
    id:      Date.now(),
    name:    name.trim() || defaultName,
    savedAt: new Date().toISOString(),
    // Deep-copy so the saved snapshot is independent of the live budget array.
    // Without this, later edits to currentProducts would silently mutate the saved data.
    products: JSON.parse(JSON.stringify(currentProducts))
  };

  projects.push(proj);
  await saveProjectsToStorage();

  // Link the current session to the new project so "Atualizar" becomes available
  currentProjectId   = proj.id;
  currentProjectName = proj.name;
  await chrome.storage.local.set({ currentProjectId: proj.id, projectName: proj.name });

  renderCurrentInfo();
  renderProjects();
  showToast(`✓ "${proj.name}" salvo`);
});

// ─── Update existing project ──────────────────────────────────────────────────

// Overwrites the saved snapshot with the current budget's products.
// Only visible when the active budget is linked to a saved project (currentProjectId set).
$('updateBtn').addEventListener('click', async () => {
  const proj = projects.find(p => p.id === currentProjectId);
  if (!proj) return;
  if (!confirm(`Atualizar "${proj.name}" com o orçamento atual?`)) return;

  // Deep-copy — same reasoning as in saveNewBtn handler above
  proj.products = JSON.parse(JSON.stringify(currentProducts));
  proj.savedAt  = new Date().toISOString(); // update timestamp to reflect new save
  await saveProjectsToStorage();

  renderProjects();
  showToast(`✓ "${proj.name}" atualizado`);
});

// ─── Back ─────────────────────────────────────────────────────────────────────

$('backBtn').addEventListener('click', () => window.close());

// ─── Storage helper ───────────────────────────────────────────────────────────

// All writes to the projects array go through this single function so there's one
// place to add logging, validation, or migration logic in the future.
async function saveProjectsToStorage() {
  await chrome.storage.local.set({ projects });
}

// ─── Utilities ────────────────────────────────────────────────────────────────

// Formats a number as Brazilian currency: "R$ 1.234,56"
function fmt(n) {
  return 'R$ ' + (n || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// Shows a temporary toast notification that auto-hides after 3 seconds.
// Replaces className with 'show' (rather than toggling) so rapid calls
// always trigger a fresh CSS transition from the hidden base state.
let toastTimer;
function showToast(msg) {
  const t = $('toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer); // cancel any pending hide from the previous toast
  toastTimer = setTimeout(() => t.classList.remove('show'), 3000);
}

// ─── Boot ─────────────────────────────────────────────────────────────────────
init();
