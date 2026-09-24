// library-ai-enrich.js — Studio Araci FF&E · Painel "🤖 IA" na Biblioteca
//
// Painel aberto pelo botão "🤖 IA" de um card da Biblioteca (ver buildCard
// em library.js), mesmo padrão de toggle do buildSendPanel/buildItemsPanel:
// primeiro clique abre, segundo fecha, e o painel é reconstruído do zero a
// cada abertura (não guarda estado entre uma abertura e outra).
//
// A busca em si (chamada à API do Gemini + comparação campo a campo) é
// feita por enrichProjectWithAI/diffAiSuggestion, em ai-enrich.js. Este
// arquivo só monta a revisão visual dos diffs e decide o que gravar quando
// o usuário aceita.

function aiPluralize(n, singular, plural) {
  return n === 1 ? singular : plural;
}

// Card de diffs de um produto: uma linha por campo sugerido, cada uma com
// seu próprio checkbox (aceitar aquele campo isoladamente). Produto sem
// mudança nenhuma não chega aqui (filtrado por quem chama).
function buildAiDiffCard(result, allCheckboxes) {
  const card = document.createElement('div');
  card.className = 'ai-diff-card';

  const header = document.createElement('div');
  header.className = 'ai-diff-card-header';

  if (result.product.img) {
    const img = document.createElement('img');
    img.src = result.product.img;
    img.alt = '';
    img.className = 'ai-diff-thumb';
    img.addEventListener('error', () => {
      const ph = document.createElement('span');
      ph.textContent = '📦';
      img.replaceWith(ph);
    });
    header.appendChild(img);
  } else {
    const ph = document.createElement('span');
    ph.textContent = '📦';
    header.appendChild(ph);
  }

  const name = document.createElement('div');
  name.className = 'ai-diff-name';
  name.textContent = result.product.name || 'Sem nome';
  header.appendChild(name);

  card.appendChild(header);

  if (result.error) {
    const err = document.createElement('div');
    err.className = 'ai-diff-error';
    err.textContent = `⚠ ${result.error}`;
    card.appendChild(err);
    return card;
  }

  for (const change of result.changes) {
    const row = document.createElement('div');
    row.className = 'ai-diff-row';

    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.checked = true;
    change._checkbox = cb;
    allCheckboxes.push(cb);

    const label = document.createElement('div');
    label.className = 'ai-diff-label';
    label.textContent = change.label;

    const oldEl = document.createElement('div');
    oldEl.className = 'ai-diff-old';
    oldEl.textContent = change.oldDisplay;

    const arrow = document.createElement('div');
    arrow.className = 'ai-diff-arrow';
    arrow.textContent = '→';

    const newEl = document.createElement('div');
    newEl.className = 'ai-diff-new';
    newEl.textContent = change.newDisplay;

    row.append(cb, label, oldEl, arrow, newEl);
    card.appendChild(row);
  }

  return card;
}

// Tela final, depois que a IA já respondeu: resumo + lista de diffs +
// aceitar/descartar tudo + aplicar.
function buildAiResultsView(proj, results, refreshCard, onClose) {
  const wrap = document.createElement('div');
  wrap.className = 'ai-results';

  const withChanges = results.filter(r => r.changes.length > 0);
  const withErrors = results.filter(r => r.error);
  const unchanged = results.length - withChanges.length - withErrors.length;

  const summary = document.createElement('div');
  summary.className = 'ai-summary';
  summary.textContent =
    `${withChanges.length} ${aiPluralize(withChanges.length, 'produto com sugestão', 'produtos com sugestão')}` +
    (unchanged > 0 ? ` · ${unchanged} sem alteração` : '') +
    (withErrors.length > 0 ? ` · ${withErrors.length} com erro` : '');
  wrap.appendChild(summary);

  const closeBtn = document.createElement('button');
  closeBtn.type = 'button';
  closeBtn.className = 'btn btn-secondary';
  closeBtn.textContent = 'Fechar sem aplicar';
  closeBtn.addEventListener('click', onClose);

  if (withChanges.length === 0 && withErrors.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'ai-intro';
    empty.textContent = 'A IA não encontrou nenhuma correção ou complemento para este projeto.';
    wrap.append(empty, closeBtn);
    return wrap;
  }

  const allCheckboxes = [];
  const list = document.createElement('div');
  list.className = 'ai-diff-list';
  for (const r of results) {
    if (r.changes.length === 0 && !r.error) continue;
    list.appendChild(buildAiDiffCard(r, allCheckboxes));
  }
  wrap.appendChild(list);

  const toggleRow = document.createElement('div');
  toggleRow.className = 'ai-toggle-all';

  const acceptAllBtn = document.createElement('button');
  acceptAllBtn.type = 'button';
  acceptAllBtn.className = 'btn btn-secondary';
  acceptAllBtn.textContent = '✓ Aceitar tudo';

  const discardAllBtn = document.createElement('button');
  discardAllBtn.type = 'button';
  discardAllBtn.className = 'btn btn-secondary';
  discardAllBtn.textContent = '✕ Descartar tudo';

  toggleRow.append(acceptAllBtn, discardAllBtn);
  wrap.appendChild(toggleRow);

  const footer = document.createElement('div');
  footer.className = 'ai-diff-footer';

  const applyBtn = document.createElement('button');
  applyBtn.type = 'button';
  applyBtn.className = 'btn btn-primary';

  function updateApplyState() {
    const n = allCheckboxes.filter(cb => cb.checked).length;
    applyBtn.textContent = n === 0
      ? 'Nada selecionado'
      : `✓ Aplicar ${n} ${aiPluralize(n, 'alteração', 'alterações')}`;
    applyBtn.disabled = n === 0;
  }

  allCheckboxes.forEach(cb => cb.addEventListener('change', updateApplyState));
  acceptAllBtn.addEventListener('click', () => {
    allCheckboxes.forEach(cb => { cb.checked = true; });
    updateApplyState();
  });
  discardAllBtn.addEventListener('click', () => {
    allCheckboxes.forEach(cb => { cb.checked = false; });
    updateApplyState();
  });
  updateApplyState();

  applyBtn.addEventListener('click', async () => {
    let applied = 0;
    for (const r of results) {
      for (const change of r.changes) {
        if (change._checkbox?.checked) {
          r.product[change.key] = change.newValue;
          applied++;
        }
      }
    }
    await saveProjectsToStorage();
    syncIfActive(proj);
    refreshCard();
    showToast(`✓ ${applied} ${aiPluralize(applied, 'alteração aplicada', 'alterações aplicadas')}.`);
    onClose();
  });

  footer.append(applyBtn, closeBtn);
  wrap.appendChild(footer);

  return wrap;
}

// Painel principal: começa só com a explicação + botão de rodar; troca de
// conteúdo (progresso → resultados) sem recriar o painel inteiro, pra não
// perder a posição de scroll do card.
function buildAiPanel(proj, refreshCard, onClose) {
  const panel = document.createElement('div');
  panel.className = 'ai-panel';

  const items = proj.products || [];

  const intro = document.createElement('div');
  intro.className = 'ai-intro';
  intro.textContent =
    `A IA pesquisa cada um dos ${items.length} ${aiPluralize(items.length, 'produto', 'produtos')} deste ` +
    'projeto (usa o link de origem quando existe) e sugere correções de nome, marca, SKU, dimensões, preço, ' +
    'categoria e observações. Nada é alterado até você revisar e aceitar.';

  const runBtn = document.createElement('button');
  runBtn.type = 'button';
  runBtn.className = 'btn btn-primary';
  runBtn.textContent = '🤖 Buscar melhorias com IA';

  const body = document.createElement('div');

  panel.append(intro, runBtn, body);

  runBtn.addEventListener('click', async () => {
    if (items.length === 0) {
      showToast('⚠ Este projeto não tem itens.');
      return;
    }

    runBtn.disabled = true;
    runBtn.textContent = '🤖 Consultando IA…';
    body.innerHTML = '';

    const progress = document.createElement('div');
    progress.className = 'ai-progress';
    progress.textContent = `Analisando 0/${items.length}…`;
    body.appendChild(progress);

    let results;
    try {
      results = await enrichProjectWithAI(items, (done, total) => {
        progress.textContent = `Analisando ${done}/${total}…`;
      });
    } catch (e) {
      body.innerHTML = '';
      const err = document.createElement('div');
      err.className = 'ai-diff-error';
      err.textContent = `⚠ ${e.message}`;
      body.appendChild(err);
      runBtn.disabled = false;
      runBtn.textContent = '🤖 Buscar melhorias com IA';
      return;
    }

    runBtn.remove();
    body.innerHTML = '';
    body.appendChild(buildAiResultsView(proj, results, refreshCard, onClose));
  });

  return panel;
}
