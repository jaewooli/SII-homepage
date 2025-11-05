const SERVER_BASE = 'http://localhost:8080'; // 실제 서버 주소로 변경

//SIIuser 추후 수정 시 고려

function showMsg(text, ok = true) {
  const m = Array.from(document.getElementsByClassName('msg'))
  .filter(el => !el.hidden && el.offsetParent !== null);
  m[0].textContent = text;
  m[0].style.color = ok ? 'green' : 'crimson';
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

  return { httpStatus: res.status, ok: res.ok, payload };
}

function domreload(){
  location.reload()
}

document.addEventListener('DOMContentLoaded', async () => {
  const userinfo = await chrome.storage.local.get();
  
  if (userinfo.SIIuser){

    //try{
      // const r = await postJson('/me')
   // }

    const loginsection = document.getElementById('login');
    loginsection.hidden=true;

    const usernamep = document.getElementById('username');
    usernamep.textContent = userinfo.SIIuser.username;

  }else{
    const loggedinsection = document.getElementById('loggedin');
    loggedinsection.hidden=true;
  }
});

document.addEventListener('DOMContentLoaded', () => {
  const loginForm = document.getElementById('login-form');
  const signupForm = document.getElementById('signup-form');
  const dreamhackBtn = document.getElementById('dreamhack-btn');
  const signoutBtn = document.getElementById('signout-btn');

  loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const username = document.getElementById('login-username').value.trim();
    const password = document.getElementById('login-password').value;

    showMsg('로그인 중...');

    try {
      const r = await postJson('/login',{username, password });
      if (r.ok) {
        showMsg(r.payload?.message ?? '로그인 성공');
        console.log(r.headers);
        chrome.storage.local.set({SIIuser: {username, password}});
        domreload();
      } else {
        showMsg(r.payload?.message ?? `로그인 실패 (${r.httpStatus})`, false);
      }
    } catch (err) {
      console.log(err);
      showMsg("네트워크 오류", false);
    }
  });

  signupForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const username = document.getElementById('signup-username').value.trim();
    const password = document.getElementById('signup-password').value;
    const name = document.getElementById('signup-name').value.trim()

    showMsg('회원가입 중...');

    try {
      const r = await postJson('/signup', { username, password, name });
      if (r.ok) {
        showMsg(r.payload?.message ?? '회원가입 성공');
        domreload();
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
    const userinfo = await chrome.storage.local.get('SIIuser');
    const username = userinfo['SIIuser']
    showMsg('Dreamhack 로그인 시도중...');
    try {
      const r = await postJson('/dreamhack/login',{'userinfo': username},  { /* 필요하면 body 추가 */ });
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

  signoutBtn.addEventListener('click', async() => {
    showMsg('로그아웃 합니다.');
    try{
      await chrome.storage.local.remove('SIIuser')
      domreload();
    }catch(err){
      console.error(err);
      showMsg('로그아웃 실패', false);
    }
  })
})