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
            name: 'csrftoken',
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
      const csrftokenCookie = cookies.find(c => c.name === 'csrftoken');

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

const RULE_ID = 1001;

async function setupHeadersRule() {
  try {
    await chrome.declarativeNetRequest.updateSessionRules({
      removeRuleIds: [RULE_ID],
      addRules: [
        {
          id: RULE_ID,
          priority: 1,
          action: {
            type: 'modifyHeaders',
            requestHeaders: [
              { header: 'origin', operation: 'set', value: 'https://dreamhack.io' },
              { header: 'referer', operation: 'set', value: 'https://dreamhack.io/' }
            ]
          },
          condition: {
            urlFilter: 'https://dreamhack.io/api/v1/auth/login/',
            resourceTypes: ['xmlhttprequest']
          }
        }
      ]
    });
    console.log('[INHACK Background] DeclarativeNetRequest session rule for headers setup successfully.');
  } catch (err) {
    console.error('[INHACK Background] Failed to setup DNR rules:', err);
  }
}

async function removeHeadersRule() {
  try {
    await chrome.declarativeNetRequest.updateSessionRules({
      removeRuleIds: [RULE_ID]
    });
    console.log('[INHACK Background] DeclarativeNetRequest session rule removed.');
  } catch (err) {
    console.error('[INHACK Background] Failed to remove DNR rules:', err);
  }
}

async function loginToDreamhackAndSync(email, password, origin) {
  console.log('[INHACK Background] Setting up header modifications for Dreamhack login...');
  await setupHeadersRule();

  try {
    // 1. Fetch home page to establish/renew the csrftoken cookie in the browser's cookie jar
    console.log('[INHACK Background] Warming up CSRF session by fetching Dreamhack home...');
    await fetch('https://dreamhack.io/', { credentials: 'include' });
    await new Promise(resolve => setTimeout(resolve, 300));

    console.log('[INHACK Background] Checking cookies for CSRF token...');
    const cookiesList = await chrome.cookies.getAll({ domain: 'dreamhack.io' });
    const csrftokenCookie = cookiesList.find(c => c.name === 'csrftoken');
    
    const headers = {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    };

    if (csrftokenCookie && csrftokenCookie.value) {
      console.log('[INHACK Background] Attaching CSRF token to request headers:', csrftokenCookie.value);
      headers['X-CSRFToken'] = csrftokenCookie.value;
    } else {
      console.warn('[INHACK Background] No csrftoken cookie found even after warmup!');
    }

    console.log('[INHACK Background] Performing background login to Dreamhack...');
    const loginRes = await fetch('https://dreamhack.io/api/v1/auth/login/', {
      method: 'POST',
      headers: headers,
      credentials: 'include', // Crucial to send and receive cookies
      body: JSON.stringify({
        email: email,
        password: password,
        loginSave: false
      })
    });

    if (!loginRes.ok) {
      const errText = await loginRes.text();
      throw new Error(`드림핵 로그인 API가 실패했습니다 (${loginRes.status}): ${errText}`);
    }

    // Set-Cookie is automatically processed by the browser context, but let's wait a bit for cookie store update
    await new Promise(resolve => setTimeout(resolve, 500));

    const cookies = await chrome.cookies.getAll({ domain: 'dreamhack.io' });
    const sessionidCookie = cookies.find(c => c.name === 'sessionid');
    const newCsrftokenCookie = cookies.find(c => c.name === 'csrftoken');

    if (!sessionidCookie) {
      throw new Error("드림핵 로그인에는 성공했으나 sessionid 쿠키를 획득하지 못했습니다.");
    }

    const sessionid = sessionidCookie.value;
    const csrftoken = newCsrftokenCookie ? newCsrftokenCookie.value : '';

    // Synchronize session back to portal
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
    console.log('[INHACK Background] Cleaning up header modifications for Dreamhack login...');
    await removeHeadersRule();
  }
}
