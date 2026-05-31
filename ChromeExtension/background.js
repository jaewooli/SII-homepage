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
      if ((url.hostname === 'localhost' || url.hostname === '127.0.0.1') && url.port === '8080') {
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
    isHomepageTabOpen().then(isOpen => {
      if (!isOpen) {
        sendResponse({ ok: false, message: "HOMEPAGE_TAB_CLOSED" });
        return;
      }

      chrome.cookies.getAll({}).then(cookies => {
        const dreamhackCookies = cookies.filter(c => c.domain && c.domain.includes('dreamhack.io'));
        const sessionidCookie = dreamhackCookies.find(c => c.name === 'sessionid');
        const csrftokenCookie = dreamhackCookies.find(c => c.name === 'csrftoken');

        const sessionid = sessionidCookie ? sessionidCookie.value : '';
        const csrftoken = csrftokenCookie ? csrftokenCookie.value : '';

        console.log('[INHACK Background] Retracted Dreamhack sessionid:', sessionid ? 'FOUND' : 'MISSING');
        sendResponse({ ok: true, sessionid, csrftoken });
      }).catch(err => {
        console.error('[INHACK Background] Failed to query cookies:', err);
        sendResponse({ ok: false, message: err.message });
      });
    });
    return true; // Keep message channel open for async response
  }
});
