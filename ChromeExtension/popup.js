let SERVER_BASE = 'http://localhost:8080';

async function detectServerBase() {
  try {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tabs && tabs.length > 0 && tabs[0].url) {
      const url = new URL(tabs[0].url);
      const allowedHosts = ['localhost', '127.0.0.1', 'ddyoru.duckdns.org'];
      if (allowedHosts.includes(url.hostname)) {
        SERVER_BASE = url.origin;
        console.log('[INHACK Extension] Detected Server Base:', SERVER_BASE);
      }
    }
  } catch (err) {
    console.error('[INHACK Extension] Failed to query active tab for server base:', err);
  }
}

function showMsg(text, ok = true) {
  const messages = document.querySelectorAll('.msg');
  messages.forEach(m => {
    if (m.offsetParent !== null) { // only update the visible one
      m.textContent = text;
      m.style.color = ok ? '#00f0ff' : '#ff3366';
      m.style.textShadow = ok ? '0 0 8px rgba(0, 240, 255, 0.3)' : '0 0 8px rgba(255, 51, 102, 0.3)';
    }
  });
}

// Common POST utility
async function postJson(path, body) {
  await detectServerBase();
  const res = await fetch(SERVER_BASE + path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });

  let payload = null;
  try { 
    payload = await res.json(); 
  } catch (e) { 
    payload = null; 
  }

  return { httpStatus: res.status, ok: res.ok, payload };
}

document.addEventListener('DOMContentLoaded', async () => {
  await detectServerBase();
  // Session check on load
  try {
    const r = await fetch(SERVER_BASE + '/me', {
      method: 'GET',
      credentials: 'include'
    });

    let payload = null;
    try { payload = await r.json(); } catch (_) {}

    if (r.ok && payload && payload.ok && payload.data) {
      chrome.runtime.sendMessage({ type: "CHECK_HOMEPAGE_TAB" }, async (response) => {
        if (response && response.isOpen) {
          document.getElementById('login').classList.add('hidden');
          document.getElementById('loggedin').classList.remove('hidden');
          document.getElementById('tab-closed-warning').classList.add('hidden');
          document.getElementById('username').textContent = payload.data.username;
          await chrome.storage.local.set({ INHACKuser: { username: payload.data.username } });
        } else {
          document.getElementById('login').classList.add('hidden');
          document.getElementById('loggedin').classList.add('hidden');
          document.getElementById('tab-closed-warning').classList.remove('hidden');
        }
      });
      return;
    }
    
    // No active session
    document.getElementById('login').classList.remove('hidden');
    document.getElementById('loggedin').classList.add('hidden');
    await chrome.storage.local.remove('INHACKuser');
  } catch (err) {
    console.error(err);
    showMsg('세션 조회 오류', false);
  }
});

document.addEventListener('DOMContentLoaded', () => {
  const openHomepageBtn = document.getElementById('open-homepage-btn');
  const dreamhackBtn = document.getElementById('dreamhack-btn');
  const signoutBtn = document.getElementById('signout-btn');
  const supportLink = document.getElementById('support-link');

  // Support link redirection
  if (supportLink) {
    supportLink.addEventListener('click', (e) => {
      e.preventDefault();
      chrome.runtime.sendMessage({ 
        type: "URL_REDIRECT", 
        url: 'mailto:jaeu1341@naver.com?subject=[INHACK Chrome Extension] Support / Account Request' 
      });
    });
  }

  // Open Homepage Button redirect
  if (openHomepageBtn) {
    openHomepageBtn.addEventListener('click', () => {
      chrome.runtime.sendMessage({
        type: "URL_REDIRECT",
        url: SERVER_BASE + '/homepage/login'
      });
    });
  }

  // Open Homepage Tab button redirect (from warning page)
  const openHomepageTabBtn = document.getElementById('open-homepage-tab-btn');
  if (openHomepageTabBtn) {
    openHomepageTabBtn.addEventListener('click', () => {
      chrome.runtime.sendMessage({
        type: "URL_REDIRECT",
        url: SERVER_BASE + '/homepage/main'
      });
    });
  }

  // Dreamhack Button integration
  dreamhackBtn.addEventListener('click', () => {
    chrome.runtime.sendMessage({
      type: "URL_REDIRECT",
      url: SERVER_BASE + '/homepage/dreamhack'
    });
  });

  // Sign out Submit
  signoutBtn.addEventListener('click', async () => {
    showMsg('로그아웃 합니다...');
    try {
      // Clear express session first
      await fetch(SERVER_BASE + '/logout', { method: 'POST' });
      await chrome.storage.local.remove('INHACKuser');
      setTimeout(() => location.reload(), 800);
    } catch (err) {
      console.error(err);
      showMsg('로그아웃 실패', false);
    }
  });
});
