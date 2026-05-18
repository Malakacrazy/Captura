// background.js v2 — Decorafit FF&E

chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.local.get(['products', 'projectName', 'projects'], (data) => {
    if (!data.products)     chrome.storage.local.set({ products: [] });
    if (!data.projectName)  chrome.storage.local.set({ projectName: '' });
    if (!data.projects)     chrome.storage.local.set({ projects: [] });
  });
});

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.action === 'openPrint') {
    const url = chrome.runtime.getURL('print.html');
    chrome.tabs.create({ url }, tab => sendResponse({ ok: true, tabId: tab.id }));
    return true;
  }
  if (msg.action === 'openLibrary') {
    const url = chrome.runtime.getURL('library.html');
    chrome.tabs.create({ url }, tab => sendResponse({ ok: true, tabId: tab.id }));
    return true;
  }
});
