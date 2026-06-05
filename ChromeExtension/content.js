// Helper to check if extension context is still valid (not reloaded/invalidated by Chrome)
function isContextValid() {
  return typeof chrome !== 'undefined' && chrome.runtime && !!chrome.runtime.id;
}

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

let isCachedAdmin = false;

// Initial sync of cached admin status
if (isContextValid()) {
  chrome.storage.local.get('INHACKuser', (data) => {
    if (data && data.INHACKuser) {
      isCachedAdmin = (data.INHACKuser.isAdmin === true || data.INHACKuser.username === 'developer');
    }
  });
  
  // Listen for changes dynamically
  chrome.storage.onChanged.addListener((changes, namespace) => {
    if (namespace === 'local' && changes.INHACKuser) {
      const newUser = changes.INHACKuser.newValue;
      isCachedAdmin = newUser && (newUser.isAdmin === true || newUser.username === 'developer');
    }
  });
}

// Listen for custom trigger events from the webpage
window.addEventListener('INHACK_DREAMHACK_SYNC_TRIGGER', () => {
  if (!isContextValid()) {
    console.warn('[INHACK Extension] Context invalidated. Reloading portal page...');
    window.location.reload();
    return;
  }
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
  if (!isContextValid()) {
    console.warn('[INHACK Extension] Context invalidated. Reloading portal page...');
    window.location.reload();
    return;
  }
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



// Listen for admin logout shared trigger from the webpage
window.addEventListener('INHACK_ADMIN_LOGOUT_SHARED_TRIGGER', (event) => {
  if (!isContextValid()) {
    console.warn('[INHACK Extension] Context invalidated. Reloading portal page...');
    window.location.reload();
    return;
  }
  console.log('[INHACK Extension] Received admin logout shared trigger from webpage...');
  const { sessionid, csrftoken, sessions } = event.detail;

  chrome.runtime.sendMessage({ 
    type: "ADMIN_LOGOUT_SHARED",
    sessionid,
    csrftoken,
    sessions
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
  if (!isContextValid()) return;
  try {
    const res = await fetch('/me');
    if (res.ok) {
      const payload = await res.json();
      if (payload && payload.ok && payload.data && payload.data.username) {
        if (!isContextValid()) return;
        console.log('[INHACK Extension] Syncing logged-in user to background:', payload.data.username);
        chrome.runtime.sendMessage({
          type: "SET_USER",
          username: payload.data.username,
          isAdmin: payload.data.isAdmin || false
        });
        return;
      }
    }
    if (!isContextValid()) return;
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

// Check if we need to show the logout blocked alert on dreamhack.io
const isDreamhackDomain = window.location.hostname.endsWith('dreamhack.io');
if (isDreamhackDomain) {
  let alertTriggered = false;

  const triggerAlertAndReload = (forceRedirect = false) => {
    if (alertTriggered) return;
    alertTriggered = true;

    chrome.storage.local.remove('showLogoutBlockedAlert', () => {
      console.log('[INHACK Extension] Dispensing showLogoutBlockedAlert. Displaying notice...');
      
      // Delay to let browser render the page completely first
      setTimeout(() => {
        alert('[INHACK] 드림핵 로그아웃 시도가 감지되어 차단되었습니다. 다른 사용자의 공용 세션을 보호하기 위해 서버 로그아웃을 방지하고 로컬 브라우저 쿠키만 삭제합니다.');
        
        if (forceRedirect) {
          // If we had to catch the flag late (e.g. from listener), force reload & redraw the main page layout
          window.location.href = 'https://dreamhack.io/';
        } else {
          // Normal flow: just reload current page
          window.location.reload();
        }
      }, 600);
    });
  };

  const checkAlertFlag = () => {
    if (!isContextValid()) return;
    chrome.storage.local.get('showLogoutBlockedAlert', (data) => {
      if (!isContextValid()) return;
      if (data && data.showLogoutBlockedAlert) {
        triggerAlertAndReload(false);
      } else {
        // Fallback: if not set yet, listen for the changes dynamically for 2 seconds (in case background script was slow)
        const storageListener = (changes, namespace) => {
          if (!isContextValid()) return;
          if (namespace === 'local' && changes.showLogoutBlockedAlert && changes.showLogoutBlockedAlert.newValue === true) {
            console.log('[INHACK Extension] Detected showLogoutBlockedAlert flag from dynamic listener.');
            chrome.storage.onChanged.removeListener(storageListener);
            triggerAlertAndReload(true); // Force redirect to avoid blank page
          }
        };
        chrome.storage.onChanged.addListener(storageListener);
        // Timeout after 2 seconds to avoid memory leaks
        setTimeout(() => {
          if (isContextValid()) {
            chrome.storage.onChanged.removeListener(storageListener);
          }
        }, 2000);
      }
    });
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', checkAlertFlag);
  } else {
    // If DOM is already loaded, check with a slight delay
    setTimeout(checkAlertFlag, 400);
  }

  // Helper to trigger alert and run background intercept tasks on the current page immediately (preventing blank screen)
  const performClientSideLogoutBlock = async () => {
    if (!isContextValid()) {
      window.location.reload();
      return;
    }

    console.log('[INHACK Extension] Performing client-side logout interception...');
    
    // 1. Immediately alert the user on the current page before navigation starts
    alert('[INHACK] 드림핵 로그아웃 시도가 감지되어 차단되었습니다. 다른 사용자의 공용 세션을 보호하기 위해 서버 로그아웃을 방지하고 로컬 브라우저 쿠키만 삭제합니다.');

    // 2. Tell background worker to discard cookies and log to portal
    chrome.runtime.sendMessage({ type: "STUDENT_LOGOUT_INTERCEPT" }, () => {
      // 3. Clear storage flag just in case
      chrome.storage.local.remove('showLogoutBlockedAlert', () => {
        // 4. Redirect to main page only after cookies are cleared
        window.location.href = 'https://dreamhack.io/';
      });
    });
  };

  // Intercept anchor clicks
  document.addEventListener('click', (e) => {
    if (isCachedAdmin) return;
    let target = e.target;
    while (target && target !== document.documentElement) {
      if (target.tagName === 'A' && target.href) {
        try {
          const url = new URL(target.href);
          if (url.pathname.includes('/users/logout')) {
            // Stop the navigation
            e.preventDefault();
            e.stopPropagation();
            performClientSideLogoutBlock();
            return;
          }
        } catch (err) {}
      }
      target = target.parentNode;
    }
  }, true);

  // Intercept form submissions
  document.addEventListener('submit', (e) => {
    if (isCachedAdmin) return;
    const form = e.target;
    if (form && form.action) {
      try {
        const url = new URL(form.action);
        if (url.pathname.includes('/users/logout')) {
          // Stop form submission
          e.preventDefault();
          e.stopPropagation();
          performClientSideLogoutBlock();
        }
      } catch (err) {}
    }
  }, true);
}

// Listen for E2E master key save trigger from webpage
window.addEventListener('INHACK_SAVE_MASTER_KEY', (event) => {
  if (!isContextValid()) return;
  const { jwk } = event.detail;
  console.log('[INHACK Extension] Received E2E master key save request.');
  chrome.runtime.sendMessage({
    type: "SAVE_MASTER_KEY",
    jwk
  });
});

// Listen for admin E2E auto login and session regeneration trigger from webpage
window.addEventListener('INHACK_ADMIN_AUTO_LOGIN_TRIGGER', (event) => {
  if (!isContextValid()) {
    console.warn('[INHACK Extension] Context invalidated. Reloading...');
    window.location.reload();
    return;
  }
  console.log('[INHACK Extension] Received admin E2E auto login trigger from webpage...');
  const { email, encryptedPassword, iv } = event.detail;

  chrome.runtime.sendMessage({
    type: "ADMIN_AUTO_LOGIN_E2E",
    email,
    encryptedPassword,
    iv
  }, (response) => {
    if (response && response.ok) {
      console.log('[INHACK Extension] Admin E2E auto login completed successfully.');
      window.dispatchEvent(new CustomEvent('INHACK_ADMIN_AUTO_LOGIN_RESPONSE', {
        detail: { ok: true }
      }));
    } else {
      const errMsg = response?.message || 'unknown error';
      console.error('[INHACK Extension] Admin E2E auto login failed:', errMsg);
      window.dispatchEvent(new CustomEvent('INHACK_ADMIN_AUTO_LOGIN_RESPONSE', {
        detail: { ok: false, message: errMsg }
      }));
    }
  });
});

// Intercept wargame challenge solves on dreamhack.io page
const isDreamhack = window.location.hostname.endsWith('dreamhack.io');
if (isDreamhack) {
  // Inject monkey patching script into Dreamhack page context (Main World)
  const script = document.createElement('script');
  script.textContent = `
    (function() {
      // 1. Monkey-patch window.fetch
      const originalFetch = window.fetch;
      window.fetch = async function(...args) {
        const url = args[0];
        const response = await originalFetch.apply(this, args);
        try {
          const urlStr = typeof url === 'string' ? url : (url && url.url) || '';
          if (urlStr.includes('/wargame/challenges/') && urlStr.includes('/auth/')) {
            if (response.status === 201) {
              const parts = urlStr.split('/');
              const authIndex = parts.indexOf('auth');
              const challengeId = (authIndex > 0) ? parts[authIndex - 1] : 'unknown';
              
              const event = new CustomEvent('DREAMHACK_CHALLENGE_SOLVED_EVENT', {
                detail: {
                  challengeId: challengeId,
                  challengeName: document.title || challengeId
                }
              });
              window.dispatchEvent(event);
            }
          }
        } catch (e) {
          console.warn('[INHACK Interceptor] Error parsing fetch response:', e);
        }
        return response;
      };

      // 2. Monkey-patch XMLHttpRequest
      const originalOpen = XMLHttpRequest.prototype.open;
      const originalSend = XMLHttpRequest.prototype.send;
      
      XMLHttpRequest.prototype.open = function(method, url, ...rest) {
        this._url = url;
        return originalOpen.apply(this, [method, url, ...rest]);
      };
      
      XMLHttpRequest.prototype.send = function(...args) {
        this.addEventListener('load', async () => {
          try {
            const urlStr = this._url || '';
            if (urlStr.includes('/wargame/challenges/') && urlStr.includes('/auth/')) {
              if (this.status === 201) {
                const parts = urlStr.split('/');
                const authIndex = parts.indexOf('auth');
                const challengeId = (authIndex > 0) ? parts[authIndex - 1] : 'unknown';
                const event = new CustomEvent('DREAMHACK_CHALLENGE_SOLVED_EVENT', {
                  detail: {
                    challengeId: challengeId,
                    challengeName: document.title || challengeId
                  }
                });
                window.dispatchEvent(event);
              }
            }
          } catch (e) {
            // Ignored
          }
        });
        return originalSend.apply(this, args);
      };
    })();
  `;
  (document.head || document.documentElement).appendChild(script);
  script.remove();

  // Listen for the custom DOM event and forward it to the background script
  window.addEventListener('DREAMHACK_CHALLENGE_SOLVED_EVENT', (event) => {
    if (!isContextValid()) return;
    const { challengeId, challengeName } = event.detail;
    
    // Resolve challenge title from DOM elements if possible for readability
    let resolvedChallengeName = challengeName;
    try {
      const titleEl = document.querySelector('h1, h2, .challenge-title, [class*="title" i]');
      if (titleEl && titleEl.textContent) {
        resolvedChallengeName = titleEl.textContent.trim();
      }
    } catch (e) {}

    console.log('[INHACK Extension] Solved challenge detected! Challenge:', resolvedChallengeName, 'ID:', challengeId);
    
    chrome.runtime.sendMessage({
      type: 'DREAMHACK_SOLVE_DETECTED',
      challengeId,
      challengeName: resolvedChallengeName,
      timestamp: new Date().toISOString()
    });
  });
}
