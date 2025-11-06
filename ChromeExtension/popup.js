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

function reloadsection(selector){
  const section = document.querySelector(selector);
  if (!section) return;

  const original = section.outerHTML;
  section.outerHTML = original;
}

document.addEventListener('DOMContentLoaded', async () => {
  const userinfo = await chrome.storage.local.get();
  try{
  if (userinfo.SIIuser){ //dfgsdfg

    
     const r = await fetch(SERVER_BASE + '/me', {
      method: 'GET'
     })

    if(r.ok){
      const loginsection = document.getElementById('login');
      loginsection.hidden=true;

      const usernamep = document.getElementById('username');
      usernamep.textContent = userinfo.SIIuser.username;
      return;
    }
  }
    
    const loggedinsection = document.getElementById('loggedin');
    loggedinsection.hidden=true;
  
  } catch (err){
    console.log(err);
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

        const sessionid =r.payload.sessionid
        chrome.runtime.sendMessage({ type: "SET_COOKIE", cookie: sessionid, isValue:true });
        console.log(await chrome.runtime.sendMessage({ type: "GET_COOKIE" }));
        //location.reload();
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
        reloadsection('#signup-form');
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
    showMsg('Dreamhack 로그인 시도중...');
    try {
      const r = await postJson('/dreamhack/login',{'sessionid': sessionid});
      if (r.ok) {
        showMsg(r.payload?.message ?? 'Dreamhack 로그인 성공');
        const data = r.payload.data;

        const csrf_token = data.csrf_token;
        const sessionid = data.sessionid;

        chrome.runtime.sendMessage({ type: "SET_COOKIE", cookie: csrf_token });
        chrome.runtime.sendMessage({ type: "SET_COOKIE", cookie: sessionid });
        chrome.runtime.sendMessage({type:"URL_REDIRECT", url: 'https://dreamhack.io'});
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
      location.reload();
    }catch(err){
      console.error(err);
      showMsg('로그아웃 실패', false);
    }
  })
})

