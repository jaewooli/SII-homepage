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
  } else if (msg.type === "GET_DREAMHACK_COOKIES") {
    (async () => {
      try {
        const { email, password } = msg;
        if (!email || !password) {
          throw new Error('Dreamhack credentials not provided by webpage');
        }

        // 2. Perform login request to dreamhack.io from browser
        console.log('[INHACK Background] Logging in to Dreamhack on behalf of user...');
        const loginRes = await fetch('https://dreamhack.io/api/v1/auth/login/', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json'
          },
          body: JSON.stringify({ email, password, loginSave: false })
        });

        if (!loginRes.ok) {
          const errText = await loginRes.text();
          console.error('[INHACK Background] Dreamhack login failed response:', errText);
          throw new Error('Dreamhack authentication failed');
        }

        // 3. Extract cookies (the browser automatically stores cookies from the fetch response)
        const cookies = await chrome.cookies.getAll({ domain: 'dreamhack.io' });
        const sessionidCookie = cookies.find(c => c.name === 'sessionid');
        const csrftokenCookie = cookies.find(c => c.name === 'csrftoken');

        const sessionid = sessionidCookie ? sessionidCookie.value : '';
        const csrftoken = csrftokenCookie ? csrftokenCookie.value : '';

        if (!sessionid) {
          throw new Error('Dreamhack session cookie was not set after login');
        }

        console.log('[INHACK Background] Cookie sync successful.');
        sendResponse({ ok: true, sessionid, csrftoken });
      } catch (err) {
        console.error('[INHACK Background] Sync failed:', err.message);
        sendResponse({ ok: false, message: err.message });
      }
    })();
    return true; // Keep message channel open for async response
  }
});
