// library-utils.js — Studio Araci FF&E · Library Utilities & State
// Shared helpers and global state declarations for the project library.

const $ = id => document.getElementById(id);

// Global library state
let projects = [];           // all saved projects loaded from storage
let currentProducts = [];    // products from the active (in-progress) budget
let currentProjectName = ''; // name of the active budget
let currentProjectId = null; // id of saved project linked to active budget

// Formats a number as Brazilian currency: "R$ 1.234,56"
function fmt(n) {
  return 'R$ ' + (n || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// Shows a temporary toast notification that auto-hides after 3 seconds.
let toastTimer;
function showToast(msg) {
  const t = $('toast');
  if (!t) return;
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 3000);
}

// All writes to the projects array go through this single function.
async function saveProjectsToStorage() {
  await chrome.storage.local.set({ projects });
}

// If the edited project is the one currently loaded, sync changes to live storage.
function syncIfActive(proj) {
  if (proj.id === currentProjectId) {
    currentProducts = proj.products || [];
    chrome.storage.local.set({ products: currentProducts });
  }
}

// Accepts only http/https URLs. Returns '' for non-http(s) or invalid URLs.
function safeUrl(raw) {
  if (typeof raw !== 'string' || !raw) return '';
  try {
    const u = new URL(raw);
    return (u.protocol === 'http:' || u.protocol === 'https:') ? u.href : '';
  } catch {
    return '';
  }
}
