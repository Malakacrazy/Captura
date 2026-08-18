// library-items.js — Studio Araci FF&E · Project Items Table & Drag/Drop Editor
// Renders the editable table of products grouped by discipline, drag-and-drop ordering, and field change handlers.

function buildItemsPanel(proj, refreshCard) {
  const panel = document.createElement('div');
  panel.className = 'items-panel';

  const items = proj.products || [];
  if (items.length === 0) {
    panel.innerHTML = '<div style="padding:16px;text-align:center;color:#7A6A60;font-size:12px">Nenhum item neste projeto.</div>';
    return panel;
  }

  let migrou = false;
  items.forEach(p => {
    if (p.originalPrice === undefined) { p.originalPrice = p.price || 0; migrou = true; }
    if (typeof p.ambiente === 'string' && p.ambiente) { p.ambiente = [p.ambiente]; migrou = true; }
    else if (!Array.isArray(p.ambiente)) { p.ambiente = []; migrou = true; }
  });
  if (migrou) saveProjectsToStorage();

  refreshAmbienteSuggestions();

  const NUM_COLS = 10;

  const table = document.createElement('table');
  table.className = 'items-table';

  const thead = document.createElement('thead');
  thead.innerHTML =
    '<tr><th></th><th></th><th>Produto</th><th>Un.</th><th>Ambiente</th>' +
    '<th>Obs.</th><th>Preço</th><th>Qtd</th><th>Subtotal</th><th></th></tr>';

  const tbody = document.createElement('tbody');
  table.append(thead, tbody);
  panel.appendChild(table);

  function commit() {
    saveProjectsToStorage();
    syncIfActive(proj);
    refreshCard();
  }

  const discTotals = new Map();

  function refreshDividerTotals() {
    for (const [catId, el] of discTotals) {
      el.textContent = fmt(items
        .filter(p => (p.category || 'outros') === catId)
        .reduce((s, p) => s + (p.price || 0) * (p.qty || 1), 0));
    }
  }

  // ── Drag & Drop ────────────────────────────────────────────────────────────
  let dragId = null;
  let dragCat = null;
  let armed = null;

  function clearDropMarks() {
    tbody.querySelectorAll('.drop-before, .drop-after')
      .forEach(tr => tr.classList.remove('drop-before', 'drop-after'));
  }

  function disarm() {
    if (armed) { armed.draggable = false; armed = null; }
  }

  panel.addEventListener('mouseup', disarm);

  function moveItem(fromId, toId, depois) {
    if (fromId === toId) return;
    const from = items.findIndex(x => x.id === fromId);
    if (from === -1) return;

    const [movido] = items.splice(from, 1);
    const to = items.findIndex(x => x.id === toId);
    if (to === -1) { items.splice(from, 0, movido); return; }

    items.splice(depois ? to + 1 : to, 0, movido);
    commit();
    renderRows();
  }

  // ── Divider Row ────────────────────────────────────────────────────────────
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

  // ── Item Row ───────────────────────────────────────────────────────────────
  function buildItemRow(p, catId) {
    const tr = document.createElement('tr');
    tr.dataset.id = p.id;

    const tdHandle = document.createElement('td');
    tdHandle.className = 'drag-handle';
    tdHandle.textContent = '⠿';
    tdHandle.title = 'Arraste para reordenar dentro da disciplina';
    tdHandle.addEventListener('mousedown', () => { armed = tr; tr.draggable = true; });

    tr.addEventListener('dragstart', (e) => {
      dragId = p.id;
      dragCat = catId;
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', String(p.id));
      tr.classList.add('dragging');
    });

    tr.addEventListener('dragend', () => {
      tr.classList.remove('dragging');
      clearDropMarks();
      disarm();
      dragId = dragCat = null;
    });

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

    // Imagem
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

    // Nome
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

    // Unidade
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

    // Ambiente
    const tdAmb = document.createElement('td');
    const ambInput = document.createElement('input');
    ambInput.type = 'text';
    ambInput.value = (p.ambiente || []).join(', ');
    ambInput.placeholder = 'Ex: Cozinha, Sala';
    ambInput.setAttribute('list', 'studio-araci-ambientes');
    ambInput.addEventListener('change', () => {
      p.ambiente = parseAmbiente(ambInput.value);
      ambInput.value = p.ambiente.join(', ');
      refreshAmbienteSuggestions();
      commit();
    });
    tdAmb.appendChild(ambInput);

    // Observações
    const tdObs = document.createElement('td');
    const obsInput = document.createElement('input');
    obsInput.type = 'text';
    obsInput.value = p.obs || '';
    obsInput.placeholder = 'Adicionar...';
    obsInput.addEventListener('change', () => { p.obs = obsInput.value.trim(); commit(); });
    tdObs.appendChild(obsInput);

    // Subtotal
    const tdTotal = document.createElement('td');
    tdTotal.className = 'col-total';
    tdTotal.textContent = fmt((p.price || 0) * (p.qty || 1));

    // Preço
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

    // Quantidade
    const tdQty = document.createElement('td');
    const qtyWrap = document.createElement('div');
    qtyWrap.className = 'qty-wrap';

    const qtyInput = document.createElement('input');
    qtyInput.type = 'number';
    qtyInput.className = 'qty-input';
    qtyInput.min = '1';
    qtyInput.step = '1';
    qtyInput.value = p.qty || 1;

    const setQty = (valor, refletir) => {
      p.qty = Math.max(1, Math.floor(valor) || 1);
      if (refletir) qtyInput.value = p.qty;
      tdTotal.textContent = fmt((p.price || 0) * p.qty);
      refreshDividerTotals();
      commit();
    };

    qtyInput.addEventListener('input', () => {
      const v = parseInt(qtyInput.value, 10);
      if (Number.isFinite(v) && v >= 1) setQty(v, false);
    });
    qtyInput.addEventListener('change', () => setQty(parseInt(qtyInput.value, 10), true));
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

    // Excluir item
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

  // ── Render rows ────────────────────────────────────────────────────────────
  function renderRows() {
    tbody.innerHTML = '';
    discTotals.clear();

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

    const categories = typeof STUDIO_ARACI_CATEGORIES !== 'undefined' ? STUDIO_ARACI_CATEGORIES : [];
    for (const cat of categories) {
      const grupo = items.filter(p => (p.category || 'outros') === cat.id);
      if (grupo.length === 0) continue;
      tbody.appendChild(buildDividerRow(cat, grupo));
      grupo.forEach(p => tbody.appendChild(buildItemRow(p, cat.id)));
    }
  }

  renderRows();
  return panel;
}
