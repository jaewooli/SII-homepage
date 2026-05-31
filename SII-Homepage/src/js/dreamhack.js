import { showToast } from "/assets/js/toast.js";
import { apiRequest } from "/assets/js/api.js";

async function isLoggedIn() {
  const r = await apiRequest('/me', 'GET');
  if (!r.ok) return null;
  
  return r.data;
}

function showLoginRequiredToast() {
  showToast('You need to Login first', 'error');
}

function checkExtensionInstalled() {
  return document.documentElement.dataset.siiExtensionInstalled === "true";
}

function updateExtensionStatus() {
  const statusBadge = document.getElementById('ext-status');
  if (!statusBadge) return;

  if (checkExtensionInstalled()) {
    statusBadge.className = 'status-badge status-connected';
    statusBadge.innerHTML = '<span class="status-dot"></span>Extension: Connected';
  } else {
    statusBadge.className = 'status-badge status-disconnected';
    statusBadge.innerHTML = '<span class="status-dot"></span>Extension: Not Detected';
  }
}

async function executeSpecificFeature(userdata) {
  const isExtensionInstalled = checkExtensionInstalled();
  if (!isExtensionInstalled) {
    showToast('Chrome Extension not detected. Please install it first.', 'error');
    return;
  }

  showToast('드림핵 세션 동기화 요청 중...', 'info');

  // Trigger cookie sync from Chrome Extension
  window.dispatchEvent(new CustomEvent('SII_DREAMHACK_SYNC_TRIGGER'));
}

document.addEventListener('DOMContentLoaded', () => {
  updateExtensionStatus();
  // Brief timeout check to avoid injection race conditions
  setTimeout(updateExtensionStatus, 300);

  const confirmbtn = document.getElementById('dreamhack-confirm');

  if (confirmbtn) {
    confirmbtn.addEventListener('click', async () => {
      const userdata = await isLoggedIn();
      if (userdata) {
        executeSpecificFeature(userdata);
      } else {
        showLoginRequiredToast();
      }
    });
  } else {
    console.warn("Cannot find the button with id 'dreamhack-confirm'.");
  }

  // Listen for sync response event from extension content script
  window.addEventListener('SII_DREAMHACK_SYNC_RESPONSE', async (event) => {
    const { ok, sessionid, csrftoken, message } = event.detail;
    if (ok) {
      if (!sessionid) {
        showToast('드림핵 로그인 세션이 발견되지 않았습니다. 드림핵(dreamhack.io)에 먼저 로그인해주세요.', 'error');
        return;
      }
      showToast('드림핵 세션 정보 획득 완료. 서버 연동 중...', 'info');

      try {
        const syncRes = await apiRequest('/dreamhack/login', 'POST', { sessionid, csrftoken });
        if (syncRes.ok) {
          showToast('드림핵 세션 동기화 성공!', 'success');
          setTimeout(() => {
            window.location.href = 'https://dreamhack.io';
          }, 1200);
        } else {
          showToast(`서버 연동 실패: ${syncRes.message || '서버 오류'}`, 'error');
        }
      } catch (err) {
        console.error(err);
        showToast('서버 통신 오류', 'error');
      }
    } else {
      if (message === 'HOMEPAGE_TAB_CLOSED') {
        showToast('연동 기능을 사용하려면 SII 홈페이지에서 DREAMHACK 기능을 이용해주세요.', 'error');
      } else {
        showToast(`쿠키 동기화 실패: ${message}`, 'error');
      }
    }
  });
});