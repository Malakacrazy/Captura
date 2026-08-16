// content.js v4 — Studio Araci FF&E · Botões flutuantes
//
// Injetado em todas as páginas (content_scripts no manifest). Este arquivo é
// APENAS interface: desenha os botões flutuantes, o overlay do popup e o toast.
//
// A raspagem do produto NÃO mora mais aqui. Ela foi para extractor.js e é
// orquestrada por background.js — antes havia uma cópia inteira da extração
// neste arquivo e outra em popup.js, e as duas já haviam divergido (mesmo
// produto era classificado de forma diferente conforme o botão usado).
// Agora o clique só manda uma mensagem e mostra o resultado.

// IIFE para não poluir o escopo global da página hospedeira: nada declarado
// aqui é visível para o JavaScript do site.
(function () {
  'use strict';

  // Guarda contra injeção duplicada — acontece em navegação de SPA, quando o
  // Chrome reexecuta o content script sem recarregar a página.
  if (document.getElementById('sa-fab')) return;

  // ─── Botões flutuantes ────────────────────────────────────────────────────

  const fab = document.createElement('button');
  fab.id = 'sa-fab'; // estilizado em content.css; o id também é a guarda acima
  fab.setAttribute('aria-label', 'Adicionar ao Orçamento Studio Araci');
  // SVG inline: evita requisição de rede e é imune a políticas de img-src da CSP
  fab.innerHTML = `
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round">
      <path d="M12 5v14M5 12h14"/>
    </svg>
    <span>Orçamento</span>
  `;

  const fabLib = document.createElement('button');
  fabLib.id = 'sa-fab-lib';
  fabLib.setAttribute('aria-label', 'Abrir Projeto Studio Araci');
  fabLib.innerHTML = `
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
      <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
    </svg>
    <span>Abrir Projeto</span>
  `;

  // Toast — escondido por CSS (opacity:0), revelado por classe
  const toast = document.createElement('div');
  toast.id = 'sa-toast';

  document.body.append(fab, fabLib, toast);

  // ─── Overlay do popup ─────────────────────────────────────────────────────
  // O popup é aberto como <iframe> sobre a página, para o usuário conferir o
  // orçamento sem sair da loja.

  let popupFrame = null;
  let outsideClick = null; // handler registrado em document enquanto o iframe existe

  // Fecha o overlay e SEMPRE remove o listener de clique externo.
  // Na versão anterior o listener só era removido no caminho do clique fora;
  // fechar pelo próprio botão ou pelo Ctrl+. deixava o handler pendurado em
  // document, acumulando um a cada abertura.
  function closePopupFrame() {
    if (outsideClick) {
      document.removeEventListener('click', outsideClick);
      outsideClick = null;
    }
    if (popupFrame) {
      popupFrame.remove();
      popupFrame = null;
    }
  }

  fabLib.addEventListener('click', () => {
    if (popupFrame) { closePopupFrame(); return; }

    popupFrame = document.createElement('iframe');
    popupFrame.id = 'sa-popup-frame';
    popupFrame.src = chrome.runtime.getURL('popup.html');
    document.body.appendChild(popupFrame);

    outsideClick = (e) => {
      // Cliques dentro do iframe não chegam ao documento pai, então basta
      // ignorar os cliques no próprio botão que abriu o overlay.
      if (e.target !== fabLib && !fabLib.contains(e.target)) closePopupFrame();
    };
    // O setTimeout impede que o próprio clique que abriu o overlay o feche
    setTimeout(() => document.addEventListener('click', outsideClick), 100);
  });

  // ─── Guarda de DOM — reinjeta se o site remover nossos elementos ───────────
  // Frameworks SPA (React/VTEX na Leroy Merlin, etc.) podem substituir ou
  // limpar document.body durante a hidratação, levando junto o que injetamos.
  function ensureInDom() {
    if (!document.getElementById('sa-fab')) {
      (document.body || document.documentElement).append(fab, fabLib, toast);
      applyFabVisibility();
    }
  }

  // Observa só os filhos diretos de <body> — barato, sem varrer a subárvore
  const domGuard = new MutationObserver(ensureInDom);

  function attachDomGuard() {
    if (document.body) domGuard.observe(document.body, { childList: true });
  }
  attachDomGuard();

  // Se o site trocar o próprio <body>, reconecta o observer no novo
  new MutationObserver(() => {
    domGuard.disconnect();
    attachDomGuard();
    ensureInDom();
  }).observe(document.documentElement, { childList: true });

  // ─── Visibilidade (Ctrl+.) ────────────────────────────────────────────────
  // Estado num booleano em vez de ler style do DOM, que fica ambíguo quando CSS
  // e estilo inline conflitam durante a leitura assíncrona do storage.
  let fabVisible = false;

  function applyFabVisibility() {
    fab.style.display = fabVisible ? 'flex' : 'none';
    fabLib.style.display = fabVisible ? 'flex' : 'none';
  }

  chrome.storage.local.get('fabVisible', (data) => {
    fabVisible = !!data.fabVisible;
    applyFabVisibility();
  });

  // O atalho é capturado pelo Chrome (commands API) e repassado por
  // background.js. Funciona em qualquer site, independente de como a página
  // trata eventos de teclado.
  chrome.runtime.onMessage.addListener((msg) => {
    if (msg.action !== 'toggleFab') return;
    fabVisible = !fabVisible;
    applyFabVisibility();
    chrome.storage.local.set({ fabVisible });
    if (!fabVisible) closePopupFrame();
  });

  // ─── Captura ──────────────────────────────────────────────────────────────

  fab.addEventListener('click', () => {
    // Estado de carregamento — a CSS desabilita pointer-events na classe
    fab.classList.add('loading');
    fab.querySelector('span').textContent = 'Capturando…';

    const restore = () => {
      fab.classList.remove('loading');
      fab.querySelector('span').textContent = 'Orçamento';
    };

    // background.js injeta o extrator, tenta até a SPA hidratar, classifica e
    // grava no orçamento. A resposta traz só o que o toast precisa mostrar.
    chrome.runtime.sendMessage({ action: 'captureProduct' }, (res) => {
      restore();

      // O service worker do MV3 é encerrado quando ocioso; se ele não subir a
      // tempo, lastError é preenchido e `res` vem undefined.
      if (chrome.runtime.lastError || !res) {
        showToast('⚠ Erro ao capturar. Tente adicionar manualmente.', 'warn');
        return;
      }
      if (!res.ok) {
        showToast(res.reason === 'blocked'
          ? '⚠ Não é possível capturar nesta página.'
          : '⚠ Produto não identificado nesta página.', 'warn');
        return;
      }
      // Nome truncado para o toast não estourar a largura
      const short = (res.name || '').substring(0, 48);
      showToast(res.deduped
        ? `✓ Já no orçamento — quantidade: ${res.qty}`
        : `✓ Adicionado: ${short}`, 'ok');
    });
  });

  // ─── Toast ────────────────────────────────────────────────────────────────
  // Substitui className inteiro (em vez de alternar classes) para que trocar de
  // 'ok' para 'warn' limpe o estado anterior numa operação só. A transição de
  // opacity na CSS faz a animação; remover as classes esconde de novo.
  let toastTimer = null;
  function showToast(msg, type = 'ok') {
    toast.textContent = msg;
    toast.className = 'sa-toast-' + type;
    clearTimeout(toastTimer); // cancela o "esconder" de um toast anterior
    toastTimer = setTimeout(() => { toast.className = ''; }, 3500);
  }

})();
