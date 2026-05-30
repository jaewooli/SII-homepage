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
  const { csrf_token, sessionid } = event.detail;
  if (!csrf_token || !sessionid) {
    console.error('[SII Extension] Missing cookie details in event');
    return;
  }

  console.log('[SII Extension] Received cookies trigger from page, setting cookies...');
  
  // Set cookies via background script
  chrome.runtime.sendMessage({ type: "SET_COOKIE", cookie: csrf_token });
  chrome.runtime.sendMessage({ type: "SET_COOKIE", cookie: sessionid });

  // Redirect to dreamhack.io after cookie storage completes
  setTimeout(() => {
    chrome.runtime.sendMessage({ type: "URL_REDIRECT", url: 'https://dreamhack.io' });
  }, 1000);
});
