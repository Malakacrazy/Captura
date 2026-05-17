// background.js v2 — Studio Araci FF&E

chrome.runtime.onInstalled.addListener(() => {
  // Initialize storage with defaults
  chrome.storage.local.get(['products', 'projectName'], (data) => {
    if (!data.products) chrome.storage.local.set({ products: [] });
    if (!data.projectName) chrome.storage.local.set({ projectName: '' });
  });
});

// Open the branded print page in a new tab
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.action === 'openPrint') {
    const url = chrome.runtime.getURL('print.html');
    chrome.tabs.create({ url }, (tab) => {
      sendResponse({ ok: true, tabId: tab.id });
    });
    return true; // keep channel open for async response
  }
});
