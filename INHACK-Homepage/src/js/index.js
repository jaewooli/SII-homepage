import { showToast } from '/assets/js/toast.js';
import { fetchMe } from '/assets/js/auth.js';

const contentArea = document.getElementById('view');

async function loadContent(fragmentID){
  let url = '';
  if (fragmentID){
    url = `/frags/${fragmentID}.html`;
  }else{
    url = `/frags/home.html`;
  }
  try{
    const response = await fetch(url);
    if (!response.ok){
      throw new Error('Network response was not ok');
  }
  const htmlContent = await response.text();
  contentArea.innerHTML = htmlContent;
  }catch(err){
    console.error('Failed to load content:', err);
    contentArea.innerHTML = '<p>Failed to load content. Please try again later.</p>';
  }
}

function updateActiveNavLink(fragmentID) {
  const links = document.querySelectorAll('aside ul li a');
  links.forEach(link => {
    const hash = link.getAttribute('href');
    // If empty fragmentID, defaults to home/first link if it represents it
    if (hash === `#${fragmentID}` || (!fragmentID && hash === '#')) {
      link.classList.add('active');
    } else {
      link.classList.remove('active');
    }
  });
}

window.addEventListener('DOMContentLoaded', () => {
  const initialFragment = window.location.hash.substring(1);
  loadContent(initialFragment);
  updateActiveNavLink(initialFragment);
});

window.addEventListener('hashchange', () => {
  const fragmentID = window.location.hash.substring(1);
  loadContent(fragmentID);
  updateActiveNavLink(fragmentID);
});

function renderUserUI(user){
  let loginbtn = document.getElementById('login-btn');
  let supportbtn = document.getElementById('support-btn');
  let logoutbtn = document.getElementById('logout-btn');

  if (user) {
    if (loginbtn && supportbtn){
    loginbtn.hidden = true;
    supportbtn.hidden = true;
    }

    logoutbtn = document.createElement('button');
    logoutbtn.id = 'logout-btn';
    logoutbtn.textContent = 'Logout';
    document.querySelector('nav').appendChild(logoutbtn);

    logoutbtn.addEventListener('click', async() => {
      const res = await fetch('/logout', {
        method: 'POST',
      });

      if (res.ok) {
        location.href = '/';
      } else {
        showToast('Logout failed', 'error');
      }
    });
  }else{
    if (logoutbtn){
    logoutbtn.hidden = true;
    }
    loginbtn = document.createElement('button');
    loginbtn.id = 'login-btn';
    loginbtn.textContent = 'Login';
    document.querySelector('nav').appendChild(loginbtn);

    supportbtn = document.createElement('button');
    supportbtn.id = 'support-btn';
    supportbtn.textContent = 'Support';
    document.querySelector('nav').appendChild(supportbtn);

    loginbtn.addEventListener('click', () => {
      location.href = '/login';
    });

    supportbtn.addEventListener('click', () =>{
      window.location.href = 'mailto:jaeu1341@naver.com?subject=[INHACK Homepage] Support / Account Request';
    });
  }
}

function checkExtensionWithTimeout(callback, retries = 5) {
  if (document.documentElement.dataset.inhackExtensionInstalled === "true") {
    callback(true);
  } else if (retries > 0) {
    setTimeout(() => checkExtensionWithTimeout(callback, retries - 1), 100);
  } else {
    callback(false);
  }
}

async function triggerAdminAutoLogin() {
  checkExtensionWithTimeout(async (isInstalled) => {
    if (!isInstalled) {
      showToast('Chrome Extension이 감지되지 않아 드림핵 자동 로그인을 수행하지 못했습니다.', 'warning');
      return;
    }

    showToast('관리자로 로그인했습니다. 드림핵 자동 세션 갱신을 시작합니다...', 'info');

    try {
      const credRes = await fetch('/dreamhack/credentials');
      if (!credRes.ok) {
        throw new Error('드림핵 계정 정보를 가져오는데 실패했습니다.');
      }
      const credData = await credRes.json();
      if (!credData.ok || !credData.data || !credData.data.email || !credData.data.password) {
        throw new Error(credData.message || '올바르지 않은 계정 데이터 형식입니다.');
      }

      // Register listener for the response from extension
      const handleResponse = (event) => {
        const { ok, message } = event.detail;
        if (ok) {
          showToast('드림핵 공용 계정 자동 로그인 및 세션 동기화 완료!', 'success');
        } else {
          showToast(`드림핵 자동 로그인 실패: ${message || '알 수 없는 오류'}`, 'error');
        }
        window.removeEventListener('INHACK_ADMIN_AUTO_LOGIN_RESPONSE', handleResponse);
      };
      window.addEventListener('INHACK_ADMIN_AUTO_LOGIN_RESPONSE', handleResponse);

      // Dispatch the auto login trigger to extension
      window.dispatchEvent(new CustomEvent('INHACK_ADMIN_AUTO_LOGIN_TRIGGER', {
        detail: {
          email: credData.data.email,
          password: credData.data.password
        }
      }));
    } catch (err) {
      console.error('[Admin Auto Login] Error:', err);
      showToast(`드림핵 자동 로그인 및 연동 실패: ${err.message}`, 'error');
    }
  });
}

document.addEventListener('DOMContentLoaded', async() => {
  const me = await fetchMe();
  renderUserUI(me);

  if (me && me.username === 'developer' && sessionStorage.getItem('adminJustLoggedIn') === 'true') {
    sessionStorage.removeItem('adminJustLoggedIn');
    triggerAdminAutoLogin();
  }

  const message = sessionStorage.getItem('toastMessage');
  const type = sessionStorage.getItem('toastType');

  if (message) {
    sessionStorage.removeItem('toastMessage');
    sessionStorage.removeItem('toastType');
    showToast(message, type || 'info');
  }
});