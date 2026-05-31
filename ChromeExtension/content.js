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

// Listen for shared session load trigger from the webpage
window.addEventListener('INHACK_DREAMHACK_LOAD_TRIGGER', () => {
  console.log('[INHACK Extension] Received load shared session trigger from webpage...');
  
  chrome.runtime.sendMessage({ 
    type: "LOAD_SHARED_SESSION"
  }, (response) => {
    if (response && response.ok) {
      console.log('[INHACK Extension] Shared session cookies set successfully.');
      window.dispatchEvent(new CustomEvent('INHACK_DREAMHACK_LOAD_RESPONSE', {
        detail: { ok: true }
      }));
    } else {
      const errMsg = response?.message || 'unknown error';
      console.error('[INHACK Extension] Shared session load failed:', errMsg);
      window.dispatchEvent(new CustomEvent('INHACK_DREAMHACK_LOAD_RESPONSE', {
        detail: { ok: false, message: errMsg }
      }));
    }
  });
});

// Listen for admin auto login trigger from the webpage
window.addEventListener('INHACK_ADMIN_AUTO_LOGIN_TRIGGER', (event) => {
  console.log('[INHACK Extension] Received admin auto login trigger from webpage...');
  const { email, password } = event.detail;

  chrome.runtime.sendMessage({ 
    type: "ADMIN_AUTO_LOGIN",
    email,
    password
  }, (response) => {
    if (response && response.ok) {
      console.log('[INHACK Extension] Admin auto login and sync completed successfully.');
      window.dispatchEvent(new CustomEvent('INHACK_ADMIN_AUTO_LOGIN_RESPONSE', {
        detail: { ok: true }
      }));
    } else {
      const errMsg = response?.message || 'unknown error';
      console.error('[INHACK Extension] Admin auto login failed:', errMsg);
      window.dispatchEvent(new CustomEvent('INHACK_ADMIN_AUTO_LOGIN_RESPONSE', {
        detail: { ok: false, message: errMsg }
      }));
    }
  });
});

// Listen for admin logout shared trigger from the webpage
window.addEventListener('INHACK_ADMIN_LOGOUT_SHARED_TRIGGER', (event) => {
  console.log('[INHACK Extension] Received admin logout shared trigger from webpage...');
  const { sessionid, csrftoken } = event.detail;

  chrome.runtime.sendMessage({ 
    type: "ADMIN_LOGOUT_SHARED",
    sessionid,
    csrftoken
  }, (response) => {
    if (response && response.ok) {
      console.log('[INHACK Extension] Admin logout shared completed successfully.');
      window.dispatchEvent(new CustomEvent('INHACK_ADMIN_LOGOUT_SHARED_RESPONSE', {
        detail: { ok: true }
      }));
    } else {
      const errMsg = response?.message || 'unknown error';
      console.error('[INHACK Extension] Admin logout shared failed:', errMsg);
      window.dispatchEvent(new CustomEvent('INHACK_ADMIN_LOGOUT_SHARED_RESPONSE', {
        detail: { ok: false, message: errMsg }
      }));
    }
  });
});

// Automatically update user session state in the extension on page load
async function syncUserSession() {
  try {
    const res = await fetch('/me');
    if (res.ok) {
      const payload = await res.json();
      if (payload && payload.ok && payload.data && payload.data.username) {
        console.log('[INHACK Extension] Syncing logged-in user to background:', payload.data.username);
        chrome.runtime.sendMessage({
          type: "SET_USER",
          username: payload.data.username
        });
        return;
      }
    }
    console.log('[INHACK Extension] Syncing logged-out user to background.');
    chrome.runtime.sendMessage({ type: "CLEAR_USER" });
  } catch (e) {
    console.warn('[INHACK Extension] Failed to sync user session:', e);
  }
}

// Run session sync if we are on the portal origin
const isPortalOrigin = window.location.hostname === 'localhost' || 
                       window.location.hostname === '127.0.0.1' || 
                       window.location.hostname === 'ddyoru.duckdns.org';
if (isPortalOrigin) {
  syncUserSession();
}
