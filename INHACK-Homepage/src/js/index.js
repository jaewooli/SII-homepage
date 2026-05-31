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

async function triggerAdminSessionRenewal() {
  showToast('드림핵 공용 계정 세션 재발급 및 갱신 중... (약 10초 소요)', 'info');

  try {
    const res = await fetch('/dreamhack/regenerate', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      }
    });

    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      throw new Error(errData.message || '서버 재발급 요청에 실패했습니다.');
    }

    const resData = await res.json();
    if (resData.ok) {
      showToast('드림핵 공용 계정 세션 재발급 및 서버 갱신 완료!', 'success');
      // If we are on the dreamhack page, reload to refresh logs and status
      const dhStatusUpdate = document.getElementById('session-status');
      if (dhStatusUpdate) {
        window.location.reload();
      }
    } else {
      throw new Error(resData.message || '세션 재발급 도중 오류가 발생했습니다.');
    }
  } catch (err) {
    console.error('[Admin Session Renewal] Error:', err);
    showToast(`드림핵 세션 재발급 실패: ${err.message}`, 'error');
  }
}

async function triggerAdminSessionTermination() {
  const isExtensionInstalled = document.documentElement.dataset.inhackExtensionInstalled === "true";
  if (!isExtensionInstalled) {
    showToast('Chrome Extension이 감지되지 않아 공용 세션을 로그아웃하지 못했습니다.', 'error');
    return;
  }

  showToast('드림핵 공용 계정 세션 파기 및 로그아웃 요청 중...', 'info');

  try {
    const sharedRes = await fetch('/dreamhack/shared-session');
    if (!sharedRes.ok) {
      throw new Error('서버에서 공용 세션 정보를 가져오는데 실패했습니다.');
    }
    const sharedData = await sharedRes.json();
    if (!sharedData.ok || !sharedData.data || !sharedData.data.sessionid) {
      await fetch('/dreamhack/clear-shared-session', { method: 'POST' });
      showToast('이미 등록된 공용 세션이 없습니다. 서버 데이터를 초기화했습니다.', 'success');
      return;
    }

    const handleResponse = async (event) => {
      const { ok, message } = event.detail;
      if (ok) {
        const clearRes = await fetch('/dreamhack/clear-shared-session', { method: 'POST' });
        if (clearRes.ok) {
          showToast('드림핵 공용 계정 세션 파기 및 일괄 로그아웃 완료!', 'success');
        } else {
          showToast('드림핵 세션은 파기되었으나 서버 데이터 초기화에 실패했습니다.', 'warning');
        }
      } else {
        showToast(`드림핵 세션 파기 실패: ${message || '알 수 없는 오류'}`, 'error');
      }
      window.removeEventListener('INHACK_ADMIN_LOGOUT_SHARED_RESPONSE', handleResponse);
    };
    window.addEventListener('INHACK_ADMIN_LOGOUT_SHARED_RESPONSE', handleResponse);

    window.dispatchEvent(new CustomEvent('INHACK_ADMIN_LOGOUT_SHARED_TRIGGER', {
      detail: {
        sessionid: sharedData.data.sessionid,
        csrftoken: sharedData.data.csrftoken || ''
      }
    }));
  } catch (err) {
    console.error('[Admin Session Logout] Error:', err);
    showToast(`드림핵 공용 세션 로그아웃 실패: ${err.message}`, 'error');
  }
}

function renderUserUI(user){
  let loginbtn = document.getElementById('login-btn');
  let supportbtn = document.getElementById('support-btn');
  let logoutbtn = document.getElementById('logout-btn');

  if (user) {
    if (loginbtn && supportbtn){
    loginbtn.hidden = true;
    supportbtn.hidden = true;
    }

    if (user.isAdmin) {
      const renewbtn = document.createElement('button');
      renewbtn.id = 'renew-btn';
      renewbtn.textContent = 'Renew Session';
      renewbtn.addEventListener('click', async () => {
        await triggerAdminSessionRenewal();
      });
      document.querySelector('nav').appendChild(renewbtn);

      const logoutSharedBtn = document.createElement('button');
      logoutSharedBtn.id = 'logout-shared-btn';
      logoutSharedBtn.textContent = 'Logout Shared';
      logoutSharedBtn.addEventListener('click', async () => {
        if (confirm('정말로 공용 드림핵 세션을 서버 및 드림핵 서비스에서 로그아웃하여 모든 사용자의 연동을 끊으시겠습니까?')) {
          await triggerAdminSessionTermination();
        }
      });
      document.querySelector('nav').appendChild(logoutSharedBtn);
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

document.addEventListener('DOMContentLoaded', async() => {
  const me = await fetchMe();
  renderUserUI(me);

  const message = sessionStorage.getItem('toastMessage');
  const type = sessionStorage.getItem('toastType');

  if (message) {
    sessionStorage.removeItem('toastMessage');
    sessionStorage.removeItem('toastType');
    showToast(message, type || 'info');
  }
});