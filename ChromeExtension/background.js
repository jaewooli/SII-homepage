// Register declarativeNetRequest rules on startup/install to spoof Origin/Referer headers
async function setupDNRRules() {
  const rules = [
    {
      id: 1,
      priority: 1,
      action: {
        type: "modifyHeaders",
        requestHeaders: [
          { header: "origin", operation: "set", value: "https://dreamhack.io" },
          { header: "referer", operation: "set", value: "https://dreamhack.io/login" }
        ]
      },
      condition: {
        urlFilter: "https://dreamhack.io/api/v1/auth/login/",
        resourceTypes: ["xmlhttprequest", "other"]
      }
    }
  ];
  try {
    await chrome.declarativeNetRequest.updateSessionRules({
      removeRuleIds: [1],
      addRules: rules
    });
    console.log('[SII Background] DeclarativeNetRequest session rules registered.');
  } catch (err) {
    console.error('[SII Background] Failed to register DNR rules:', err);
  }
}

// Call on worker load
setupDNRRules();

chrome.runtime.onInstalled.addListener(() => {
  setupDNRRules();
});

chrome.runtime.onStartup.addListener(() => {
  setupDNRRules();
});

function verifyMessageSender(sender) {
  // Allow messages from the extension popup itself
  if (!sender.tab) {
    return true;
  }
  if (sender.tab && sender.tab.url) {
    try {
      const url = new URL(sender.tab.url);
      if ((url.hostname === 'localhost' || url.hostname === '127.0.0.1') && url.port === '8080') {
        return true;
      }
    } catch (e) {
      return false;
    }
  }
  return false;
}

async function performDreamhackLogin(email, password) {
  console.log('[SII Background] Performing direct browser-context Dreamhack login...');
  const response = await fetch('https://dreamhack.io/api/v1/auth/login/', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Origin': 'https://dreamhack.io',
      'Referer': 'https://dreamhack.io/login',
      'Accept': 'application/json, text/plain, */*',
      'Accept-Language': 'ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7'
    },
    body: JSON.stringify({ email, password, loginSave: false })
  });

  if (!response.ok) {
    let errData = '';
    try { errData = await response.text(); } catch(_) {}
    
    // Check if body content mentions recaptcha or if status is 403 / 429
    if (errData.toLowerCase().includes('recaptcha') || response.status === 403 || response.status === 429) {
      throw new Error("RECAPTCHA_REQUIRED");
    }
    
    throw new Error(`Dreamhack status ${response.status}: ${errData}`);
  }
  
  console.log('[SII Background] Direct login succeeded. Cookies updated automatically.');
  return true;
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!verifyMessageSender(sender)) {
    console.warn("[SII Security] Blocked message from untrusted sender:", sender.tab ? sender.tab.url : "unknown");
    return;
  }

  if (msg.type === "SET_COOKIE") {
    setCookie(msg.cookie, msg.isValue);
  } else if (msg.type === "URL_REDIRECT") {
    chrome.tabs.create({ url: msg.url });
  } else if (msg.type === "PERFORM_DREAMHACK_LOGIN") {
    performDreamhackLogin(msg.email, msg.password)
      .then(() => {
        sendResponse({ ok: true });
        // Redirect to dreamhack after successful cookie injection
        setTimeout(() => {
          chrome.tabs.create({ url: 'https://dreamhack.io' });
        }, 800);
      })
      .catch(err => {
        console.error('[SII Background] Dreamhack login failed:', err);
        sendResponse({ ok: false, message: err.message });
      });
    return true; // Keep message channel open for async response
  } else if (msg.type === "GET_COOKIE") {
    chrome.cookies.getAll({ domain: 'localhost' }).then(cookies => {
      sendResponse(cookies);
    });
    return true; // Keep the message channel open for async response
  } else if (msg.type === "DREAMHACK_SOLVE_DETECTED") {
    // 1. Fetch current SII Homepage session context
    fetch('http://localhost:8080/me')
      .then(res => res.json())
      .then(userData => {
        if (userData && userData.ok && userData.data) {
          const username = userData.data.username;
          // 2. Submit wargame solve log to server database
          fetch('http://localhost:8080/dreamhack/solve-log', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              username: username,
              challengeId: msg.challengeId,
              challengeName: msg.challengeName,
              timestamp: new Date().toISOString()
            })
          })
          .then(res => res.json())
          .then(logData => {
            console.log('[SII Background] Solve logged on server:', logData);
          })
          .catch(err => {
            console.error('[SII Background] Failed to submit solve log:', err);
          });
        } else {
          console.warn('[SII Background] Solve detected but user is not logged in to SII Homepage');
        }
      })
      .catch(err => {
        console.error('[SII Background] Failed to query current SII session:', err);
      });
  }
});

async function setCookie(raw, isValue) {
  if (isValue)
    {
       await chrome.cookies.set({ url: 'http://localhost:8080/', name: 'sessionid', value: raw,  path: '/', secure: false});
    }
    else{
  const realcookie = parseCookieString(raw, 'https://dreamhack.io/');
  await chrome.cookies.set(realcookie);
    }
}

function parseCookieString(raw, baseUrl) {
  const parts = raw.split(';').map(p => p.trim());
  const [name, value] = parts[0].split('=');

  const cookie = {
    url: baseUrl, 
    name: name,
    value: value,
    path: "/",
  };

  for (const p of parts.slice(1)) {
    if (/^domain=/i.test(p)) cookie.domain = p.split('=')[1];
    else if (/^path=/i.test(p)) cookie.path = p.split('=')[1];
    else if (/^expires=/i.test(p))
      cookie.expirationDate = Math.floor(new Date(p.split('=')[1]).getTime() / 1000);
    else if (/secure/i.test(p)) cookie.secure = true;
    else if (/httponly/i.test(p)) cookie.httpOnly = true;
    else if (/samesite/i.test(p)) {
      const val = p.split('=')[1]?.toLowerCase();
      if (val === 'none') cookie.sameSite = 'no_restriction';
      else if (val === 'lax') cookie.sameSite = 'lax';
      else if (val === 'strict') cookie.sameSite = 'strict';
    }
  }

  return cookie;
}

function toChromeCookie(setCookieStr, baseUrl) {
  const parts = setCookieStr.split(';').map(s => s.trim());
  const [nv, ...attrs] = parts;
  const [name, ...vparts] = nv.split('=');
  const value = vparts.join('=');

  const c = { url: baseUrl, name, value, path: "/" };

  for (const a of attrs) {
    const [k, ...v] = a.split('=');
    const key = k.toLowerCase();
    const val = v.join('=');

    if (key === 'domain') c.domain = val;
    else if (key === 'path') c.path = val;
    else if (key === 'secure') c.secure = true;
    else if (key === 'httponly') c.httpOnly = true;
    else if (key === 'expires') c.expirationDate = Math.floor(new Date(val).getTime()/1000);
    else if (key === 'samesite') {
      const s = val?.toLowerCase();
      c.sameSite = s === 'none' ? 'no_restriction' : (s === 'lax' ? 'lax' : 'strict');
    }
  }
  return c;
}
