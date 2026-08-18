// library.js — Studio Araci FF&E · Biblioteca de Projetos
//
// Controls the project library page (library.html), which lets the user save
// snapshots of the current budget as named projects, reload them later, and
// manage the saved project list (rename, delete, update).

const $ = id => document.getElementById(id);

// Module-level state
let projects = [];   // all saved projects loaded from storage
let currentProducts = [];   // products from the active (in-progress) budget
let currentProjectName = '';   // name of the active budget
let currentProjectId = null; // id of the saved project the current budget was loaded from,
// or null if the budget was never saved / was cleared

// ─── Init ────────────────────────────────────────────────────────────────────

// Load all state from storage and render the page.
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

// Updates the top bar that summarises the in-progress budget (name, count, total).
// Also shows/hides the "Atualizar" button — only relevant when the current budget
// was loaded from a saved project (i.e. currentProjectId is set and the project exists).
function renderCurrentInfo() {
  const name = currentProjectName || 'Sem nome';
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
  card.className = 'project-card';
  card.dataset.id = proj.id;

  // Track whether this project is the one currently loaded in the budget
  const isActive = proj.id === currentProjectId;

  const count = proj.products?.length || 0;
  const total = (proj.products || []).reduce((s, p) => s + (p.price || 0) * (p.qty || 1), 0);
  // Format the saved date in Brazilian short format: "18/05/2026"
  const date = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })
    .format(new Date(proj.savedAt));

  // Open folder icon for the active project, closed folder for others
  const icon = document.createElement('div');
  icon.className = 'project-icon';
  icon.textContent = isActive ? '📂' : '📁';

  // ── Project info (name + metadata) ──
  const info = document.createElement('div');
  info.className = 'project-info';

  const nameWrap = document.createElement('div');
  nameWrap.className = 'project-name-wrap';

  const nameEl = document.createElement('div');
  nameEl.className = 'project-name';
  nameEl.textContent = proj.name;
  nameEl.title = proj.name; // tooltip in case the name is truncated

  // Small pencil button to trigger inline rename
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

  // ── Total value ──
  const totalEl = document.createElement('div');
  totalEl.className = 'project-total';
  totalEl.textContent = fmt(total);

  // ── Action buttons ──
  const actions = document.createElement('div');
  actions.className = 'project-actions';

  const loadBtn = document.createElement('button');
  loadBtn.className = 'act-btn load';
  loadBtn.textContent = isActive ? '✓ Em uso' : 'Carregar';
  loadBtn.disabled = isActive; // disable if already the active project

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

  // Exportam ESTE projeto, não o orçamento em andamento.
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

  // Envia os produtos DESTE projeto salvo (não o orçamento em andamento)
  // para o projeto/ambiente da plataforma escolhidos no painel abaixo —
  // mesmo mecanismo (fetchPlatformProjects/Areas, sendProductsToPlatform)
  // usado pela página de Configurações, ver platform-sync.js. Precisa de
  // um projeto+ambiente escolhido primeiro (não dá pra enviar "para o
  // catálogo geral" — sem vínculo a um ambiente o item nunca aparece no
  // projeto que o usuário está de fato orçando), por isso abre um painel
  // em vez de enviar direto no clique, mesmo padrão de toggle do
  // expandBtn/itemsPanel logo abaixo.
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

  // Atualiza o cabeçalho do card sem redesenhar a lista inteira — redesenhar
  // fecharia o painel de itens que o usuário está editando. Editar preço ou
  // quantidade lá dentro precisa refletir aqui em cima na hora.
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

// ─── Painel de envio (projeto/ambiente na plataforma) ──────────────────────────
//
// Aberto pelo botão "☁ Enviar" de um card. Projeto e ambiente são
// escolhidos aqui, não guardados como padrão em lugar nenhum -- cada
// projeto salvo na Biblioteca pode ir para um projeto diferente na
// plataforma, então perguntar de novo a cada envio é o comportamento
// certo, não redundância. `onClose` é chamado depois de um envio
// bem-sucedido pra fechar o painel sozinho; erro mantém o painel aberto
// (com o status visível) pra tentar de novo sem reconfigurar do zero.
function buildSendPanel(proj, onClose) {
  const panel = document.createElement('div');
  panel.className = 'send-panel';

  const row = document.createElement('div');
  row.className = 'send-panel-row';

  const projectSelect = document.createElement('select');
  projectSelect.innerHTML = '<option value="">Carregando projetos…</option>';
  projectSelect.disabled = true;

  const areaSelect = document.createElement('select');
  areaSelect.innerHTML = '<option value="">Selecione um projeto primeiro…</option>';
  areaSelect.disabled = true;

  row.append(projectSelect, areaSelect);

  const toggleNewAreaBtn = document.createElement('button');
  toggleNewAreaBtn.type = 'button';
  toggleNewAreaBtn.className = 'act-btn';
  toggleNewAreaBtn.textContent = '+ Criar novo ambiente';
  toggleNewAreaBtn.style.display = 'none';
  toggleNewAreaBtn.style.alignSelf = 'flex-start';

  const newAreaRow = document.createElement('div');
  newAreaRow.className = 'send-new-area-row';
  newAreaRow.style.display = 'none';

  const newAreaInput = document.createElement('input');
  newAreaInput.type = 'text';
  newAreaInput.placeholder = 'Ex: Sala de estar';

  const createAreaBtn = document.createElement('button');
  createAreaBtn.type = 'button';
  createAreaBtn.className = 'act-btn';
  createAreaBtn.textContent = 'Criar';

  newAreaRow.append(newAreaInput, createAreaBtn);

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
  panel.append(row, toggleNewAreaBtn, newAreaRow, actionsRow);

  function setStatus(msg, type) {
    status.textContent = msg;
    status.className = 'send-panel-status' + (type ? ' ' + type : '');
  }

  function refreshConfirmState() {
    confirmBtn.disabled = !areaSelect.value;
  }

  async function loadAreasInto(projectId) {
    areaSelect.innerHTML = '<option value="">Carregando…</option>';
    areaSelect.disabled = true;
    toggleNewAreaBtn.style.display = 'none';
    const areas = await fetchPlatformAreas(projectId);
    areaSelect.innerHTML = '<option value="">Selecione…</option>';
    for (const a of areas) {
      const opt = document.createElement('option');
      opt.value = a.id;
      opt.textContent = a.name;
      areaSelect.appendChild(opt);
    }
    areaSelect.disabled = false;
    toggleNewAreaBtn.style.display = '';
    refreshConfirmState();
  }

  projectSelect.addEventListener('change', () => {
    const projectId = projectSelect.value;
    if (!projectId) {
      areaSelect.innerHTML = '<option value="">Selecione um projeto primeiro…</option>';
      areaSelect.disabled = true;
      toggleNewAreaBtn.style.display = 'none';
      refreshConfirmState();
      return;
    }
    loadAreasInto(projectId);
  });

  areaSelect.addEventListener('change', refreshConfirmState);

  toggleNewAreaBtn.addEventListener('click', () => {
    newAreaRow.style.display = newAreaRow.style.display === 'none' ? 'flex' : 'none';
    if (newAreaRow.style.display === 'flex') newAreaInput.focus();
  });

  createAreaBtn.addEventListener('click', async () => {
    const projectId = projectSelect.value;
    const name = newAreaInput.value.trim();
    if (!projectId || !name) {
      setStatus('⚠ Escolha o projeto e digite um nome para o ambiente.', 'warn');
      return;
    }
    createAreaBtn.disabled = true;
    try {
      const area = await createPlatformArea(projectId, name);
      await loadAreasInto(projectId);
      areaSelect.value = area.id;
      refreshConfirmState();
      newAreaRow.style.display = 'none';
      newAreaInput.value = '';
      setStatus(`✓ Ambiente "${area.name}" criado.`, 'ok');
    } catch (e) {
      setStatus(`⚠ ${e.message}`, 'warn');
    } finally {
      createAreaBtn.disabled = false;
    }
  });

  confirmBtn.addEventListener('click', async () => {
    const areaId = areaSelect.value;
    if (!areaId) return;
    confirmBtn.disabled = true;
    confirmBtn.textContent = 'Enviando…';
    const result = await sendProductsToPlatform(proj.products || [], areaId);
    confirmBtn.textContent = `☁ Enviar ${itemCount} ${itemCount === 1 ? 'item' : 'itens'}`;

    if (!result.configured) {
      setStatus('⚠ Configure a URL e a chave de API em ⚙ Configurações antes de enviar.', 'warn');
      confirmBtn.disabled = false;
      return;
    }
    if (result.failed === 0) {
      showToast(`✓ ${result.sent} produto(s) enviado(s) para a plataforma`);
      onClose();
      return;
    }
    setStatus(`⚠ ${result.sent} enviado(s), ${result.failed} falharam: ${result.errors.slice(0, 2).join('; ')}`, 'warn');
    console.warn('Studio Araci · falhas ao enviar para a plataforma:', result.errors);
    confirmBtn.disabled = false;
  });

  // Carrega os projetos por último, depois de todo o painel já montado —
  // os selects existem desde o início (mostrando "Carregando…"), só o
  // conteúdo chega depois.
  fetchPlatformProjects().then((projects) => {
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
  });

  return panel;
}

// ─── Ambientes ────────────────────────────────────────────────────────────────

// Sugestões padrão do campo Ambiente. O campo é de TEXTO LIVRE — esta lista só
// alimenta o autocompletar, não restringe o que pode ser digitado. Substituiu o
// dropdown de checkboxes, que limitava os ambientes a estes doze.
const AMBIENTES_PADRAO = [
  'Cozinha', 'Lavanderia', 'Banheiros', 'Suíte Master', 'Suíte 2', 'Suíte 3',
  'Dormitório 1', 'Dormitório 2', 'Dormitório 3', 'Dormitório 4', 'Terraço', 'Sala'
];

// <datalist> único da página, compartilhado por todos os campos de ambiente de
// todos os projetos expandidos — um datalist por linha duplicaria ids no HTML.
let ambienteDatalist = null;

function ensureAmbienteDatalist() {
  if (!ambienteDatalist) {
    ambienteDatalist = document.createElement('datalist');
    ambienteDatalist.id = 'studio-araci-ambientes';
    document.body.appendChild(ambienteDatalist);
  }
  return ambienteDatalist;
}

// Refaz as sugestões a partir dos padrões + tudo que já foi digitado em
// qualquer projeto salvo, para que um ambiente criado à mão ("Home Office")
// passe a ser oferecido nas próximas linhas.
function refreshAmbienteSuggestions() {
  const usados = new Set(AMBIENTES_PADRAO);
  projects.forEach(pr => (pr.products || []).forEach(p => {
    (Array.isArray(p.ambiente) ? p.ambiente : [p.ambiente])
      .forEach(a => { if (typeof a === 'string' && a.trim()) usados.add(a.trim()); });
  }));

  const dl = ensureAmbienteDatalist();
  dl.innerHTML = '';
  [...usados].sort((a, b) => a.localeCompare(b, 'pt-BR')).forEach(a => {
    const opt = document.createElement('option');
    opt.value = a;
    dl.appendChild(opt);
  });
}

// Ambiente continua sendo guardado como ARRAY — é o formato que o PDF e o Excel
// já esperam. O campo aceita vários separados por vírgula: "Cozinha, Lavanderia".
function parseAmbiente(texto) {
  return String(texto || '').split(',').map(s => s.trim()).filter(Boolean);
}

// ─── Painel de itens ──────────────────────────────────────────────────────────
//
// Tabela editável de um projeto. Os itens aparecem AGRUPADOS POR DISCIPLINA,
// cada grupo aberto por uma faixa colorida com contagem e subtotal, e podem ser
// REORDENADOS arrastando pela alça ⠿.
//
// O arraste é restrito à própria disciplina: um item nunca muda de categoria
// por acidente ao ser reposicionado. A ordem definida aqui é a mesma que sai no
// PDF e no Excel, que percorrem o array dentro de cada categoria.
function buildItemsPanel(proj, refreshCard) {
  const panel = document.createElement('div');
  panel.className = 'items-panel';

  // Referência VIVA ao array do projeto: reordenar dá splice direto nele
  const items = proj.products || [];
  if (items.length === 0) {
    panel.innerHTML = '<div style="padding:16px;text-align:center;color:#7A6A60;font-size:12px">Nenhum item neste projeto.</div>';
    return panel;
  }

  // ── Normalização de dados antigos ──
  // `migrou` evita gravar no storage a cada expansão quando nada mudou.
  let migrou = false;
  items.forEach(p => {
    // originalPrice é a base de comparação para detectar preço editado à mão
    if (p.originalPrice === undefined) { p.originalPrice = p.price || 0; migrou = true; }
    // Projetos antigos guardavam ambiente como string
    if (typeof p.ambiente === 'string' && p.ambiente) { p.ambiente = [p.ambiente]; migrou = true; }
    else if (!Array.isArray(p.ambiente)) { p.ambiente = []; migrou = true; }
  });
  if (migrou) saveProjectsToStorage();

  refreshAmbienteSuggestions();

  const NUM_COLS = 10; // alça, imagem, produto, un, ambiente, obs, preço, qtd, subtotal, excluir

  const table = document.createElement('table');
  table.className = 'items-table';

  const thead = document.createElement('thead');
  thead.innerHTML =
    '<tr><th></th><th></th><th>Produto</th><th>Un.</th><th>Ambiente</th>' +
    '<th>Obs.</th><th>Preço</th><th>Qtd</th><th>Subtotal</th><th></th></tr>';

  const tbody = document.createElement('tbody');
  table.append(thead, tbody);
  panel.appendChild(table);

  // Grava a alteração e propaga para o cabeçalho do card e para o orçamento
  // ativo, se este for o projeto carregado.
  function commit() {
    saveProjectsToStorage();
    syncIfActive(proj);
    refreshCard();
  }

  // Totais das faixas de disciplina, atualizados no lugar quando preço ou
  // quantidade mudam — redesenhar a tabela inteira tiraria o foco do campo que
  // o usuário está editando.
  const discTotals = new Map(); // catId → elemento do total

  function refreshDividerTotals() {
    for (const [catId, el] of discTotals) {
      el.textContent = fmt(items
        .filter(p => (p.category || 'outros') === catId)
        .reduce((s, p) => s + (p.price || 0) * (p.qty || 1), 0));
    }
  }

  // ── Arraste ──────────────────────────────────────────────────────────────

  let dragId = null; // id do item sendo arrastado
  let dragCat = null; // disciplina de origem — o alvo precisa ser a mesma
  let armed = null; // linha temporariamente arrastável (alça pressionada)

  function clearDropMarks() {
    tbody.querySelectorAll('.drop-before, .drop-after')
      .forEach(tr => tr.classList.remove('drop-before', 'drop-after'));
  }

  function disarm() {
    if (armed) { armed.draggable = false; armed = null; }
  }

  // Soltar o botão sem chegar a arrastar precisa desarmar a linha, senão ela
  // ficaria arrastável de qualquer ponto. O listener vive no painel, que é
  // removido ao recolher o projeto — nada fica pendurado em document.
  panel.addEventListener('mouseup', disarm);

  // Move `fromId` para antes (ou depois) de `toId` dentro do array plano.
  // Como a renderização agrupa por disciplina e o arraste é restrito à mesma
  // disciplina, basta acertar a ordem relativa: inserir na posição do alvo
  // resolve os dois sentidos (subir e descer).
  function moveItem(fromId, toId, depois) {
    if (fromId === toId) return;
    const from = items.findIndex(x => x.id === fromId);
    if (from === -1) return;

    const [movido] = items.splice(from, 1);
    const to = items.findIndex(x => x.id === toId);
    if (to === -1) { items.splice(from, 0, movido); return; } // alvo sumiu: desfaz

    items.splice(depois ? to + 1 : to, 0, movido);
    commit();
    renderRows();
  }

  // ── Faixa da disciplina ──────────────────────────────────────────────────

  function buildDividerRow(cat, grupo) {
    const tr = document.createElement('tr');
    tr.className = 'disc-row';

    const td = document.createElement('td');
    td.colSpan = NUM_COLS;

    const bar = document.createElement('div');
    bar.className = 'disc-bar disc-' + cat.id;

    const nome = document.createElement('span');
    nome.className = 'disc-name';
    nome.textContent = cat.label;

    const cnt = document.createElement('span');
    cnt.className = 'disc-count';
    cnt.textContent = grupo.length + (grupo.length === 1 ? ' item' : ' itens');

    const tot = document.createElement('span');
    tot.className = 'disc-total';
    tot.textContent = fmt(grupo.reduce((s, p) => s + (p.price || 0) * (p.qty || 1), 0));
    discTotals.set(cat.id, tot);

    bar.append(nome, cnt, tot);
    td.appendChild(bar);
    tr.appendChild(td);
    return tr;
  }

  // ── Linha de item ────────────────────────────────────────────────────────

  function buildItemRow(p, catId) {
    const tr = document.createElement('tr');
    tr.dataset.id = p.id;

    // Alça de arraste. A linha só vira arrastável enquanto a alça está
    // pressionada: com draggable="true" fixo, arrastar sobre os campos de texto
    // moveria a linha em vez de selecionar o texto.
    const tdHandle = document.createElement('td');
    tdHandle.className = 'drag-handle';
    tdHandle.textContent = '⠿';
    tdHandle.title = 'Arraste para reordenar dentro da disciplina';
    tdHandle.addEventListener('mousedown', () => { armed = tr; tr.draggable = true; });

    tr.addEventListener('dragstart', (e) => {
      dragId = p.id;
      dragCat = catId;
      e.dataTransfer.effectAllowed = 'move';
      // O Firefox só inicia o arraste se algo for escrito no dataTransfer
      e.dataTransfer.setData('text/plain', String(p.id));
      tr.classList.add('dragging');
    });

    tr.addEventListener('dragend', () => {
      tr.classList.remove('dragging');
      clearDropMarks();
      disarm();
      dragId = dragCat = null;
    });

    // Sem preventDefault no dragover o navegador recusa o drop. É exatamente
    // assim que o arraste entre disciplinas diferentes fica bloqueado: quando a
    // categoria não bate, saímos antes e a linha não aceita o item.
    tr.addEventListener('dragover', (e) => {
      if (dragCat !== catId || dragId === p.id) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      const r = tr.getBoundingClientRect();
      const depois = (e.clientY - r.top) > r.height / 2;
      tr.classList.toggle('drop-after', depois);
      tr.classList.toggle('drop-before', !depois);
    });

    tr.addEventListener('dragleave', () => tr.classList.remove('drop-before', 'drop-after'));

    tr.addEventListener('drop', (e) => {
      if (dragCat !== catId) return;
      e.preventDefault();
      const r = tr.getBoundingClientRect();
      const depois = (e.clientY - r.top) > r.height / 2;
      clearDropMarks();
      moveItem(dragId, p.id, depois);
    });

    // ── Imagem ──
    const tdImg = document.createElement('td');
    if (p.img) {
      const img = document.createElement('img');
      img.className = 'item-img';
      img.src = p.img;
      img.alt = p.name || '';
      img.addEventListener('error', () => {
        const ph = document.createElement('div');
        ph.className = 'item-img-ph';
        ph.textContent = '📦';
        img.replaceWith(ph);
      });
      tdImg.appendChild(img);
    } else {
      const ph = document.createElement('div');
      ph.className = 'item-img-ph';
      ph.textContent = '📦';
      tdImg.appendChild(ph);
    }

    // ── Nome (editável) + link para a página de origem ──
    const tdName = document.createElement('td');
    const nameWrap = document.createElement('div');
    nameWrap.className = 'name-cell';

    const nameInput = document.createElement('input');
    nameInput.type = 'text';
    nameInput.value = p.name || '';
    nameInput.addEventListener('change', () => {
      p.name = nameInput.value.trim() || p.name;
      nameInput.value = p.name;
      commit();
    });
    nameWrap.appendChild(nameInput);

    if (p.url) {
      const link = document.createElement('a');
      link.className = 'name-link';
      link.href = p.url;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      link.textContent = '🔗';
      link.title = 'Abrir página do produto';
      nameWrap.appendChild(link);
    }
    tdName.appendChild(nameWrap);

    // ── Unidade ──
    const tdUnit = document.createElement('td');
    const unitSelect = document.createElement('select');
    ['', 'un', 'm²', 'cx', 'metro', 'barra'].forEach(u => {
      const opt = document.createElement('option');
      opt.value = u;
      opt.textContent = u || '— Un. —';
      if ((p.unit || '') === u) opt.selected = true;
      unitSelect.appendChild(opt);
    });
    unitSelect.style.width = '70px';
    unitSelect.addEventListener('change', () => { p.unit = unitSelect.value; commit(); });
    tdUnit.appendChild(unitSelect);

    // ── Ambiente (texto livre com sugestões) ──
    const tdAmb = document.createElement('td');
    const ambInput = document.createElement('input');
    ambInput.type = 'text';
    ambInput.value = p.ambiente.join(', ');
    ambInput.placeholder = 'Ex: Cozinha, Sala';
    // `list` oferece as sugestões sem restringir: qualquer texto é aceito
    ambInput.setAttribute('list', 'studio-araci-ambientes');
    ambInput.addEventListener('change', () => {
      p.ambiente = parseAmbiente(ambInput.value);
      ambInput.value = p.ambiente.join(', '); // normaliza o espaçamento
      refreshAmbienteSuggestions();           // ambiente novo passa a ser sugerido
      commit();
    });
    tdAmb.appendChild(ambInput);

    // ── Observações ──
    const tdObs = document.createElement('td');
    const obsInput = document.createElement('input');
    obsInput.type = 'text';
    obsInput.value = p.obs || '';
    obsInput.placeholder = 'Adicionar...';
    obsInput.addEventListener('change', () => { p.obs = obsInput.value.trim(); commit(); });
    tdObs.appendChild(obsInput);

    // ── Subtotal (declarado antes dos handlers que o atualizam) ──
    const tdTotal = document.createElement('td');
    tdTotal.className = 'col-total';
    tdTotal.textContent = fmt((p.price || 0) * (p.qty || 1));

    // ── Preço (editável) + link obrigatório quando alterado ──
    const tdPrice = document.createElement('td');
    const priceWrap = document.createElement('div');
    priceWrap.className = 'price-edit-wrap';

    const priceInput = document.createElement('input');
    priceInput.type = 'number';
    priceInput.className = 'price-input';
    priceInput.step = '0.01';
    priceInput.min = '0';
    priceInput.value = p.price || 0;
    if (p.priceEdited) priceInput.classList.add('edited');

    const linkWrap = document.createElement('div');
    linkWrap.style.display = p.priceEdited ? '' : 'none';

    const linkLabel = document.createElement('div');
    linkLabel.className = 'diff-link-label';
    linkLabel.textContent = 'Link Preço Dif.:';

    const linkInput = document.createElement('input');
    linkInput.type = 'text';
    linkInput.className = 'diff-link-input';
    linkInput.value = p.diffPriceLink || '';
    linkInput.placeholder = 'Cole o link...';
    linkInput.addEventListener('change', () => {
      p.diffPriceLink = linkInput.value.trim();
      commit();
    });
    linkWrap.append(linkLabel, linkInput);

    priceInput.addEventListener('change', () => {
      const novo = parseFloat(priceInput.value) || 0;
      p.price = novo;
      // Tolerância de meio centavo evita marcar como editado por arredondamento
      const editado = Math.abs(novo - p.originalPrice) > 0.005;
      p.priceEdited = editado;
      if (!editado) { p.diffPriceLink = ''; linkInput.value = ''; }
      priceInput.classList.toggle('edited', editado);
      linkWrap.style.display = editado ? '' : 'none';
      tdTotal.textContent = fmt(novo * (p.qty || 1));
      refreshDividerTotals();
      commit();
    });

    priceWrap.append(priceInput, linkWrap);
    tdPrice.appendChild(priceWrap);

    // ── Quantidade: campo digitável entre os botões − e + ──
    const tdQty = document.createElement('td');
    const qtyWrap = document.createElement('div');
    qtyWrap.className = 'qty-wrap';

    const qtyInput = document.createElement('input');
    qtyInput.type = 'number';
    qtyInput.className = 'qty-input';
    qtyInput.min = '1';
    qtyInput.step = '1';
    qtyInput.value = p.qty || 1;

    // Somente inteiros: 2,5 é normalizado para 2 ao sair do campo.
    // `refletir` controla se o valor volta para dentro do input — durante a
    // digitação não mexemos no campo para não brigar com o cursor.
    const setQty = (valor, refletir) => {
      p.qty = Math.max(1, Math.floor(valor) || 1);
      if (refletir) qtyInput.value = p.qty;
      tdTotal.textContent = fmt((p.price || 0) * p.qty);
      refreshDividerTotals();
      commit();
    };

    // Enquanto digita, só aceitamos valores já válidos. Sem essa checagem, o
    // campo vazio no meio da digitação (apagar o "1" para escrever "40") seria
    // reescrito como 1 a cada tecla.
    qtyInput.addEventListener('input', () => {
      const v = parseInt(qtyInput.value, 10);
      if (Number.isFinite(v) && v >= 1) setQty(v, false);
    });
    // Ao sair do campo, normaliza e devolve o valor final para a tela
    qtyInput.addEventListener('change', () => setQty(parseInt(qtyInput.value, 10), true));
    // Enter confirma sem precisar sair do campo
    qtyInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') qtyInput.blur(); });

    const menos = document.createElement('button');
    menos.className = 'qty-step';
    menos.textContent = '−';
    menos.title = 'Diminuir';
    menos.addEventListener('click', () => setQty((p.qty || 1) - 1, true));

    const mais = document.createElement('button');
    mais.className = 'qty-step';
    mais.textContent = '+';
    mais.title = 'Aumentar';
    mais.addEventListener('click', () => setQty((p.qty || 1) + 1, true));

    qtyWrap.append(menos, qtyInput, mais);
    tdQty.appendChild(qtyWrap);

    // ── Excluir item (com confirmação) ──
    // Remove o item do array do projeto e regrava. renderRows() redesenha a
    // tabela inteira — necessário porque a contagem e o subtotal da faixa da
    // disciplina mudam, e a faixa some se era o último item dela.
    const tdDel = document.createElement('td');
    const delBtn = document.createElement('button');
    delBtn.className = 'item-del-btn';
    delBtn.textContent = '×';
    delBtn.title = 'Excluir item';
    delBtn.addEventListener('click', () => {
      const nome = p.name || 'este item';
      if (!confirm(`Excluir "${nome}" do projeto?\n\nEsta ação não pode ser desfeita.`)) return;
      const idx = items.findIndex(x => x.id === p.id);
      if (idx === -1) return;
      items.splice(idx, 1);
      commit();
      renderRows();
    });
    tdDel.appendChild(delBtn);

    tr.append(tdHandle, tdImg, tdName, tdUnit, tdAmb, tdObs, tdPrice, tdQty, tdTotal, tdDel);
    return tr;
  }

  // ── Montagem ─────────────────────────────────────────────────────────────

  // Percorre as disciplinas na ordem canônica; dentro de cada uma preserva a
  // ordem do array — que é justamente o que o arraste altera.
  function renderRows() {
    tbody.innerHTML = '';
    discTotals.clear();

    // Projeto esvaziado (último item excluído) — evita a tabela órfã só com
    // cabeçalho.
    if (items.length === 0) {
      const tr = document.createElement('tr');
      const td = document.createElement('td');
      td.colSpan = NUM_COLS;
      td.style.cssText = 'padding:16px;text-align:center;color:#7A6A60;font-size:12px';
      td.textContent = 'Nenhum item neste projeto.';
      tr.appendChild(td);
      tbody.appendChild(tr);
      return;
    }

    for (const cat of STUDIO_ARACI_CATEGORIES) {
      const grupo = items.filter(p => (p.category || 'outros') === cat.id);
      if (grupo.length === 0) continue;
      tbody.appendChild(buildDividerRow(cat, grupo));
      grupo.forEach(p => tbody.appendChild(buildItemRow(p, cat.id)));
    }
  }

  renderRows();
  return panel;
}

// If the edited project is the one currently loaded, sync changes to live storage
function syncIfActive(proj) {
  if (proj.id === currentProjectId) {
    currentProducts = proj.products || [];
    chrome.storage.local.set({ products: currentProducts });
  }
}

// ─── Inline rename ────────────────────────────────────────────────────────────

// Replaces the project name div with a text input in-place for inline editing.
// The edit is committed on Enter, the ✓ button click, or cancelled on Escape.
function startRename(card, proj, nameEl, editBtn) {
  const input = document.createElement('input');
  input.className = 'project-name-input';
  input.value = proj.name;
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
    if (e.key === 'Enter') commit();
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
    products: proj.products || [],
    projectName: proj.name,
    currentProjectId: proj.id       // link the budget to this project for future updates
  });

  // Mirror the storage write into module state
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
    // crypto.randomUUID() em vez de Date.now(), pelo mesmo motivo dos produtos:
    // ids gerados no mesmo milissegundo colidiam e as buscas por id (carregar,
    // excluir, sincronizar) passavam a acertar o projeto errado.
    id: crypto.randomUUID(),
    name: name.trim() || defaultName,
    savedAt: new Date().toISOString(),
    // Deep-copy so the saved snapshot is independent of the live budget array.
    // Without this, later edits to currentProducts would silently mutate the saved data.
    products: JSON.parse(JSON.stringify(currentProducts))
  };

  projects.push(proj);
  await saveProjectsToStorage();

  // Link the current session to the new project so "Atualizar" becomes available
  currentProjectId = proj.id;
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
  proj.savedAt = new Date().toISOString(); // update timestamp to reflect new save
  await saveProjectsToStorage();

  renderProjects();
  showToast(`✓ "${proj.name}" atualizado`);
});

// ─── Back ─────────────────────────────────────────────────────────────────────

$('backBtn').addEventListener('click', () => window.close());

$('settingsBtn').addEventListener('click', () => {
  chrome.runtime.sendMessage({ action: 'openOptions' }, () => {
    if (chrome.runtime.lastError) {
      chrome.tabs.create({ url: chrome.runtime.getURL('options.html') });
    }
  });
});

// Os botões do topo agem sobre o ORÇAMENTO EM ANDAMENTO (o que aparece na
// barra "Projeto atual"), por isso enviam payload nulo. Para exportar um
// projeto salvo existem os botões "⬇ PDF" e "📊 Excel" em cada card.
$('exportBtn').addEventListener('click', () => openPrintFor(null));

$('exportXlsxBtn').addEventListener('click', () => {
  openPrintFor(null);
  showToast('Na aba que abriu, clique em "📊 Salvar Excel"');
});

// ─── Exportação ───────────────────────────────────────────────────────────────

// A página print.html exporta o orçamento em andamento por padrão. Para
// exportar um PROJETO SALVO específico, gravamos antes a chave `printPayload`
// com o conteúdo daquele projeto.
//
// Antes os botões de exportar daqui abriam a página de impressão sem informar
// nada: quem expandia um projeto antigo e clicava em exportar recebia o
// orçamento atual, não o projeto que estava vendo.
async function openPrintFor(payload) {
  await chrome.storage.local.set({ printPayload: payload });
  chrome.runtime.sendMessage({ action: 'openPrint' });
}

// ─── Share / Import ───────────────────────────────────────────────────────

async function shareProject(proj) {
  const payload = {
    _studio_araci: 1,
    name: proj.name,
    savedAt: proj.savedAt,
    products: proj.products || []
  };

  const json = JSON.stringify(payload, null, 2);

  // Generate .txt file download
  const blob = new Blob([json], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  // Sanitise project name for use as a filename
  const safeName = (proj.name || 'projeto').replace(/[^a-zA-Z0-9À-ú\s\-_]/g, '').trim().replace(/\s+/g, '_');
  a.href = url;
  a.download = `studio_araci_${safeName}.txt`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);

  // Also copy to clipboard as convenience
  try {
    await navigator.clipboard.writeText(json);
    showToast('⬇ Arquivo baixado e copiado! Envie o .txt para o outro usuário.');
  } catch {
    showToast('⬇ Arquivo baixado! Envie o .txt para o outro usuário importar.');
  }
}

// ─── Import modal ─────────────────────────────────────────────────────────────

function openImportModal() {
  $('importModal').classList.add('open');
  $('importFileInput').value = ''; // reset so same file can be re-selected
  $('importCodeInput').value = ''; // clear any previously pasted code
}

function closeImportModal() {
  $('importModal').classList.remove('open');
}

// ─── Saneamento da importação ─────────────────────────────────────────────────
//
// Um arquivo .txt (ou um código colado) vem de fora e não é confiável: pode ter
// sido editado à mão ou montado por terceiros. A versão anterior só conferia
// `_studio_araci` / `_parse` e `Array.isArray(products)` e gravava o resto como veio.
//
// O risco concreto não é script injetado (todo texto entra por textContent/value
// e a CSP do MV3 bloqueia javascript: em href), e sim os campos de URL: um `img`
// apontando para um endereço arbitrário faz o navegador buscar aquele recurso
// assim que a biblioteca é aberta, entregando IP e horário a quem enviou o
// arquivo. Por isso só aceitamos http/https e descartamos o resto.

// Aceita apenas http(s) absolutos. Devolve '' para qualquer outra coisa
// (javascript:, data:, file:, chrome-extension:, lixo não parseável).
function safeUrl(raw) {
  if (typeof raw !== 'string' || !raw) return '';
  try {
    const u = new URL(raw);
    return (u.protocol === 'http:' || u.protocol === 'https:') ? u.href : '';
  } catch {
    return '';
  }
}

const MAX_IMPORT_PRODUCTS = 5000; // teto de sanidade contra arquivos absurdos

// Reconstrói um produto campo a campo, com tipos e limites conhecidos.
// Devolve null para entradas irrecuperáveis (sem nome), que são descartadas.
function sanitizeImportedProduct(raw) {
  if (!raw || typeof raw !== 'object') return null;

  const str = (v, max) => (typeof v === 'string' ? v.slice(0, max).trim() : '');
  const num = (v) => { const n = Number(v); return Number.isFinite(n) && n >= 0 ? n : 0; };

  const name = str(raw.name, 300);
  if (!name) return null;

  // ambiente aceita array (formato atual) ou string (projetos antigos)
  const ambiente = Array.isArray(raw.ambiente)
    ? raw.ambiente.filter(a => typeof a === 'string').slice(0, 30).map(a => a.slice(0, 60))
    : (typeof raw.ambiente === 'string' && raw.ambiente ? [raw.ambiente.slice(0, 60)] : []);

  // Categoria desconhecida vira 'outros' em vez de criar uma seção fantasma
  // que o PDF e o Excel não sabem renderizar.
  const category = STUDIO_ARACI_CATEGORIES.some(c => c.id === raw.category)
    ? raw.category
    : 'outros';

  const price = num(raw.price);

  return {
    id: crypto.randomUUID(), // id novo: nunca confiar no id de origem
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

// Valida um payload Studio Araci já parseado e salva como projeto novo.
// Compartilhado pelos dois caminhos de importação (arquivo e código colado)
// para que as regras e o comportamento sejam idênticos nos dois.
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
  renderProjects();
  closeImportModal();

  // Avisamos quando itens foram descartados — silêncio faria o usuário achar
  // que importou tudo.
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

// Imports a project from a pasted code string (the JSON from the Excel
// "código da extensão" sheet, or the same content from a shared .txt).
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

$('importBtn').addEventListener('click', () => openImportModal());
$('importCancelBtn').addEventListener('click', () => closeImportModal());
$('importCodeBtn').addEventListener('click', () => processImportCode());

// Close modal when clicking the overlay backdrop
$('importModal').addEventListener('click', (e) => {
  if (e.target === $('importModal')) closeImportModal();
});

// Click on dropzone triggers file input
$('importDropzone').addEventListener('click', () => $('importFileInput').click());

// File selected via picker
$('importFileInput').addEventListener('change', (e) => {
  processImportFile(e.target.files[0]);
});

// Drag and drop support
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
