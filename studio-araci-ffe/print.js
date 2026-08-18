// print.js — Studio Araci FF&E · Main Print Entry Point
// Connects event listeners and initiates page rendering for PDF & Excel export.

// Initiate data loading and page rendering pipeline
ready = render();

// Event listeners
document.getElementById('printBtn').addEventListener('click', triggerPrint);
document.getElementById('backBtn').addEventListener('click', () => window.close());

// Setup Excel export handler
if (typeof setupExcelExport === 'function') {
  setupExcelExport();
}
