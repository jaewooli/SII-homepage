const SERVER_BASE = 'http://localhost:3000'; // 실제 서버 주소로 변경

function showMsg(text, ok = true) {
  const m = document.getElementById('msg');
  m.textContent = text;
  m.style.color = ok ? 'green' : 'crimson';
}

// 공통 fetch 유틸 (쿠키 포함)
async function postJson(path, body) {
  const res = await fetch(SERVER_BASE + path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });

  // 서버가 JSON을 반환한다고 가정
  let payload = null;
  try { payload = await res.json(); } catch (e) { payload = null; }
z
  return { httpStatus: res.status, ok: res.ok, payload };
}

document.addEventListener('DOMContentLoaded', () => {
  const loginForm = document.getElementById('login-form');
  const signupForm = document.getElementById('signup-form');
  const dreamhackBtn = document.getElementById('dreamhack-btn');

  loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.getElementById('login-email').value.trim();
    const password = document.getElementById('login-password').value;

    showMsg('로그인 중...');

    try {
      const r = await postJson('/login', { email, password });
      if (r.ok) {
        showMsg(r.payload?.message ?? '로그인 성공');
        // 필요하면 storage에 사용자 정보 저장
        // chrome.storage.local.set({user: r.payload?.data});
      } else {
        showMsg(r.payload?.message ?? `로그인 실패 (${r.httpStatus})`, false);
      }
    } catch (err) {
      console.error(err);
      showMsg('네트워크 오류', false);
    }
  });

  signupForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.getElementById('signup-email').value.trim();
    const password = document.getElementById('signup-password').value;

    showMsg('회원가입 중...');

    try {
      const r = await postJson('/signup', { email, password });
      if (r.ok) {
        showMsg(r.payload?.message ?? '회원가입 성공');
      } else {
        showMsg(r.payload?.message ?? `회원가입 실패 (${r.httpStatus})`, false);
      }
    } catch (err) {
      console.error(err);
      showMsg('네트워크 오류', false);
    }
  });

  // Dreamhack 버튼: /dreamhack/login 으로 POST
  dreamhackBtn.addEventListener('click', async () => {
    // Dreamhack 로그인은 추가 필드가 필요하면 수정
    showMsg('Dreamhack 로그인 시도중...');
    try {
      const r = await postJson('/dreamhack/login', { /* 필요하면 body 추가 */ });
      if (r.ok) {
        showMsg(r.payload?.message ?? 'Dreamhack 로그인 성공');
      } else {
        showMsg(r.payload?.message ?? `Dreamhack 로그인 실패 (${r.httpStatus})`, false);
      }
    } catch (err) {
      console.error(err);
      showMsg('네트워크 오류', false);
    }
  });
});