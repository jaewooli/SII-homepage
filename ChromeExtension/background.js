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
    await chrome.declarativeNetRequest.updateDynamicRules({
      removeRuleIds: [1],
      addRules: rules
    });
    console.log('[SII Background] DeclarativeNetRequest dynamic rules registered.');
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

async function isHomepageTabOpen() {
  try {
    const tabs = await chrome.tabs.query({
      url: [
        "http://localhost:8080/*",
        "https://localhost:8080/*",
        "http://127.0.0.1:8080/*",
        "https://127.0.0.1:8080/*"
      ]
    });
    return tabs && tabs.length > 0;
  } catch (err) {
    console.error('[SII Background] Error querying tabs:', err);
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
      if ((url.hostname === 'localhost' || url.hostname === '127.0.0.1') && url.port === '8080') {
        return true;
      }
    } catch (e) {
      return false;
    }
  }
  return false;
}

async function registerDreamhackLoginRules(csrfToken) {
  const requestHeaders = [
    { header: "origin", operation: "set", value: "https://dreamhack.io" },
    { header: "referer", operation: "set", value: "https://dreamhack.io/login" }
  ];
  if (csrfToken) {
    requestHeaders.push({ header: "x-csrftoken", operation: "set", value: csrfToken });
  }

  const rules = [
    {
      id: 1,
      priority: 1,
      action: {
        type: "modifyHeaders",
        requestHeaders: requestHeaders
      },
      condition: {
        urlFilter: "https://dreamhack.io/api/v1/auth/login/",
        resourceTypes: ["xmlhttprequest", "other"]
      }
    }
  ];

  try {
    await chrome.declarativeNetRequest.updateDynamicRules({
      removeRuleIds: [1],
      addRules: rules
    });
    console.log('[SII Background] Active login rules updated with CSRF Token:', csrfToken);
  } catch (err) {
    console.error('[SII Background] Failed to update active login rules:', err);
  }
}

async function performDreamhackLogin(email, password) {
  console.log('[SII Background] Performing direct browser-context Dreamhack login...');
  
  // Get all cookies for dreamhack.io to cover subdomains and wildcards
  let cookies = [];
  try {
    cookies = await chrome.cookies.getAll({ domain: 'dreamhack.io' });
  } catch (err) {
    console.warn('[SII Background] Failed to query cookies:', err);
  }
  let csrfCookie = cookies.find(c => c.name === 'csrftoken');
  
  // If the cookie does not exist, fetch the login page to initialize cookies
  if (!csrfCookie) {
    console.log('[SII Background] No csrftoken cookie found. Initializing session via GET request...');
    try {
      await fetch('https://dreamhack.io/login', {
        method: 'GET',
        credentials: 'include'
      });
      cookies = await chrome.cookies.getAll({ domain: 'dreamhack.io' });
      csrfCookie = cookies.find(c => c.name === 'csrftoken');
    } catch (err) {
      console.warn('[SII Background] Failed to fetch login page to init CSRF token:', err);
    }
  }

  const csrfToken = csrfCookie ? csrfCookie.value : '';
  console.log('[SII Background] Retracted csrftoken:', csrfToken);

  // Register dynamic rules to inject X-CSRFToken and spoof headers at network layer
  await registerDreamhackLoginRules(csrfToken);

  try {
    // Send POST request without X-CSRFToken in JS headers to prevent Preflight OPTIONS request
    const response = await fetch('https://dreamhack.io/api/v1/auth/login/', {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'application/json, text/plain, */*',
        'Accept-Language': 'ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7'
        // Origin, Referer, and X-CSRFToken are injected at the network layer by declarativeNetRequest
      },
      body: JSON.stringify({ email, password, loginSave: false })
    });

    if (!response.ok) {
      let errData = '';
      try { errData = await response.text(); } catch(_) {}
      
      // Identify invalid credentials first (status 401 is always invalid credentials)
      if (response.status === 401 || (response.status === 400 && (errData.includes('이메일') || errData.includes('비밀번호') || errData.includes('password') || errData.includes('email') || errData.includes('login_failed') || errData.includes('credentials')))) {
        throw new Error("INVALID_CREDENTIALS");
      }
      
      // Strictly isolate real ReCAPTCHA requirements
      if (errData.toLowerCase().includes('recaptcha')) {
        throw new Error("RECAPTCHA_REQUIRED");
      }
      
      throw new Error(`Dreamhack status ${response.status}: ${errData}`);
    }
    
    console.log('[SII Background] Direct login succeeded. Cookies updated automatically.');
    return true;
  } finally {
    // Restore default Origin/Referer spoofing rules (without CSRF token value)
    await setupDNRRules();
  }
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!verifyMessageSender(sender)) {
    console.warn("[SII Security] Blocked message from untrusted sender:", sender.tab ? sender.tab.url : "unknown");
    return;
  }

  if (msg.type === "URL_REDIRECT") {
    chrome.tabs.create({ url: msg.url });
  } else if (msg.type === "CHECK_HOMEPAGE_TAB") {
    isHomepageTabOpen().then(isOpen => {
      sendResponse({ isOpen });
    });
    return true; // Keep message channel open for async response
  } else if (msg.type === "PERFORM_DREAMHACK_LOGIN") {
    isHomepageTabOpen().then(isOpen => {
      if (!isOpen) {
        sendResponse({ ok: false, message: "HOMEPAGE_TAB_CLOSED" });
        return;
      }
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
    });
    return true; // Keep message channel open for async response
  }
});
