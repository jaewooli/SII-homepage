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
