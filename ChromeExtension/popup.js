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
    const r = await fetch(SERVER_BASE + '/me', {
      method: 'GET',
      credentials: 'include'
    });

    let payload = null;
    try { payload = await r.json(); } catch (_) {}

    if (r.ok && payload && payload.ok && payload.data) {
      document.getElementById('login').classList.add('hidden');
      document.getElementById('loggedin').classList.remove('hidden');
      document.getElementById('username').textContent = payload.data.username;
      
      // Keep local storage synced for consistency
      await chrome.storage.local.set({ SIIuser: { username: payload.data.username } });
      return;
    }
    
    // No active session
    document.getElementById('login').classList.remove('hidden');
    document.getElementById('loggedin').classList.add('hidden');
    await chrome.storage.local.remove('SIIuser');
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
    showMsg('인증 정보 조회 중...');
    try {
      const credRes = await fetch(SERVER_BASE + '/dreamhack/credentials', {
        method: 'GET',
        credentials: 'include'
      });
      
      if (!credRes.ok) {
        showMsg('홈페이지 세션이 만료되었습니다. 다시 로그인해주세요.', false);
        return;
      }
      
      const payload = await credRes.json();
      if (payload && payload.ok && payload.data) {
        const { email, password } = payload.data;
        showMsg('Dreamhack 로그인 시도 중 (브라우저)...');
        
        chrome.runtime.sendMessage({ 
          type: "PERFORM_DREAMHACK_LOGIN", 
          email, 
          password 
        }, (response) => {
          if (response && response.ok) {
            showMsg('Dreamhack 연동 완료! 리다이렉트 중...');
          } else {
            const cleanErr = response?.message ? (response.message.includes('401') ? '아이디/비밀번호 오류 또는 캡차 필요' : response.message) : '오류 발생';
            showMsg('연동 실패: ' + cleanErr, false);
          }
        });
      } else {
        showMsg('인증 정보가 비어있습니다.', false);
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
