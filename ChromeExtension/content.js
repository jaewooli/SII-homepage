// Helper to check if extension context is still valid (not reloaded/invalidated by Chrome)
function isContextValid() {
  return typeof chrome !== 'undefined' && chrome.runtime && !!chrome.runtime.id;
}

function getPortalBasePath() {
  // 1. Try to read window.__BASE_PATH__ injected by the server in the DOM script tags
  try {
    const scripts = document.getElementsByTagName('script');
    for (let i = 0; i < scripts.length; i++) {
      const content = scripts[i].textContent || '';
      const match = content.match(/window\.__BASE_PATH__\s*=\s*['"]([^'"]+)['"]/);
      if (match) {
        return match[1].replace(/\/$/, '');
      }
    }
  } catch (e) {}

  // 2. Fallback to URL parsing
  try {
    let path = window.location.pathname.split('?')[0].split('#')[0];
    path = path.replace(/\/(dreamhack|admin|mypage|login|index\.html|dreamhack\.html|admin\.html|mypage\.html|login\.html)\/?$/, '');
    path = path.replace(/\/$/, '');
    return path;
  } catch (e) {
    return '/homepage';
  }
}

// Robust function to set the installed flag on document.documentElement
function setInstalledFlag() {
  if (document.documentElement) {
    document.documentElement.dataset.inhackExtensionInstalled = "true";
  } else {
    const observer = new MutationObserver(() => {
      if (document.documentElement) {
        document.documentElement.dataset.inhackExtensionInstalled = "true";
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
    window.location.reload();
    return;
  }
  
  chrome.runtime.sendMessage({ 
    type: "GET_DREAMHACK_COOKIES"
  }, (response) => {
    if (chrome.runtime.lastError) {
      window.dispatchEvent(new CustomEvent('INHACK_DREAMHACK_SYNC_RESPONSE', {
        detail: { ok: false, message: `익스텐션 오류: ${chrome.runtime.lastError.message}` }
      }));
      return;
    }
    if (response && response.ok) {
      window.dispatchEvent(new CustomEvent('INHACK_DREAMHACK_SYNC_RESPONSE', {
        detail: { 
          ok: true, 
          sessionid: response.sessionid, 
          csrftoken: response.csrftoken 
        }
      }));
    } else {
      const errMsg = response?.message || 'unknown error';
      window.dispatchEvent(new CustomEvent('INHACK_DREAMHACK_SYNC_RESPONSE', {
        detail: { ok: false, message: errMsg }
      }));
    }
  });
});

// Listen for shared session load trigger from the webpage
window.addEventListener('INHACK_DREAMHACK_LOAD_TRIGGER', async () => {
  if (!isContextValid()) {
    window.location.reload();
    return;
  }
  
  try {
    // 1. Fetch shared session cookies same-origin from portal
    const res = await fetch(getPortalBasePath() + '/dreamhack/shared-session');
    if (!res.ok) {
      throw new Error("Failed to fetch shared session from portal (make sure admin has registered it)");
    }
    const resData = await res.json();
    if (!resData.ok || !resData.data || !resData.data.sessionid) {
      throw new Error(resData.message || "Invalid shared session data");
    }

    const { sessionid, csrftoken } = resData.data;

    // 2. Delegate cookie writing and verification to background script
    chrome.runtime.sendMessage({ 
      type: "LOAD_SHARED_SESSION",
      sessionid,
      csrftoken
    }, async (response) => {
      if (chrome.runtime.lastError) {
        window.dispatchEvent(new CustomEvent('INHACK_DREAMHACK_LOAD_RESPONSE', {
          detail: { ok: false, message: `익스텐션 오류: ${chrome.runtime.lastError.message}` }
        }));
        return;
      }
      
      if (response && response.ok) {
        window.dispatchEvent(new CustomEvent('INHACK_DREAMHACK_LOAD_RESPONSE', {
          detail: { ok: true }
        }));
      } else {
        const errMsg = response?.message || 'unknown error';
        
        // Invalidate on portal if verification failed and background requests it
        if (response && response.needsInvalidate) {
          try {
            await fetch(getPortalBasePath() + '/dreamhack/invalidate-session', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ sessionid: response.sessionid })
            });
          } catch (e) {}
        }

        window.dispatchEvent(new CustomEvent('INHACK_DREAMHACK_LOAD_RESPONSE', {
          detail: { ok: false, message: errMsg }
        }));
      }
    });
  } catch (err) {
    window.dispatchEvent(new CustomEvent('INHACK_DREAMHACK_LOAD_RESPONSE', {
      detail: { ok: false, message: err.message }
    }));
  }
});

// Listen for admin logout shared trigger from the webpage
window.addEventListener('INHACK_ADMIN_LOGOUT_SHARED_TRIGGER', (event) => {
  if (!isContextValid()) {
    window.location.reload();
    return;
  }
  const { sessionid, csrftoken, sessions } = event.detail;

  chrome.runtime.sendMessage({ 
    type: "ADMIN_LOGOUT_SHARED",
    sessionid,
    csrftoken,
    sessions
  }, (response) => {
    if (chrome.runtime.lastError) {
      window.dispatchEvent(new CustomEvent('INHACK_ADMIN_LOGOUT_SHARED_RESPONSE', {
        detail: { ok: false, message: `익스텐션 오류: ${chrome.runtime.lastError.message}` }
      }));
      return;
    }
    if (response && response.ok) {
      window.dispatchEvent(new CustomEvent('INHACK_ADMIN_LOGOUT_SHARED_RESPONSE', {
        detail: { ok: true }
      }));
    } else {
      const errMsg = response?.message || 'unknown error';
      window.dispatchEvent(new CustomEvent('INHACK_ADMIN_LOGOUT_SHARED_RESPONSE', {
        detail: { ok: false, message: errMsg }
      }));
    }
  });
});

// Automatically update user session state in the extension on page load
async function syncUserSession(basePath) {
  if (!isContextValid()) return;
  try {
    const apiPath = (basePath || getPortalBasePath()) + '/me';
    const res = await fetch(apiPath);
    if (res.ok) {
      const payload = await res.json();
      if (payload && payload.ok && payload.data && payload.data.username) {
        if (!isContextValid()) return;
        chrome.runtime.sendMessage({
          type: "SET_USER",
          username: payload.data.username,
          isAdmin: payload.data.isAdmin || false
        });
        return;
      }
    }
    if (!isContextValid()) return;
    chrome.runtime.sendMessage({ type: "CLEAR_USER" });
  } catch (e) {
    // Silent fail
  }
}

// Run session sync if we are on the portal origin (verified by background config)
if (isContextValid()) {
  chrome.runtime.sendMessage({ type: "CHECK_PORTAL_ORIGIN" }, (response) => {
    if (response && response.isValid) {
      syncUserSession(response.basePath);
    }
  });
}

// Check if we need to show the logout blocked alert on dreamhack.io
const isDreamhackDomain = window.location.hostname.endsWith('dreamhack.io');
if (isDreamhackDomain) {
  let alertTriggered = false;

  const triggerAlertAndReload = (forceRedirect = false) => {
    if (alertTriggered) return;
    alertTriggered = true;

    chrome.storage.local.remove('showLogoutBlockedAlert', () => {
      setTimeout(() => {
        alert('[INHACK] 드림핵 로그아웃 시도가 감지되어 차단되었습니다. 다른 사용자의 공용 세션을 보호하기 위해 서버 로그아웃을 방지하고 로컬 브라우저 쿠키만 삭제합니다.');
        
        if (forceRedirect) {
          window.location.href = 'https://dreamhack.io/';
        } else {
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
        const storageListener = (changes, namespace) => {
          if (!isContextValid()) return;
          if (namespace === 'local' && changes.showLogoutBlockedAlert && changes.showLogoutBlockedAlert.newValue === true) {
            chrome.storage.onChanged.removeListener(storageListener);
            triggerAlertAndReload(true);
          }
        };
        chrome.storage.onChanged.addListener(storageListener);
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
    setTimeout(checkAlertFlag, 400);
  }

  // Helper to trigger alert and run background intercept tasks on the current page immediately (preventing blank screen)
  const performClientSideLogoutBlock = async () => {
    if (!isContextValid()) {
      window.location.reload();
      return;
    }

    alert('[INHACK] 드림핵 로그아웃 시도가 감지되어 차단되었습니다. 다른 사용자의 공용 세션을 보호하기 위해 서버 로그아웃을 방지하고 로컬 브라우저 쿠키만 삭제합니다.');

    chrome.runtime.sendMessage({ type: "STUDENT_LOGOUT_INTERCEPT" }, () => {
      chrome.storage.local.remove('showLogoutBlockedAlert', () => {
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
  chrome.runtime.sendMessage({
    type: "SAVE_MASTER_KEY",
    jwk
  });
});

// Listen for admin E2E auto login and session regeneration trigger from webpage
window.addEventListener('INHACK_ADMIN_AUTO_LOGIN_TRIGGER', (event) => {
  if (!isContextValid()) {
    window.location.reload();
    return;
  }
  const { email, encryptedPassword, iv } = event.detail;

  chrome.runtime.sendMessage({
    type: "ADMIN_AUTO_LOGIN_E2E",
    email,
    encryptedPassword,
    iv
  }, async (response) => {
    if (chrome.runtime.lastError) {
      window.dispatchEvent(new CustomEvent('INHACK_ADMIN_AUTO_LOGIN_RESPONSE', {
        detail: { ok: false, message: `익스텐션 오류: ${chrome.runtime.lastError.message}` }
      }));
      return;
    }

    if (response && response.ok && response.sessions) {
      try {
        // Sync sessions to portal same-origin
        const syncRes = await fetch(getPortalBasePath() + '/dreamhack/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sessions: response.sessions })
        });
        
        if (!syncRes.ok) {
          const syncErr = await syncRes.text();
          throw new Error(`포털 서버 동기화 실패: ${syncErr}`);
        }

        const syncData = await syncRes.json();
        if (!syncData.ok) {
          throw new Error(syncData.message || '포털 서버 동기화 응답 오류');
        }

        window.dispatchEvent(new CustomEvent('INHACK_ADMIN_AUTO_LOGIN_RESPONSE', {
          detail: { ok: true }
        }));
      } catch (syncErr) {
        window.dispatchEvent(new CustomEvent('INHACK_ADMIN_AUTO_LOGIN_RESPONSE', {
          detail: { ok: false, message: syncErr.message }
        }));
      }
    } else {
      const errMsg = response?.message || 'unknown error';
      window.dispatchEvent(new CustomEvent('INHACK_ADMIN_AUTO_LOGIN_RESPONSE', {
        detail: { ok: false, message: errMsg }
      }));
    }
  });
});

// Intercept wargame challenge solves on dreamhack.io page
const isDreamhack = window.location.hostname.endsWith('dreamhack.io');
if (isDreamhack) {
  window.addEventListener('DREAMHACK_CHALLENGE_SOLVED_EVENT', (event) => {
    if (!isContextValid()) return;
    const { challengeId, challengeName } = event.detail;
    
    let resolvedChallengeName = challengeName;
    try {
      const titleEl = document.querySelector('h1, h2, .challenge-title, [class*="title" i]');
      if (titleEl && titleEl.textContent) {
        resolvedChallengeName = titleEl.textContent.trim();
      }
    } catch (e) {}
    
    chrome.runtime.sendMessage({
      type: 'DREAMHACK_SOLVE_DETECTED',
      challengeId,
      challengeName: resolvedChallengeName,
      timestamp: new Date().toISOString()
    }, (response) => {
      if (chrome.runtime.lastError) {
        alert('[INHACK Error] 확장 프로그램 통신 오류: ' + chrome.runtime.lastError.message);
      } else if (response && !response.ok) {
        alert('[INHACK Error] 서버 로그 저장 실패: ' + (response.error || '알 수 없는 오류'));
      }
    });
  });
}
