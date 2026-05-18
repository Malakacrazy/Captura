// background.js v2 — Decorafit FF&E

// ---------------------------------------------------------------------------
// SERVICE WORKER OVERVIEW (Manifest V3)
// ---------------------------------------------------------------------------
// In MV3, background pages are replaced by service workers. This script runs
// in a sandboxed, event-driven context — it is not a persistent page. Chrome
// spins it up when an event fires and tears it down when idle, so no state
// should be stored in module-level variables; chrome.storage is the correct
// persistence layer. All side-effects must be initiated inside event handlers.
// ---------------------------------------------------------------------------


// ---------------------------------------------------------------------------
// STORAGE INITIALISATION ON INSTALL / UPDATE
// ---------------------------------------------------------------------------
// onInstalled fires on three occasions:
//   1. First install of the extension.
//   2. The extension is updated to a new version.
//   3. Chrome itself is updated (rare, browser-restart triggered).
// We use it as the one safe place to guarantee our storage keys exist before
// any other code (popup, content script) tries to read them.
chrome.runtime.onInstalled.addListener(() => {

  // Read all three keys in a single storage.get call so we can inspect the
  // existing values before deciding whether to write anything. This is
  // intentionally non-destructive: we only set a key when it is absent (i.e.
  // undefined / falsy), which means a user's saved data survives an extension
  // update. If we called storage.set unconditionally, every update would wipe
  // the user's product list and project name.
  chrome.storage.local.get(['products', 'projectName', 'projects'], (data) => {

    // 'products' holds the array of captured FF&E items for the current
    // project. Default to an empty array so downstream code can always call
    // .push() / .filter() without a null-check.
    if (!data.products)     chrome.storage.local.set({ products: [] });

    // 'projectName' is the human-readable label shown in the popup header and
    // on the print sheet. Default to an empty string rather than null so UI
    // code can safely interpolate it into template literals.
    if (!data.projectName)  chrome.storage.local.set({ projectName: '' });

    // 'projects' is the array of saved project snapshots used by the library
    // view. Initialised to an empty array for the same safe-iteration reason
    // as 'products'.
    if (!data.projects)     chrome.storage.local.set({ projects: [] });
  });
});


// ---------------------------------------------------------------------------
// MESSAGE HANDLER — inter-page communication
// ---------------------------------------------------------------------------
// Content scripts and extension pages (popup, library, print) communicate
// with this service worker via chrome.runtime.sendMessage. The listener
// receives every message and dispatches on msg.action.
//
// The second parameter (_sender) carries metadata about the sending context
// (tab id, frame id, etc.). It is prefixed with _ to signal intentionally
// unused — we don't need to know who sent the message for either action here.
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {

  // --- openPrint -----------------------------------------------------------
  // Opens the extension's print preview page (print.html) in a new tab.
  // Only the background service worker can call chrome.tabs.create; content
  // scripts and most extension pages do not have the "tabs" permission scope
  // needed to create tabs, so they delegate the work here via messaging.
  if (msg.action === 'openPrint') {

    // chrome.runtime.getURL converts a relative extension path into its fully
    // qualified chrome-extension://<id>/print.html URL. Using getURL instead
    // of hard-coding the URL means the correct extension ID is always resolved
    // at runtime, regardless of whether the extension is packed or unpacked.
    const url = chrome.runtime.getURL('print.html');

    // Create the new tab and, once Chrome confirms it is open, reply with the
    // tab id so the caller can optionally focus or communicate with that tab.
    chrome.tabs.create({ url }, tab => sendResponse({ ok: true, tabId: tab.id }));

    // Returning true from an onMessage listener is the MV3 signal to Chrome
    // that sendResponse will be called asynchronously (inside the tabs.create
    // callback above). Without this return value, Chrome closes the message
    // channel immediately after the synchronous listener returns, and the
    // subsequent sendResponse call silently fails.
    return true;
  }

  // --- openLibrary ---------------------------------------------------------
  // Mirrors openPrint but targets library.html — the saved-projects browser.
  // The same async-channel contract applies, so we return true here too.
  if (msg.action === 'openLibrary') {

    // Resolve the extension-internal URL for the library page.
    const url = chrome.runtime.getURL('library.html');

    // Open the page and report success + tab id back to the caller.
    chrome.tabs.create({ url }, tab => sendResponse({ ok: true, tabId: tab.id }));

    // Keep the message channel open until the tabs.create callback fires.
    return true;
  }
});
