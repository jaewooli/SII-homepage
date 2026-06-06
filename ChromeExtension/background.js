importScripts('config.js');
// Helper to thoroughly clear all dreamhack-related local authorization cookies
async function clearDreamhackCookiesLocally() {
  try {
    // 1. Collect all target urls to try removing from
    const urlsToTry = new Set([
      'https://dreamhack.io',
      'http://dreamhack.io',
      'https://www.dreamhack.io',
      'http://www.dreamhack.io'
    ]);

    // Add active tabs matching dreamhack.io to the URLs list
    try {
      const tabs = await chrome.tabs.query({ url: '*://*.dreamhack.io/*' });
      if (tabs) {
        for (const tab of tabs) {
          if (tab.url) {
            try {
              const parsedUrl = new URL(tab.url);
              urlsToTry.add(`${parsedUrl.protocol}//${parsedUrl.hostname}`);
              urlsToTry.add(`${parsedUrl.protocol}//${parsedUrl.hostname}/`);
            } catch (e) {}
          }
        }
      }
    } catch (err) {

    }

    // Add URLs resolved from actual existing cookies
    try {
      const allCookies = await chrome.cookies.getAll({});
      const dhCookies = allCookies.filter(c => c.domain.includes('dreamhack.io'));
      for (const cookie of dhCookies) {
        const prefix = cookie.secure ? 'https://' : 'http://';
        const domainStr = cookie.domain.startsWith('.') ? cookie.domain.substring(1) : cookie.domain;
        urlsToTry.add(prefix + domainStr + cookie.path);
        urlsToTry.add(prefix + domainStr);
      }
    } catch (err) {

    }

    const targetNames = ['sessionid', 'csrf_token', 'csrftoken'];
    
    // 2. Iterate through all targets and execute removals
    for (const url of urlsToTry) {
      for (const name of targetNames) {
        try {
          // Attempt standard removal
          await chrome.cookies.remove({ url: url, name: name });

        } catch (e) {
          // Ignore failure
        }
      }
    }
  } catch (err) {

  }
}

async function isHomepageTabOpen() {
  try {
    const tabs = await chrome.tabs.query({});
    if (!tabs) return false;
    const origins = typeof ALLOWED_ORIGINS !== 'undefined' ? ALLOWED_ORIGINS : ["http://localhost:8080", "http://127.0.0.1:8080", "https://localhost:8080", "https://127.0.0.1:8080"];
    for (const tab of tabs) {
      if (tab.url) {
        try {
          const url = new URL(tab.url);
          if (origins.includes(url.origin)) {
            return true;
          }
        } catch (e) {}
      }
    }
    return false;
  } catch (err) {
    return false;
  }
}

function verifyMessageSender(sender) {
  if (!sender.tab) {
    return true;
  }
  if (sender.tab && sender.tab.url) {
    try {
      const url = new URL(sender.tab.url);
      const origins = typeof ALLOWED_ORIGINS !== 'undefined' ? ALLOWED_ORIGINS : ["http://localhost:8080", "http://127.0.0.1:8080", "https://localhost:8080", "https://127.0.0.1:8080"];
      if (origins.includes(url.origin)) {
        return true;
      }
      if (url.hostname === 'dreamhack.io' || url.hostname.endsWith('.dreamhack.io')) {
        return true;
      }
    } catch (e) {
      return false;
    }
  }
  return false;
}

function extractPortalBase(urlStr) {
  const fallback = typeof PORTAL_URL !== 'undefined' ? PORTAL_URL : 'http://localhost:8080/homepage';
  if (!urlStr) return fallback;
  try {
    const url = new URL(urlStr);
    const origins = typeof ALLOWED_ORIGINS !== 'undefined' ? ALLOWED_ORIGINS : ["http://localhost:8080", "http://127.0.0.1:8080", "https://localhost:8080", "https://127.0.0.1:8080"];
    if (!origins.includes(url.origin)) {
      return fallback;
    }
    const targetPathname = typeof PORTAL_URL !== 'undefined' ? new URL(PORTAL_URL).pathname.replace(/\/$/, '') : '/homepage';
    const cleanPath = url.pathname.replace(/\/$/, '');
    if (cleanPath === targetPathname || cleanPath.startsWith(targetPathname + '/')) {
      return url.origin + targetPathname;
    }
    return fallback;
  } catch (e) {
    return fallback;
  }
}

function isValidPortalOrigin(originStr) {
  if (!originStr) return false;
  try {
    const url = new URL(originStr);
    const origins = typeof ALLOWED_ORIGINS !== 'undefined' ? ALLOWED_ORIGINS : ["http://localhost:8080", "http://127.0.0.1:8080", "https://localhost:8080", "https://127.0.0.1:8080"];
    if (!origins.includes(url.origin)) {
      return false;
    }
    const targetPathname = typeof PORTAL_URL !== 'undefined' ? new URL(PORTAL_URL).pathname.replace(/\/$/, '') : '/homepage';
    const currentPathname = url.pathname.replace(/\/$/, '');
    return currentPathname === targetPathname;
  } catch (e) {
    return false;
  }
}

async function getValidPortalOrigin() {
  try {
    const res = await chrome.storage.local.get('portalOrigin');
    if (res && isValidPortalOrigin(res.portalOrigin)) {
      return res.portalOrigin;
    }
  } catch (e) {}
  return typeof PORTAL_URL !== 'undefined' ? PORTAL_URL : 'http://localhost:8080/homepage';
}

// Startup cleanup of any contaminated portalOrigin values
chrome.storage.local.get('portalOrigin').then(res => {
  if (res && res.portalOrigin && !isValidPortalOrigin(res.portalOrigin)) {

    chrome.storage.local.remove('portalOrigin');
  }
});

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === "CHECK_PORTAL_ORIGIN") {
    const isValid = sender.tab && sender.tab.url ? isValidPortalOrigin(extractPortalBase(sender.tab.url)) : false;
    const basePath = typeof PORTAL_URL !== 'undefined' ? new URL(PORTAL_URL).pathname.replace(/\/$/, '') : '/homepage';
    sendResponse({ isValid, basePath });
    return true;
  }

  if (!verifyMessageSender(sender)) {

    return;
  }

  // Cache portal origin in local storage when message is received from portal
  if (sender.tab && sender.tab.url) {
    try {
      const portalBase = extractPortalBase(sender.tab.url);
      if (isValidPortalOrigin(portalBase)) {
        chrome.storage.local.set({ 'portalOrigin': portalBase });
      }
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
        const { sessionid, csrftoken } = msg;
        if (!sessionid) {
          throw new Error("Invalid session ID passed from content script");
        }

        // Set cookies in the user's browser for dreamhack.io
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

        // Verify session validity from the client-side browser context
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
          isValid = true;
        }

        if (!isValid) {
          // Clear cookies locally so they don't linger
          await clearDreamhackCookiesLocally();
          sendResponse({ ok: false, needsInvalidate: true, sessionid, message: '선택된 공유 세션이 만료되었습니다. 포털에서 자동 삭제 처리되었으니 세션 발급을 다시 시도해주세요.' });
          return;
        }

        // Open Dreamhack in a new tab upon successful session load
        chrome.tabs.create({ url: 'https://dreamhack.io/', active: true });
        sendResponse({ ok: true });
      } catch (err) {
        sendResponse({ ok: false, message: err.message });
      }
    })();
    return true; // Keep message channel open for async response
  } else if (msg.type === "ADMIN_LOGOUT_SHARED") {
    (async () => {
      try {
        if (msg.sessions && msg.sessions.length > 0) {
          for (let i = 0; i < msg.sessions.length; i++) {
            const s = msg.sessions[i];
            try {
              await logoutDreamhackSharedSession(s.sessionid, s.csrftoken);
            } catch (err) {}
          }
        } else if (msg.sessionid) {
          await logoutDreamhackSharedSession(msg.sessionid, msg.csrftoken);
        }
        sendResponse({ ok: true });
      } catch (err) {
        sendResponse({ ok: false, message: err.message });
      }
    })();
    return true; // Keep message channel open for async response
  } else if (msg.type === "SET_USER") {
    chrome.storage.local.set({ INHACKuser: { username: msg.username, isAdmin: msg.isAdmin || false } });
    sendResponse({ ok: true });
  } else if (msg.type === "CLEAR_USER") {
    chrome.storage.local.remove('INHACKuser');
    sendResponse({ ok: true });
  } else if (msg.type === "STUDENT_LOGOUT_INTERCEPT") {
    (async () => {
      try {
        // Clear cookies locally
        await clearDreamhackCookiesLocally();
        sendResponse({ ok: true });
      } catch (err) {

        sendResponse({ ok: false, error: err.message });
      }
    })();
    return true; // Keep message channel open for async response
  } else if (msg.type === "GET_DREAMHACK_COOKIES") {
    chrome.cookies.getAll({ domain: 'dreamhack.io' }).then(cookies => {
      const sessionidCookie = cookies.find(c => c.name === 'sessionid');
      const csrfCookie = cookies.find(c => c.name === 'csrf_token' || c.name === 'csrftoken');

      const sessionid = sessionidCookie ? sessionidCookie.value : '';
      const csrftoken = csrfCookie ? csrfCookie.value : '';

      if (!sessionid) {
        sendResponse({ ok: false, message: "드림핵 로그인 세션이 발견되지 않았습니다. 드림핵(dreamhack.io)에 먼저 로그인해주세요." });
        return;
      }

      sendResponse({ ok: true, sessionid, csrftoken });
    }).catch(err => {

      sendResponse({ ok: false, message: err.message });
    });
    return true; // Keep message channel open for async response
  } else if (msg.type === "SAVE_MASTER_KEY") {
    chrome.storage.local.set({ 'inhack_master_key': msg.jwk }, () => {

      sendResponse({ ok: true });
    });
    return true;
  } else if (msg.type === "ADMIN_AUTO_LOGIN_E2E") {
    (async () => {
      try {
        // 1. Get Master Key from local storage
        const storageData = await chrome.storage.local.get('inhack_master_key');
        if (!storageData || !storageData.inhack_master_key) {
          throw new Error('익스텐션에 보안용 마스터 키가 등록되어 있지 않습니다. 먼저 Dreamhack Integration 메뉴에서 E2E 설정을 다시 완료해 주세요.');
        }

        // 2. Decrypt Password E2E
        const plainPassword = await decryptPasswordE2E(
          msg.encryptedPassword,
          msg.iv,
          storageData.inhack_master_key
        );

        // 3. Perform login to Dreamhack
        const result = await loginToDreamhack(msg.email, plainPassword);
        sendResponse({ ok: true, sessions: result.sessions });
      } catch (err) {
        sendResponse({ ok: false, message: err.message });
      }
    })();
    return true; // Keep message channel open for async response
  } else if (msg.type === "DREAMHACK_SOLVE_DETECTED") {
    (async () => {
      try {
        const portalOrigin = await getValidPortalOrigin();
        
        // Retrieve username from local storage cache first
        const userData = await chrome.storage.local.get('INHACKuser');
        const username = userData && userData.INHACKuser && userData.INHACKuser.username;
        
        if (!username) {
          throw new Error('User is not logged into INHACK Portal (Session cache missing)');
        }

        const logRes = await fetch(`${portalOrigin}/dreamhack/solve-log`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          credentials: 'include',
          body: JSON.stringify({
            username,
            challengeId: msg.challengeId,
            challengeName: msg.challengeName,
            timestamp: msg.timestamp
          })
        });
        
        const logData = await logRes.json();
        if (logRes.ok && logData.ok) {
          sendResponse({ ok: true });
        } else {
          throw new Error(logData.message || 'Server log failed');
        }
      } catch (err) {
        sendResponse({ ok: false, error: err.message });
      }
    })();
    return true; // Keep message channel open for async response
  }
});

// E2E Web Crypto Decrypt Helper with safe base64 decoding
function safeAtob(base64) {
  const binaryString = atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

async function decryptPasswordE2E(encryptedBase64, ivBase64, jwk) {
  const key = await self.crypto.subtle.importKey(
    "jwk",
    jwk,
    { name: "AES-GCM", length: 256 },
    true,
    ["encrypt", "decrypt"]
  );

  const enc = new TextDecoder();
  const encrypted = safeAtob(encryptedBase64);
  const iv = safeAtob(ivBase64);

  const decrypted = await self.crypto.subtle.decrypt(
    { name: "AES-GCM", iv: iv },
    key,
    encrypted
  );
  const decryptedText = enc.decode(decrypted);

  return decryptedText;
}

async function pollForLoggedInCookies(sessionNum) {
  for (let attempt = 0; attempt < 25; attempt++) {
    try {
      const cookies = await chrome.cookies.getAll({ domain: 'dreamhack.io' });
      const sessionidCookie = cookies.find(c => c.name === 'sessionid');
      const csrfCookie = cookies.find(c => c.name === 'csrf_token' || c.name === 'csrftoken');

      if (sessionidCookie && sessionidCookie.value) {
        return {
          sessionid: sessionidCookie.value,
          csrftoken: csrfCookie ? csrfCookie.value : ''
        };
      }
    } catch (e) {

    }
    await new Promise(resolve => setTimeout(resolve, 200));
  }
  throw new Error(`Session ${sessionNum} sessionid cookie not found after login.`);
}

async function loginToDreamhack(email, password) {
  const cleanEmail = email ? email.trim() : '';

  const sessions = [];

  for (let i = 0; i < 3; i++) {
    // Clear existing cookies locally to force Django to generate a fresh session ID
    await clearDreamhackCookiesLocally();

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

      // Execute login request inside tab context
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
        args: [cleanEmail, password]
      });

      const runResult = injectionResults[0]?.result;
      if (!runResult || !runResult.ok) {
        throw new Error(runResult?.error || `Session ${i + 1} login execution failed.`);
      }

      // Poll the cookie store to wait for the session and newly issued CSRF cookie
      const sessionData = await pollForLoggedInCookies(i + 1);
      sessions.push(sessionData);

    } finally {
      try {
        await chrome.tabs.remove(tab.id);
      } catch (e) {}
      // Add a small delay after closing the tab before the next loop iteration
      await new Promise(resolve => setTimeout(resolve, 500));
    }
  }

  if (sessions.length === 0) {
    throw new Error("드림핵 세션 정보를 획득하는 데 실패했습니다.");
  }

  return { sessions };
}

async function logoutDreamhackSharedSession(sessionid, csrftoken) {

  const tab = await chrome.tabs.create({
    url: 'https://dreamhack.io/login/',
    active: false
  });

  try {

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
            method: 'GET'
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

  } finally {

    try {
      await chrome.tabs.remove(tab.id);
    } catch (e) {

    }
  }
}

const LOGOUT_BLOCK_RULE_ID = 2002;

// Function to enable or disable the logout block rule based on user role
async function updateLogoutBlockRule() {
  const isAdmin = await isCurrentUserAdmin();
  
  if (isAdmin) {

    try {
      await chrome.declarativeNetRequest.updateSessionRules({
        removeRuleIds: [LOGOUT_BLOCK_RULE_ID]
      });
      await chrome.declarativeNetRequest.updateDynamicRules({
        removeRuleIds: [LOGOUT_BLOCK_RULE_ID]
      });
    } catch (e) {

    }
  } else {

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

    }
  }
}

// Helper to check if current user is admin
async function isCurrentUserAdmin() {
  try {
    const data = await chrome.storage.local.get('INHACKuser');
    return data && data.INHACKuser && (data.INHACKuser.isAdmin === true || data.INHACKuser.username === 'developer');
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
      // Find any active/open portal tab to execute same-origin fetch
      chrome.tabs.query({}).then(tabs => {
        const portalTab = tabs.find(t => t.url && isValidPortalOrigin(extractPortalBase(t.url)));
        if (portalTab) {
          const portalBase = extractPortalBase(portalTab.url);
          chrome.scripting.executeScript({
            target: { tabId: portalTab.id },
            func: async (basePath) => {
              try {
                await fetch(basePath + '/dreamhack/clear-shared-session', { method: 'POST' });
              } catch(e) {}
            },
            args: [portalBase]
          });
        }
      });
      return; // Let them logout on the server
    }

    // Set storage flag immediately to minimize race conditions with content.js
    try {
      await chrome.storage.local.set({ 'showLogoutBlockedAlert': true });
    } catch (err) {}

    // Clear cookies locally in parallel (do not block flow)
    clearDreamhackCookiesLocally();

    // Find any active/open portal tab to execute same-origin fetch
    chrome.tabs.query({}).then(tabs => {
      const portalTab = tabs.find(t => t.url && isValidPortalOrigin(extractPortalBase(t.url)));
      if (portalTab) {
        const portalBase = extractPortalBase(portalTab.url);
        chrome.scripting.executeScript({
          target: { tabId: portalTab.id },
          func: async (basePath) => {
            try {
              await fetch(basePath + '/dreamhack/intercept-logout', { method: 'POST' });
            } catch(e) {}
          },
          args: [portalBase]
        });
      }
    });

    // Force the tab to redirect ONLY if it is not a main_frame navigation (which DNR redirects automatically)
    if (details.type !== 'main_frame' && details.tabId && details.tabId !== chrome.tabs.TAB_ID_NONE) {
      try {
        await chrome.tabs.update(details.tabId, { url: 'https://dreamhack.io/' });
      } catch (err) {}
    }
  },
  { urls: ["https://dreamhack.io/users/logout", "https://dreamhack.io/users/logout/"] }
);
