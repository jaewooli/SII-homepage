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
        }

        console.log('[INHACK Background] Shared session cookies set successfully.');
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
  } else if (msg.type === "GET_DREAMHACK_COOKIES") {
    chrome.cookies.getAll({ domain: 'dreamhack.io' }).then(cookies => {
      const sessionidCookie = cookies.find(c => c.name === 'sessionid');
      const csrftokenCookie = cookies.find(c => c.name === 'csrf_token');

      const sessionid = sessionidCookie ? sessionidCookie.value : '';
      const csrftoken = csrftokenCookie ? csrftokenCookie.value : '';

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

async function loginToDreamhackAndSync(email, password, origin) {
  // Clear existing sessionid cookie for dreamhack.io to force Django to generate a fresh session
  console.log('[INHACK Background] Clearing existing sessionid cookie to force a new session...');
  try {
    await chrome.cookies.remove({
      url: 'https://dreamhack.io',
      name: 'sessionid'
    });
  } catch (e) {
    console.warn('[INHACK Background] Failed to clear sessionid cookie (it might not exist):', e);
  }

  console.log('[INHACK Background] Creating background tab for Dreamhack first-party login...');
  
  // 1. Create a background tab pointing to Dreamhack login page
  const tab = await chrome.tabs.create({
    url: 'https://dreamhack.io/login/',
    active: false
  });

  try {
    // 2. Wait for the tab to complete loading
    console.log('[INHACK Background] Waiting for login page to load in tab:', tab.id);
    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        chrome.tabs.onUpdated.removeListener(listener);
        reject(new Error('Dreamhack login page load timeout'));
      }, 10000); // 10s timeout

      function listener(tabId, changeInfo) {
        if (tabId === tab.id && changeInfo.status === 'complete') {
          clearTimeout(timeout);
          chrome.tabs.onUpdated.removeListener(listener);
          resolve();
        }
      }
      chrome.tabs.onUpdated.addListener(listener);
    });

    // 3. Execute login fetch script inside the tab context
    console.log('[INHACK Background] Executing login request within first-party tab context...');
    const injectionResults = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: async (userEmail, userPassword) => {
        try {
          // Read CSRF token from page cookie
          const getCookie = (name) => {
            const value = `; ${document.cookie}`;
            const parts = value.split(`; ${name}=`);
            if (parts.length === 2) return parts.pop().split(';').shift();
            return '';
          };

          const csrfToken = getCookie('csrf_token');
          if (!csrfToken) {
            return { ok: false, error: 'CSRF cookie not found in page document.cookie: ' + document.cookie };
          }

          // 1. Invalidate old session on Dreamhack server by calling logout
          console.log('[INHACK Tab] Logging out old session to invalidate it...');
          try {
            await fetch('/api/v1/auth/logout/', {
              method: 'POST',
              headers: {
                'X-CSRFToken': csrfToken
              }
            });
          } catch (e) {
            console.warn('[INHACK Tab] Failed to logout old session:', e);
          }

          // 2. Perform new login
          const loginRes = await fetch('/api/v1/auth/login/', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Accept': 'application/json',
              'X-CSRFToken': csrfToken
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

    // Verify result
    const runResult = injectionResults[0]?.result;
    if (!runResult || !runResult.ok) {
      throw new Error(runResult?.error || 'First-party login execution failed with empty result.');
    }

    // 4. Wait a moment for cookies to be committed by the browser
    console.log('[INHACK Background] Login succeeded inside tab. Retrieving session cookies...');
    await new Promise(resolve => setTimeout(resolve, 800));

    const cookies = await chrome.cookies.getAll({ domain: 'dreamhack.io' });
    const sessionidCookie = cookies.find(c => c.name === 'sessionid');
    const csrftokenCookie = cookies.find(c => c.name === 'csrf_token');

    if (!sessionidCookie) {
      throw new Error("드림핵 로그인에는 성공했으나 sessionid 쿠키를 획득하지 못했습니다.");
    }

    const sessionid = sessionidCookie.value;
    const csrftoken = csrftokenCookie ? csrftokenCookie.value : '';

    // 5. Synchronize session back to portal
    console.log('[INHACK Background] Synchronizing cookies back to portal...');
    const syncRes = await fetch(`${origin}/dreamhack/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ sessionid, csrftoken })
    });

    if (!syncRes.ok) {
      const syncErr = await syncRes.text();
      throw new Error(`포털 서버 동기화 실패: ${syncErr}`);
    }

    const syncData = await syncRes.json();
    if (!syncData.ok) {
      throw new Error(syncData.message || '포털 서버 동기화 응답 오류');
    }

    return { sessionid, csrftoken };

  } finally {
    // 6. Always clean up the tab
    console.log('[INHACK Background] Cleaning up background tab...');
    try {
      await chrome.tabs.remove(tab.id);
    } catch (e) {
      console.warn('[INHACK Background] Failed to remove background tab:', e);
    }
  }
}
