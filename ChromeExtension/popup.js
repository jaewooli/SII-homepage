let SERVER_BASE = typeof PORTAL_URL !== 'undefined' ? PORTAL_URL : 'http://localhost:8080/homepage';

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

async function detectServerBase() {
  const fallback = typeof PORTAL_URL !== 'undefined' ? PORTAL_URL : 'http://localhost:8080/homepage';
  try {
    const storageData = await chrome.storage.local.get('portalOrigin');
    if (storageData && storageData.portalOrigin && isValidPortalOrigin(storageData.portalOrigin)) {
      SERVER_BASE = storageData.portalOrigin;
    } else {
      SERVER_BASE = fallback;
      await chrome.storage.local.remove('portalOrigin');
    }

    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tabs && tabs.length > 0 && tabs[0].url) {
      const portalBase = extractPortalBase(tabs[0].url);
      if (isValidPortalOrigin(portalBase)) {
        SERVER_BASE = portalBase;
        await chrome.storage.local.set({ 'portalOrigin': SERVER_BASE });
      }
    }
  } catch (err) {
    // Silent fail
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
          await chrome.storage.local.set({ INHACKuser: { username: payload.data.username, isAdmin: payload.data.isAdmin || false } });
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
        url: SERVER_BASE + '/login'
      });
    });
  }

  // Open Homepage Tab button redirect (from warning page)
  const openHomepageTabBtn = document.getElementById('open-homepage-tab-btn');
  if (openHomepageTabBtn) {
    openHomepageTabBtn.addEventListener('click', () => {
      chrome.runtime.sendMessage({
        type: "URL_REDIRECT",
        url: SERVER_BASE + '/'
      });
    });
  }

  // Dreamhack Button integration
  dreamhackBtn.addEventListener('click', () => {
    chrome.runtime.sendMessage({
      type: "URL_REDIRECT",
      url: SERVER_BASE + '/dreamhack'
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
      showMsg('로그아웃 실패', false);
    }
  });
});
