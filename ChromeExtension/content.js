// Robust function to set the installed flag on document.documentElement
function setInstalledFlag() {
  if (document.documentElement) {
    document.documentElement.dataset.siiExtensionInstalled = "true";
    console.log('[SII Extension] Extension active flag injected.');
  } else {
    // If documentElement is not ready yet, observe document structure
    const observer = new MutationObserver(() => {
      if (document.documentElement) {
        document.documentElement.dataset.siiExtensionInstalled = "true";
        console.log('[SII Extension] Extension active flag injected via observer.');
        observer.disconnect();
      }
    });
    observer.observe(document, { childList: true, subtree: true });
  }
}

setInstalledFlag();

// Listen for custom trigger events from the webpage
window.addEventListener('SII_DREAMHACK_LOGIN_TRIGGER', (event) => {
  const { email, password } = event.detail;
  if (!email || !password) {
    console.error('[SII Extension] Missing email or password details in event');
    return;
  }

  console.log('[SII Extension] Received login credentials from page. Requesting background worker to log in...');
  
  chrome.runtime.sendMessage({ 
    type: "PERFORM_DREAMHACK_LOGIN", 
    email, 
    password 
  }, (response) => {
    if (response && response.ok) {
      console.log('[SII Extension] Login sync completed successfully.');
      window.dispatchEvent(new CustomEvent('SII_DREAMHACK_LOGIN_RESPONSE', {
        detail: { ok: true }
      }));
    } else {
      const errMsg = response?.message || 'unknown error';
      console.error('[SII Extension] Login sync failed:', errMsg);
      window.dispatchEvent(new CustomEvent('SII_DREAMHACK_LOGIN_RESPONSE', {
        detail: { ok: false, message: errMsg }
      }));
    }
  });
});
