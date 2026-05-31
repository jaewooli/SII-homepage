import { showToast } from "/assets/js/toast.js";
import { apiRequest } from "/assets/js/api.js";

function safeBtoa(uint8Array) {
  let binary = '';
  const len = uint8Array.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(uint8Array[i]);
  }
  return btoa(binary);
}

async function isLoggedIn() {
  const r = await apiRequest('/me', 'GET');
  if (!r.ok) return null;
  
  return r.data;
}

// Auto-seed E2E credentials if plain text exists in env and database is empty
async function autoSeedE2ECredentials(plainEmail, plainPassword) {
  console.log('[E2E Setup] Plain text credentials detected in env. Auto-seeding E2E environment...');
  try {
    // 1. Generate AES-GCM Key (JWK)
    const key = await window.crypto.subtle.generateKey(
      { name: "AES-GCM", length: 256 },
      true,
      ["encrypt", "decrypt"]
    );
    const jwk = await window.crypto.subtle.exportKey("jwk", key);

    // 2. Encrypt Password
    const enc = new TextEncoder();
    const iv = window.crypto.getRandomValues(new Uint8Array(12));
    const encrypted = await window.crypto.subtle.encrypt(
      { name: "AES-GCM", iv: iv },
      key,
      enc.encode(plainPassword)
    );

    const ciphertextBase64 = safeBtoa(new Uint8Array(encrypted));
    const ivBase64 = safeBtoa(iv);

    // 3. Dispatch master key save to chrome extension
    window.dispatchEvent(new CustomEvent('INHACK_SAVE_MASTER_KEY', {
      detail: { jwk }
    }));

    // Delay to let extension save the key
    await new Promise(resolve => setTimeout(resolve, 600));

    // 4. Save encrypted credentials to server
    const saveRes = await apiRequest('/dreamhack/encrypted-credentials', 'POST', {
      encryptedPassword: ciphertextBase64,
      iv: ivBase64
    });

    if (saveRes.ok) {
      console.log('[E2E Setup] E2E Auto-seeding completed successfully.');
      showToast('E2E 보안 환경이 자동으로 안전하게 구축되었습니다!', 'success');
    } else {
      console.error('[E2E Setup] Auto-seeding server save failed:', saveRes.message);
    }
  } catch (err) {
    console.error('[E2E Setup] Fatal error during E2E auto-seeding:', err);
  }
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

async function updateSharedSessionStatus() {
  const badge = document.getElementById('session-status');
  if (!badge) return;

  try {
    const res = await apiRequest('/dreamhack/shared-session', 'GET');
    if (res.ok && res.data && res.data.sessionid) {
      const timeStr = res.data.updated_at ? new Date(res.data.updated_at).toLocaleString() : 'N/A';
      const valid = res.data.valid_sessions || 1;
      const total = res.data.total_sessions || 1;
      badge.className = 'status-badge status-connected';
      badge.innerHTML = `<span class="status-dot"></span>Session: Active (Pool: ${valid}/${total}, Updated: ${timeStr})`;
    } else {
      badge.className = 'status-badge status-disconnected';
      badge.innerHTML = '<span class="status-dot"></span>Session: Inactive (재발급 필요)';
    }
  } catch (err) {
    console.error('Failed to fetch shared session status:', err);
    badge.className = 'status-badge status-disconnected';
    badge.innerHTML = '<span class="status-dot"></span>Session: Error Checking';
  }
}

async function executeSpecificFeature(userdata) {
  const isExtensionInstalled = checkExtensionInstalled();
  if (!isExtensionInstalled) {
    showToast('Chrome Extension not detected. Please install it first.', 'error');
    return;
  }

  showToast('드림핵 세션 동기화 요청 중...', 'info', 0);

  // Trigger cookie sync from Chrome Extension
  window.dispatchEvent(new CustomEvent('INHACK_DREAMHACK_SYNC_TRIGGER'));
}

async function loadActivityLogs() {
  try {
    const res = await apiRequest('/dreamhack/logs', 'GET');
    if (res.ok && res.data) {
      const { accessLogs, solveLogs, interceptLogs } = res.data;
      
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

      // Render logout interception logs
      const interceptBody = document.querySelector('#intercept-log-table tbody');
      if (interceptBody) {
        if (interceptLogs && interceptLogs.length > 0) {
          interceptBody.innerHTML = interceptLogs.map(log => {
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
          interceptBody.innerHTML = `<tr><td colspan="3" class="log-empty">No logout attempts intercepted yet.</td></tr>`;
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

async function executeLoadSharedSession(userdata) {
  const isExtensionInstalled = checkExtensionInstalled();
  if (!isExtensionInstalled) {
    showToast('Chrome Extension not detected. Please install it first.', 'error');
    return;
  }

  showToast('서버에서 공용 세션 정보 가져오는 중...', 'info', 0);
  // Dispatch load trigger event to extension
  window.dispatchEvent(new CustomEvent('INHACK_DREAMHACK_LOAD_TRIGGER'));
}

document.addEventListener('DOMContentLoaded', async () => {
  updateExtensionStatus();
  // Brief timeout check to avoid injection race conditions
  setTimeout(updateExtensionStatus, 300);

  // Load activity logs list
  loadActivityLogs();
  
  // Load shared session status badge
  updateSharedSessionStatus();

  const confirmbtn = document.getElementById('dreamhack-confirm');
  const userdata = await isLoggedIn();

  if (confirmbtn) {
    if (userdata) {
      confirmbtn.textContent = 'Load Shared Session';
      confirmbtn.addEventListener('click', () => {
        executeLoadSharedSession(userdata);
      });
    } else {
      confirmbtn.addEventListener('click', showLoginRequiredToast);
    }
  } else {
    console.warn("Cannot find the button with id 'dreamhack-confirm'.");
  }

  // Render Admin E2E Credential Setup UI if user is admin
  if (userdata && userdata.isAdmin) {
    // E2E Auto-seeding check
    try {
      const credRes = await apiRequest('/dreamhack/encrypted-credentials', 'GET');
      if (credRes.ok && credRes.data && credRes.data.isPlain) {
        await autoSeedE2ECredentials(credRes.data.email, credRes.data.plainPassword);
      }
    } catch (e) {
      console.warn('[E2E Check] Error checking credentials state:', e);
    }

    const container = document.querySelector('.option-container');
    if (container) {
      const adminCard = document.createElement('div');
      adminCard.className = 'option-card admin-only-card';
      adminCard.style.border = '1px solid rgba(255, 75, 75, 0.3)';
      adminCard.innerHTML = `
        <div class="option-title">
            <span style="color: #ff4b4b;">E2E Password Setup</span>
        </div>
        <div class="option-desc" style="margin-bottom: 12px;">
            Set up or update the administrator's Dreamhack password securely using End-to-End Encryption. Plain password is encrypted locally and never transmitted to the server.
        </div>
        <div class="form-group" style="display: flex; flex-direction: column; gap: 8px; margin-bottom: 15px;">
            <input type="password" id="dh-admin-password" placeholder="Dreamhack Password" style="padding: 10px; background: rgba(0,0,0,0.2); border: 1px solid rgba(255,255,255,0.1); border-radius: 4px; color: #fff;">
        </div>
        <button id="dh-admin-save-btn" class="action-btn" style="background: #ff4b4b;" type="button">Save Password (E2E)</button>
      `;
      container.appendChild(adminCard);

      const saveBtn = document.getElementById('dh-admin-save-btn');
      if (saveBtn) {
        saveBtn.addEventListener('click', async () => {
          const password = document.getElementById('dh-admin-password').value;
          if (!password) {
            showToast('비밀번호를 입력해 주세요.', 'error');
            return;
          }

          showToast('보안 대칭키 생성 및 종단간 암호화 중...', 'info', 0);
          try {
            // 1. Generate AES-GCM Key (JWK)
            const key = await window.crypto.subtle.generateKey(
              { name: "AES-GCM", length: 256 },
              true,
              ["encrypt", "decrypt"]
            );
            const jwk = await window.crypto.subtle.exportKey("jwk", key);

            // 2. Encrypt Password
            const enc = new TextEncoder();
            const iv = window.crypto.getRandomValues(new Uint8Array(12));
            const encrypted = await window.crypto.subtle.encrypt(
              { name: "AES-GCM", iv: iv },
              key,
              enc.encode(password)
            );

            const ciphertextBase64 = safeBtoa(new Uint8Array(encrypted));
            const ivBase64 = safeBtoa(iv);

            // 3. Dispatch master key save to chrome extension
            window.dispatchEvent(new CustomEvent('INHACK_SAVE_MASTER_KEY', {
              detail: { jwk }
            }));

            // Give a small delay to let extension save the key
            await new Promise(resolve => setTimeout(resolve, 600));

            // 4. Save encrypted credentials to server (email bound server-side from env)
            const saveRes = await apiRequest('/dreamhack/encrypted-credentials', 'POST', {
              encryptedPassword: ciphertextBase64,
              iv: ivBase64
            });

            if (saveRes.ok) {
              showToast('E2E 암호화 설정이 안전하게 완료되었습니다!', 'success');
              document.getElementById('dh-admin-password').value = '';
            } else {
              showToast(`자격 증명 서버 저장 실패: ${saveRes.message}`, 'error');
            }
          } catch (err) {
            console.error(err);
            showToast(`E2E 암호화 설정 실패: ${err.message}`, 'error');
          }
        });
      }
    }
  }

  // Listen for load response event from extension content script
  window.addEventListener('INHACK_DREAMHACK_LOAD_RESPONSE', (event) => {
    const { ok, message } = event.detail;
    if (ok) {
      showToast('공용 계정 세션 이식 성공! 새 탭에 드림핵이 열립니다.', 'success');
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
      showToast('드림핵 세션 정보 획득 완료. 서버 연동 중...', 'info', 0);

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