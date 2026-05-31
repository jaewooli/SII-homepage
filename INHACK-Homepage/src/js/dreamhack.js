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
  return document.documentElement.dataset.inhackExtensionInstalled === "true";
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
  window.dispatchEvent(new CustomEvent('INHACK_DREAMHACK_SYNC_TRIGGER'));
}

async function loadActivityLogs() {
  try {
    const res = await apiRequest('/dreamhack/logs', 'GET');
    if (res.ok && res.data) {
      const { accessLogs, solveLogs } = res.data;
      
      // Render access logs
      const accessBody = document.querySelector('#access-log-table tbody');
      if (accessBody) {
        if (accessLogs && accessLogs.length > 0) {
          accessBody.innerHTML = accessLogs.map(log => {
            const timeStr = new Date(log.timestamp).toLocaleString();
            return `
              <tr>
                <td>${escapeHtml(log.username)}</td>
                <td>${escapeHtml(log.ip_address)}</td>
                <td>${timeStr}</td>
              </tr>
            `;
          }).join('');
        } else {
          accessBody.innerHTML = `<tr><td colspan="3" class="log-empty">No sync attempts logged yet.</td></tr>`;
        }
      }

      // Render solve logs
      const solveBody = document.querySelector('#solve-log-table tbody');
      if (solveBody) {
        if (solveLogs && solveLogs.length > 0) {
          solveBody.innerHTML = solveLogs.map(log => {
            const timeStr = new Date(log.timestamp).toLocaleString();
            return `
              <tr>
                <td>${escapeHtml(log.username)}</td>
                <td>${escapeHtml(log.challenge_name || log.challenge_id)}</td>
                <td>${timeStr}</td>
              </tr>
            `;
          }).join('');
        } else {
          solveBody.innerHTML = `<tr><td colspan="3" class="log-empty">No solved challenges logged yet.</td></tr>`;
        }
      }
    }
  } catch (err) {
    console.error('Failed to load activity logs:', err);
  }
}

function escapeHtml(str) {
  if (!str) return '';
  return str.replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
}

async function executeRenewSharedSession(userdata) {
  const isExtensionInstalled = checkExtensionInstalled();
  if (!isExtensionInstalled) {
    showToast('Chrome Extension not detected. Please install it first.', 'error');
    return;
  }

  showToast('드림핵 공용 계정 세션 재발급 요청 중...', 'info');

  try {
    const credRes = await apiRequest('/dreamhack/credentials', 'GET');
    if (!credRes.ok) {
      throw new Error('드림핵 계정 정보를 가져오는데 실패했습니다.');
    }
    const credData = credRes.data;
    if (!credData || !credData.email || !credData.password) {
      throw new Error('올바르지 않은 계정 데이터 형식입니다.');
    }

    // Dispatch the auto login trigger to extension
    window.dispatchEvent(new CustomEvent('INHACK_ADMIN_AUTO_LOGIN_TRIGGER', {
      detail: {
        email: credData.email,
        password: credData.password
      }
    }));
  } catch (err) {
    console.error('[Admin Session Renewal] Error:', err);
    showToast(`드림핵 세션 재발급 실패: ${err.message}`, 'error');
  }
}

async function executeLoadSharedSession(userdata) {
  const isExtensionInstalled = checkExtensionInstalled();
  if (!isExtensionInstalled) {
    showToast('Chrome Extension not detected. Please install it first.', 'error');
    return;
  }

  showToast('서버에서 공용 세션 정보 가져오는 중...', 'info');
  // Dispatch load trigger event to extension
  window.dispatchEvent(new CustomEvent('INHACK_DREAMHACK_LOAD_TRIGGER'));
}

document.addEventListener('DOMContentLoaded', async () => {
  updateExtensionStatus();
  // Brief timeout check to avoid injection race conditions
  setTimeout(updateExtensionStatus, 300);

  // Load activity logs list
  loadActivityLogs();

  const confirmbtn = document.getElementById('dreamhack-confirm');
  const userdata = await isLoggedIn();

  if (confirmbtn) {
    if (userdata) {
      if (userdata.username === 'developer') {
        confirmbtn.textContent = 'Renew Shared Session (Admin)';
        confirmbtn.addEventListener('click', () => {
          executeRenewSharedSession(userdata);
        });
      } else {
        confirmbtn.textContent = 'Load Shared Session (User)';
        confirmbtn.addEventListener('click', () => {
          executeLoadSharedSession(userdata);
        });
      }
    } else {
      confirmbtn.addEventListener('click', showLoginRequiredToast);
    }
  } else {
    console.warn("Cannot find the button with id 'dreamhack-confirm'.");
  }

  // Listen for admin auto login response from extension content script
  window.addEventListener('INHACK_ADMIN_AUTO_LOGIN_RESPONSE', (event) => {
    const { ok, message } = event.detail;
    if (ok) {
      showToast('드림핵 공용 계정 세션 재발급 및 동기화 완료!', 'success');
      loadActivityLogs();
    } else {
      showToast(`드림핵 세션 재발급 실패: ${message || '알 수 없는 오류'}`, 'error');
    }
  });

  // Listen for load response event from extension content script
  window.addEventListener('INHACK_DREAMHACK_LOAD_RESPONSE', (event) => {
    const { ok, message } = event.detail;
    if (ok) {
      showToast('공용 계정 세션 이식 성공! 드림핵으로 이동합니다.', 'success');
      setTimeout(() => {
        window.location.href = 'https://dreamhack.io';
      }, 1200);
    } else {
      showToast(`세션 연동 실패: ${message || '알 수 없는 오류'}`, 'error');
    }
  });
  // Listen for sync response event from extension content script
  window.addEventListener('INHACK_DREAMHACK_SYNC_RESPONSE', async (event) => {
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
          // Reload the logs panel to display the new sync attempt immediately
          loadActivityLogs();
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
        showToast('연동 기능을 사용하려면 INHACK 홈페이지에서 DREAMHACK 기능을 이용해주세요.', 'error');
      } else {
        showToast(`쿠키 동기화 실패: ${message}`, 'error');
      }
    }
  });
});