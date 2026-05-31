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
