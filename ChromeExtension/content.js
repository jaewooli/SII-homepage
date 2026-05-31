// Robust function to set the installed flag on document.documentElement
function setInstalledFlag() {
  if (document.documentElement) {
    document.documentElement.dataset.inhackExtensionInstalled = "true";
    console.log('[INHACK Extension] Extension active flag injected.');
  } else {
    // If documentElement is not ready yet, observe document structure
    const observer = new MutationObserver(() => {
      if (document.documentElement) {
        document.documentElement.dataset.inhackExtensionInstalled = "true";
        console.log('[INHACK Extension] Extension active flag injected via observer.');
        observer.disconnect();
      }
    });
    observer.observe(document, { childList: true, subtree: true });
  }
}

setInstalledFlag();

// Listen for custom trigger events from the webpage
window.addEventListener('INHACK_DREAMHACK_SYNC_TRIGGER', () => {
  console.log('[INHACK Extension] Received cookie sync trigger from webpage. Querying background worker...');
  
  chrome.runtime.sendMessage({ 
    type: "GET_DREAMHACK_COOKIES"
  }, (response) => {
    if (response && response.ok) {
      console.log('[INHACK Extension] Cookie retraction completed successfully.');
      window.dispatchEvent(new CustomEvent('INHACK_DREAMHACK_SYNC_RESPONSE', {
        detail: { 
          ok: true, 
          sessionid: response.sessionid, 
          csrftoken: response.csrftoken 
        }
      }));
    } else {
      const errMsg = response?.message || 'unknown error';
      console.error('[INHACK Extension] Cookie sync failed:', errMsg);
      window.dispatchEvent(new CustomEvent('INHACK_DREAMHACK_SYNC_RESPONSE', {
        detail: { ok: false, message: errMsg }
      }));
    }
  });
});
