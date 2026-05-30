const SERVER_BASE = 'http://localhost:8080';

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
  // Session check on load
  try {
    const userinfo = await chrome.storage.local.get('SIIuser');
    if (userinfo.SIIuser) {
      const r = await fetch(SERVER_BASE + '/me', {
        method: 'GET',
        credentials: 'include'
      });

      if (r.ok) {
        document.getElementById('login').classList.add('hidden');
        document.getElementById('loggedin').classList.remove('hidden');
        document.getElementById('username').textContent = userinfo.SIIuser.username;
        return;
      }
    }
    
    document.getElementById('login').classList.remove('hidden');
    document.getElementById('loggedin').classList.add('hidden');
  } catch (err) {
    console.error(err);
    showMsg('세션 조회 오류', false);
  }
});

document.addEventListener('DOMContentLoaded', () => {
  const loginForm = document.getElementById('login-form');
  const dreamhackBtn = document.getElementById('dreamhack-btn');
  const signoutBtn = document.getElementById('signout-btn');
  const supportLink = document.getElementById('support-link');

  // Support link redirection
  if (supportLink) {
    supportLink.addEventListener('click', (e) => {
      e.preventDefault();
      chrome.runtime.sendMessage({ 
        type: "URL_REDIRECT", 
        url: 'mailto:jaeu1341@naver.com?subject=[SII Chrome Extension] Support / Account Request' 
      });
    });
  }

  // Login Submit
  loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const username = document.getElementById('login-username').value.trim();
    const password = document.getElementById('login-password').value;

    showMsg('로그인 중...');

    try {
      const r = await postJson('/login', { username, password });
      if (r.ok) {
        showMsg(r.payload?.message ?? '로그인 성공');
        await chrome.storage.local.set({ SIIuser: { username } });
        setTimeout(() => location.reload(), 800);
      } else {
        showMsg(r.payload?.message ?? `로그인 실패 (${r.httpStatus})`, false);
      }
    } catch (err) {
      console.error(err);
      showMsg("네트워크 오류", false);
    }
  });

  // Dreamhack Button integration
  dreamhackBtn.addEventListener('click', async () => {
    showMsg('Dreamhack 로그인 시도중...');
    try {
      const r = await postJson('/dreamhack/login');
      if (r.ok) {
        showMsg('Dreamhack 로그인 성공! 연동 중...');
        const data = r.payload.data;

        const csrf_token = data.csrf_token;
        const sessionid = data.sessionid;

        // Set cookies via chrome.runtime
        chrome.runtime.sendMessage({ type: "SET_COOKIE", cookie: csrf_token });
        chrome.runtime.sendMessage({ type: "SET_COOKIE", cookie: sessionid });
        
        setTimeout(() => {
          chrome.runtime.sendMessage({ type: "URL_REDIRECT", url: 'https://dreamhack.io' });
        }, 1000);
      } else {
        showMsg(r.payload?.message ?? `Dreamhack 로그인 실패 (${r.httpStatus})`, false);
      }
    } catch (err) {
      console.error(err);
      showMsg('네트워크 오류', false);
    }
  });

  // Sign out Submit
  signoutBtn.addEventListener('click', async () => {
    showMsg('로그아웃 합니다...');
    try {
      // Clear express session first
      await fetch(SERVER_BASE + '/logout', { method: 'POST' });
      await chrome.storage.local.remove('SIIuser');
      setTimeout(() => location.reload(), 800);
    } catch (err) {
      console.error(err);
      showMsg('로그아웃 실패', false);
    }
  });
});
