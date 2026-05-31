async function isHomepageTabOpen() {
  try {
    const tabs = await chrome.tabs.query({
      url: [
        "http://localhost:8080/*",
        "https://localhost:8080/*",
        "http://127.0.0.1:8080/*",
        "https://127.0.0.1:8080/*",
        "http://ddyoru.duckdns.org/*",
        "https://ddyoru.duckdns.org/*"
      ]
    });
    return tabs && tabs.length > 0;
  } catch (err) {
    console.error('[INHACK Background] Error querying tabs:', err);
    return false;
  }
}

function verifyMessageSender(sender) {
  // Allow messages from the extension popup itself
  if (!sender.tab) {
    return true;
  }
  if (sender.tab && sender.tab.url) {
    try {
      const url = new URL(sender.tab.url);
      if (url.hostname === 'localhost' || url.hostname === '127.0.0.1') {
        return url.port === '8080';
      }
      if (url.hostname === 'ddyoru.duckdns.org') {
        return true;
      }
    } catch (e) {
      return false;
    }
  }
  return false;
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!verifyMessageSender(sender)) {
    console.warn("[INHACK Security] Blocked message from untrusted sender:", sender.tab ? sender.tab.url : "unknown");
    return;
  }

  // Cache portal origin in local storage when message is received from portal
  if (sender.tab && sender.tab.url) {
    try {
      const url = new URL(sender.tab.url);
      chrome.storage.local.set({ 'portalOrigin': url.origin });
    } catch (e) {}
  }

  if (msg.type === "URL_REDIRECT") {
    chrome.tabs.create({ url: msg.url });
  } else if (msg.type === "CHECK_HOMEPAGE_TAB") {
    isHomepageTabOpen().then(isOpen => {
      sendResponse({ isOpen });
    });
    return true; // Keep message channel open for async response
  } else if (msg.type === "LOAD_SHARED_SESSION") {
    (async () => {
      try {
        if (!sender.tab || !sender.tab.url) {
          throw new Error("Message sender tab not resolved");
        }
        const url = new URL(sender.tab.url);
        const origin = url.origin;

        // Fetch shared session cookies from OCI server
        console.log('[INHACK Background] Fetching shared session from:', origin);
        const res = await fetch(`${origin}/dreamhack/shared-session`);
        if (!res.ok) {
          throw new Error("Failed to fetch shared session from portal (make sure admin has registered it)");
        }
        const resData = await res.json();
        if (!resData.ok || !resData.data || !resData.data.sessionid) {
          throw new Error(resData.message || "Invalid shared session data");
        }

        const { sessionid, csrftoken } = resData.data;

        // Set cookies in the user's browser for dreamhack.io
        console.log('[INHACK Background] Setting shared session cookies in user browser...');
        await chrome.cookies.set({
          url: 'https://dreamhack.io',
          domain: '.dreamhack.io',
          name: 'sessionid',
          value: sessionid,
          path: '/'
        });
        
        if (csrftoken) {
          await chrome.cookies.set({
            url: 'https://dreamhack.io',
            domain: '.dreamhack.io',
            name: 'csrf_token',
            value: csrftoken,
            path: '/'
          });
          await chrome.cookies.set({
            url: 'https://dreamhack.io',
            domain: '.dreamhack.io',
            name: 'csrftoken',
            value: csrftoken,
            path: '/'
          });
        }

        console.log('[INHACK Background] Shared session cookies set successfully.');

        // Verify session validity from the client-side browser context (bypasses Cloudflare block on OCI)
        console.log('[INHACK Background] Verifying session validity from client browser...');
        let isValid = false;
        try {
          const verifyRes = await fetch('https://dreamhack.io/', {
            method: 'GET',
            headers: {
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
            }
          });
          if (verifyRes.ok) {
            const html = await verifyRes.text();
            isValid = html.includes('/users/logout');
          }
        } catch (verifyErr) {
          console.warn('[INHACK Background] Client-side verification fetch failed:', verifyErr.message);
          // If the network request itself fails in the client browser, assume valid to avoid false deletion
          isValid = true;
        }

        if (!isValid) {
          console.warn('[INHACK Background] Loaded session is inactive. Invalidating on server...');
          // Delete from portal database
          await fetch(`${origin}/dreamhack/invalidate-session`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({ sessionid })
          }).catch(e => console.warn('[INHACK Background] Invalidation request failed:', e.message));

          // Clear cookies locally so they don't linger
          try {
            await chrome.cookies.remove({ url: 'https://dreamhack.io', name: 'sessionid' });
            await chrome.cookies.remove({ url: 'https://dreamhack.io', name: 'csrf_token' });
            await chrome.cookies.remove({ url: 'https://dreamhack.io', name: 'csrftoken' });
          } catch (e) {}

          throw new Error('선택된 공유 세션이 만료되었습니다. 포털에서 자동 삭제 처리되었으니 세션 발급을 다시 시도해주세요.');
        }

        // Open Dreamhack in a new tab upon successful session load
        chrome.tabs.create({ url: 'https://dreamhack.io/', active: true });

        sendResponse({ ok: true });
      } catch (err) {
        console.error('[INHACK Background] Failed to load shared session:', err.message);
        sendResponse({ ok: false, message: err.message });
      }
    })();
    return true; // Keep message channel open for async response
  } else if (msg.type === "ADMIN_AUTO_LOGIN") {
    (async () => {
      try {
        if (!sender.tab || !sender.tab.url) {
          throw new Error("Message sender tab not resolved");
        }
        const url = new URL(sender.tab.url);
        const origin = url.origin;

        // Perform login to Dreamhack and sync back to the portal
        const result = await loginToDreamhackAndSync(msg.email, msg.password, origin);
        sendResponse({ ok: true, sessionid: result.sessionid, csrftoken: result.csrftoken });
      } catch (err) {
        console.error('[INHACK Background] Admin auto login failed:', err.message);
        sendResponse({ ok: false, message: err.message });
      }
    })();
    return true; // Keep message channel open for async response
  } else if (msg.type === "ADMIN_LOGOUT_SHARED") {
    (async () => {
      try {
        await logoutDreamhackSharedSession(msg.sessionid, msg.csrftoken);
        sendResponse({ ok: true });
      } catch (err) {
        console.error('[INHACK Background] Invalidation failed:', err.message);
        sendResponse({ ok: false, message: err.message });
      }
    })();
    return true; // Keep message channel open for async response
  } else if (msg.type === "SET_USER") {
    chrome.storage.local.set({ INHACKuser: { username: msg.username } });
    console.log('[INHACK Background] Logged-in user set to:', msg.username);
    sendResponse({ ok: true });
  } else if (msg.type === "CLEAR_USER") {
    chrome.storage.local.remove('INHACKuser');
    console.log('[INHACK Background] Logged-in user cleared.');
    sendResponse({ ok: true });
  } else if (msg.type === "STUDENT_LOGOUT_INTERCEPT") {
    (async () => {
      try {
        console.log('[INHACK Background] Intercepted student logout via client-side trigger. Discarding cookies locally...');
        
        // Clear cookies locally
        await chrome.cookies.remove({ url: 'https://dreamhack.io', name: 'sessionid' });
        await chrome.cookies.remove({ url: 'https://dreamhack.io', name: 'csrf_token' });
        await chrome.cookies.remove({ url: 'https://dreamhack.io', name: 'csrftoken' });

        // Notify portal for logs
        const storageData = await chrome.storage.local.get('portalOrigin');
        const portalOrigin = storageData.portalOrigin || 'http://localhost:8080';
        fetch(`${portalOrigin}/dreamhack/intercept-logout`, {
          method: 'POST'
        }).catch(e => console.warn('[INHACK Background] Failed to log intercept:', e));

        sendResponse({ ok: true });
      } catch (err) {
        console.error('[INHACK Background] Error handling client logout intercept:', err);
        sendResponse({ ok: false, error: err.message });
      }
    })();
    return true; // Keep message channel open for async response
  } else if (msg.type === "GET_DREAMHACK_COOKIES") {
    chrome.cookies.getAll({ domain: 'dreamhack.io' }).then(cookies => {
      const sessionidCookie = cookies.find(c => c.name === 'sessionid');

      const sessionid = sessionidCookie ? sessionidCookie.value : '';
      const csrftoken = ''; // Do not retrieve csrftoken

      if (!sessionid) {
        sendResponse({ ok: false, message: "드림핵 로그인 세션이 발견되지 않았습니다. 드림핵(dreamhack.io)에 먼저 로그인해주세요." });
        return;
      }

      console.log('[INHACK Background] Cookie sync successful.');
      sendResponse({ ok: true, sessionid, csrftoken });
    }).catch(err => {
      console.error('[INHACK Background] Failed to query cookies:', err);
      sendResponse({ ok: false, message: err.message });
    });
    return true; // Keep message channel open for async response
  }
});

async function pollForLoggedInCookies(sessionNum) {
  for (let attempt = 0; attempt < 25; attempt++) {
    try {
      const cookies = await chrome.cookies.getAll({ domain: 'dreamhack.io' });
      const sessionidCookie = cookies.find(c => c.name === 'sessionid');

      if (sessionidCookie && sessionidCookie.value) {
        return {
          sessionid: sessionidCookie.value,
          csrftoken: '' // Do not retrieve csrftoken
        };
      }
    } catch (e) {
      console.warn('[INHACK Background] Error polling cookies:', e);
    }
    await new Promise(resolve => setTimeout(resolve, 200));
  }
  throw new Error(`Session ${sessionNum} sessionid cookie not found after login.`);
}

async function loginToDreamhackAndSync(email, password, origin) {
  const sessions = [];

  for (let i = 0; i < 3; i++) {
    console.log(`[INHACK Background] Generating session ${i + 1}/3...`);

    // Clear existing cookies locally to force Django to generate a fresh session ID
    try {
      await chrome.cookies.remove({ url: 'https://dreamhack.io', name: 'sessionid' });
      await chrome.cookies.remove({ url: 'https://dreamhack.io', name: 'csrf_token' });
      await chrome.cookies.remove({ url: 'https://dreamhack.io', name: 'csrftoken' });
    } catch (e) {}

    // Add a small delay to let Chrome process cookie deletions
    await new Promise(resolve => setTimeout(resolve, 500));

    // Create background tab
    const tab = await chrome.tabs.create({
      url: 'https://dreamhack.io/login/',
      active: false
    });

    try {
      // Wait load
      await new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          chrome.tabs.onUpdated.removeListener(listener);
          reject(new Error(`Session ${i + 1} login page load timeout`));
        }, 10000);

        function listener(tabId, changeInfo) {
          if (tabId === tab.id && changeInfo.status === 'complete') {
            clearTimeout(timeout);
            chrome.tabs.onUpdated.removeListener(listener);
            resolve();
          }
        }
        chrome.tabs.onUpdated.addListener(listener);
      });

      // Execute login request inside tab context (no X-CSRFToken header needed pre-login since guest cookies are clean)
      const injectionResults = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: async (userEmail, userPassword) => {
          try {
            const loginRes = await fetch('/api/v1/auth/login/', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json'
              },
              body: JSON.stringify({
                email: userEmail,
                password: userPassword,
                loginSave: false
              })
            });

            if (!loginRes.ok) {
              const errText = await loginRes.text();
              return { ok: false, error: `Login API responded with status ${loginRes.status}: ${errText}` };
            }

            return { ok: true };
          } catch (e) {
            return { ok: false, error: e.message };
          }
        },
        args: [email, password]
      });

      const runResult = injectionResults[0]?.result;
      if (!runResult || !runResult.ok) {
        throw new Error(runResult?.error || `Session ${i + 1} login execution failed.`);
      }

      // Poll the cookie store to wait for the session and newly issued CSRF cookie
      const sessionData = await pollForLoggedInCookies(i + 1);
      sessions.push(sessionData);

    } finally {
      console.log(`[INHACK Background] Cleaning up background tab for session ${i + 1}...`);
      try {
        await chrome.tabs.remove(tab.id);
      } catch (e) {}
      // Add a small delay after closing the tab before the next loop iteration
      await new Promise(resolve => setTimeout(resolve, 500));
    }
  }

  console.log('[INHACK Background] Generated 3 sessions. Synchronizing sessions back to portal...');
  const syncRes = await fetch(`${origin}/dreamhack/login`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ sessions })
  });

  if (!syncRes.ok) {
    const syncErr = await syncRes.text();
    throw new Error(`포털 서버 동기화 실패: ${syncErr}`);
  }

  const syncData = await syncRes.json();
  if (!syncData.ok) {
    throw new Error(syncData.message || '포털 서버 동기화 응답 오류');
  }

  return { sessionid: sessions[0].sessionid, csrftoken: sessions[0].csrftoken };
}

async function logoutDreamhackSharedSession(sessionid, csrftoken) {
  console.log('[INHACK Background] Invalidate session: Creating background tab for Dreamhack first-party logout...');
  const tab = await chrome.tabs.create({
    url: 'https://dreamhack.io/login/',
    active: false
  });

  try {
    console.log('[INHACK Background] Waiting for tab to load:', tab.id);
    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        chrome.tabs.onUpdated.removeListener(listener);
        reject(new Error('Dreamhack logout page load timeout'));
      }, 10000);

      function listener(tabId, changeInfo) {
        if (tabId === tab.id && changeInfo.status === 'complete') {
          clearTimeout(timeout);
          chrome.tabs.onUpdated.removeListener(listener);
          resolve();
        }
      }
      chrome.tabs.onUpdated.addListener(listener);
    });

    console.log('[INHACK Background] Injecting logout execution script inside tab...');
    const injectionResults = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: async (sessVal, csrfVal) => {
        try {
          // Clear current page cookies first
          document.cookie = 'sessionid=; Path=/; Domain=.dreamhack.io; Expires=Thu, 01 Jan 1970 00:00:01 GMT;';
          document.cookie = 'csrf_token=; Path=/; Domain=.dreamhack.io; Expires=Thu, 01 Jan 1970 00:00:01 GMT;';
          document.cookie = 'csrftoken=; Path=/; Domain=.dreamhack.io; Expires=Thu, 01 Jan 1970 00:00:01 GMT;';

          // Set the cookies we want to invalidate
          document.cookie = `sessionid=${sessVal}; Path=/; Domain=.dreamhack.io; Secure; SameSite=Lax;`;
          if (csrfVal) {
            document.cookie = `csrf_token=${csrfVal}; Path=/; Domain=.dreamhack.io; Secure; SameSite=Lax;`;
            document.cookie = `csrftoken=${csrfVal}; Path=/; Domain=.dreamhack.io; Secure; SameSite=Lax;`;
          }

          const logoutRes = await fetch('/users/logout/', {
            method: 'POST',
            headers: {
              'X-CSRFToken': csrfVal || ''
            }
          });

          if (!logoutRes.ok) {
            const errText = await logoutRes.text();
            throw new Error(`Logout API failed with status ${logoutRes.status}: ${errText}`);
          }

          // Clean up cookies again
          document.cookie = 'sessionid=; Path=/; Domain=.dreamhack.io; Expires=Thu, 01 Jan 1970 00:00:01 GMT;';
          document.cookie = 'csrf_token=; Path=/; Domain=.dreamhack.io; Expires=Thu, 01 Jan 1970 00:00:01 GMT;';
          document.cookie = 'csrftoken=; Path=/; Domain=.dreamhack.io; Expires=Thu, 01 Jan 1970 00:00:01 GMT;';

          return { ok: true };
        } catch (e) {
          return { ok: false, error: e.message };
        }
      },
      args: [sessionid, csrftoken]
    });

    const runResult = injectionResults[0]?.result;
    if (!runResult || !runResult.ok) {
      throw new Error(runResult?.error || 'First-party logout script execution failed.');
    }

    console.log('[INHACK Background] Invalidation completed successfully.');

  } finally {
    console.log('[INHACK Background] Cleaning up background tab...');
    try {
      await chrome.tabs.remove(tab.id);
    } catch (e) {
      console.warn('[INHACK Background] Failed to remove background tab:', e);
    }
  }
}

const LOGOUT_BLOCK_RULE_ID = 2002;

// Function to enable or disable the logout block rule based on user role
async function updateLogoutBlockRule() {
  const isAdmin = await isCurrentUserAdmin();
  
  if (isAdmin) {
    console.log('[INHACK Background] Current user is Admin. Disabling logout block rule.');
    try {
      await chrome.declarativeNetRequest.updateSessionRules({
        removeRuleIds: [LOGOUT_BLOCK_RULE_ID]
      });
      await chrome.declarativeNetRequest.updateDynamicRules({
        removeRuleIds: [LOGOUT_BLOCK_RULE_ID]
      });
    } catch (e) {
      console.warn('[INHACK Background] Failed to remove DNR session rules:', e);
    }
  } else {
    console.log('[INHACK Background] Current user is Student. Enabling logout block rule.');
    try {
      // Ensure we clean up session rules first to avoid conflicts
      await chrome.declarativeNetRequest.updateSessionRules({
        removeRuleIds: [LOGOUT_BLOCK_RULE_ID]
      });
      // Add as dynamic rule so it persists across restarts
      await chrome.declarativeNetRequest.updateDynamicRules({
        removeRuleIds: [LOGOUT_BLOCK_RULE_ID],
        addRules: [
          {
            id: LOGOUT_BLOCK_RULE_ID,
            priority: 2,
            action: {
              type: 'redirect',
              redirect: { url: 'https://dreamhack.io/' } // Redirect POST to home (fails POST, blocks actual logout on server)
            },
            condition: {
              urlFilter: '*://dreamhack.io/users/logout*',
              resourceTypes: ['main_frame', 'sub_frame', 'xmlhttprequest', 'ping', 'other']
            }
          }
        ]
      });
    } catch (e) {
      console.warn('[INHACK Background] Failed to setup DNR dynamic rules:', e);
    }
  }
}

// Helper to check if current user is admin
async function isCurrentUserAdmin() {
  try {
    const data = await chrome.storage.local.get('INHACKuser');
    return data && data.INHACKuser && data.INHACKuser.username === 'developer';
  } catch (e) {
    return false;
  }
}

// Storage listener to update rules dynamically when user logs in/out of portal
chrome.storage.onChanged.addListener((changes, namespace) => {
  if (namespace === 'local' && changes.INHACKuser) {
    updateLogoutBlockRule();
  }
});

// Run once on startup & install
chrome.runtime.onInstalled.addListener(() => {
  updateLogoutBlockRule();
});
chrome.runtime.onStartup.addListener(() => {
  updateLogoutBlockRule();
});
// Execute now as well (in case service worker is already active)
updateLogoutBlockRule();

// Intercept student logout network request, discard cookies locally and set alert flag
chrome.webRequest.onBeforeRequest.addListener(
  async (details) => {
    const isAdmin = await isCurrentUserAdmin();
    if (isAdmin) {
      console.log('[INHACK Background] Admin logged out of Dreamhack. Clearing shared sessions on portal...');
      chrome.storage.local.get('portalOrigin').then(res => {
        const portalOrigin = res.portalOrigin || 'http://localhost:8080';
        fetch(`${portalOrigin}/dreamhack/clear-shared-session`, {
          method: 'POST'
        }).catch(e => console.warn('[INHACK Background] Failed to clear shared sessions on admin logout:', e));
      });
      return; // Let them logout on the server
    }

    console.log('[INHACK Background] Intercepted student logout request. Setting alert flag first...');
    
    // Set storage flag immediately to minimize race conditions with content.js
    try {
      await chrome.storage.local.set({ 'showLogoutBlockedAlert': true });
      console.log('[INHACK Background] showLogoutBlockedAlert flag set successfully.');
    } catch (err) {
      console.warn('[INHACK Background] Failed to set showLogoutBlockedAlert flag:', err);
    }

    // Clear cookies locally in parallel (do not block flow)
    (async () => {
      try {
        await chrome.cookies.remove({ url: 'https://dreamhack.io', name: 'sessionid' });
        await chrome.cookies.remove({ url: 'https://dreamhack.io', name: 'csrf_token' });
        await chrome.cookies.remove({ url: 'https://dreamhack.io', name: 'csrftoken' });
        console.log('[INHACK Background] Local cookies cleared successfully.');
      } catch (err) {
        console.warn('[INHACK Background] Failed to remove local cookies during intercept:', err);
      }
    })();

    // Notify portal about interception for debugging logs
    chrome.storage.local.get('portalOrigin').then(res => {
      const portalOrigin = res.portalOrigin || 'http://localhost:8080';
      console.log('[INHACK Background] Logging logout interception to portal:', portalOrigin);
      fetch(`${portalOrigin}/dreamhack/intercept-logout`, {
        method: 'POST'
      }).catch(e => console.warn('[INHACK Background] Failed to log intercept:', e));
    });

    // Force the tab to redirect ONLY if it is not a main_frame navigation (which DNR redirects automatically)
    if (details.type !== 'main_frame' && details.tabId && details.tabId !== chrome.tabs.TAB_ID_NONE) {
      try {
        await chrome.tabs.update(details.tabId, { url: 'https://dreamhack.io/' });
        console.log('[INHACK Background] Non-navigation logout request. Redirecting tab programmatically.');
      } catch (err) {
        console.warn('[INHACK Background] Failed to redirect tab:', err);
      }
    }
  },
  { urls: ["https://dreamhack.io/users/logout", "https://dreamhack.io/users/logout/"] }
);
