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
  if (fragmentID === 'admin') {
    initializeAdminPanel();
  }
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
  showToast('서버에서 E2E 암호화 자격 증명 가져오는 중...', 'info', 0);

  try {
    const credRes = await fetch('/dreamhack/encrypted-credentials');
    if (!credRes.ok) {
      if (credRes.status === 404) {
        throw new Error('드림핵 E2E 계정 정보가 설정되지 않았습니다. 먼저 Dreamhack Integration 메뉴에서 E2E Credentials 설정을 완료해주세요.');
      }
      throw new Error('자격 증명 정보를 가져오지 못했습니다.');
    }

    const credData = await credRes.json();
    if (!credData.ok || !credData.data) {
      throw new Error(credData.message || '자격 증명 데이터 오류');
    }

    const { email, encryptedPassword, iv } = credData.data;

    const isExtensionInstalled = document.documentElement.dataset.inhackExtensionInstalled === "true";
    if (!isExtensionInstalled) {
      throw new Error('Chrome Extension이 감지되지 않았습니다. 먼저 크롬 익스텐션을 설치 및 활성화해 주세요.');
    }

    showToast('드림핵 공용 계정 세션 재발급 및 갱신 중... (약 10초 소요)', 'info', 0);

    // Promise wrapper to await extension response
    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        window.removeEventListener('INHACK_ADMIN_AUTO_LOGIN_RESPONSE', responseListener);
        reject(new Error('익스텐션 응답 타임아웃 (15초 초과)'));
      }, 15000);

      function responseListener(event) {
        clearTimeout(timeout);
        window.removeEventListener('INHACK_ADMIN_AUTO_LOGIN_RESPONSE', responseListener);
        const { ok, message } = event.detail;
        if (ok) {
          resolve();
        } else {
          reject(new Error(message || '익스텐션 처리 중 오류가 발생했습니다.'));
        }
      }

      window.addEventListener('INHACK_ADMIN_AUTO_LOGIN_RESPONSE', responseListener);

      // Dispatch load trigger event to extension via window
      window.dispatchEvent(new CustomEvent('INHACK_ADMIN_AUTO_LOGIN_TRIGGER', {
        detail: { email, encryptedPassword, iv }
      }));
    });

    showToast('드림핵 공용 계정 세션 재발급 및 서버 갱신 완료!', 'success');
    
    // If we are on the dreamhack page, reload to refresh logs and status
    const dhStatusUpdate = document.getElementById('session-status');
    if (dhStatusUpdate) {
      window.location.reload();
    }
  } catch (err) {
    console.error('[Admin Session Renewal] Error:', err);
    showToast(`드림핵 세션 재발급 실패: ${err.message}`, 'error');
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
      // Append Admin Panel to sidebar
      const sidebarList = document.querySelector('aside ul');
      if (sidebarList && !document.getElementById('nav-admin-link')) {
        const adminLi = document.createElement('li');
        adminLi.innerHTML = `<a href="#admin" id="nav-admin-link" class="nav-item-link" style="color: #ff4b4b; border-left: 2px solid #ff4b4b; font-weight: 700;">Admin Panel</a>`;
        sidebarList.appendChild(adminLi);
      }

      const renewbtn = document.createElement('button');
      renewbtn.id = 'renew-btn';
      renewbtn.textContent = 'Renew Session';
      renewbtn.addEventListener('click', async () => {
        await triggerAdminSessionRenewal();
      });
      document.querySelector('nav').appendChild(renewbtn);


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

async function initializeAdminPanel() {
  const selectSection = document.getElementById('admin-edit-section');
  const textareaContent = document.getElementById('admin-edit-content');
  const saveBtn = document.getElementById('admin-save-content-btn');
  const registerForm = document.getElementById('admin-register-form');

  if (selectSection && textareaContent) {
    // Load default section on load
    await loadSectionContent(selectSection.value);

    selectSection.addEventListener('change', async () => {
      await loadSectionContent(selectSection.value);
    });
  }

  // Markdown File Upload and Parse
  const fileInput = document.getElementById('admin-md-file');
  const fileTrigger = document.getElementById('admin-upload-trigger-btn');
  const filenameSpan = document.getElementById('admin-md-filename');

  if (fileTrigger && fileInput && textareaContent) {
    fileTrigger.addEventListener('click', () => {
      fileInput.click();
    });

    fileInput.addEventListener('change', () => {
      const file = fileInput.files[0];
      if (!file) {
        filenameSpan.textContent = '선택된 파일 없음';
        return;
      }
      filenameSpan.textContent = file.name;

      const reader = new FileReader();
      reader.onload = function(e) {
        const markdownText = e.target.result;
        let htmlResult = '';
        
        if (window.marked && window.marked.parse) {
          htmlResult = window.marked.parse(markdownText);
        } else {
          // Simple regex markdown-to-html fallback if marked CDN fails to load
          htmlResult = markdownText
            .replace(/^### (.*$)/gim, '<h3>$1</h3>')
            .replace(/^## (.*$)/gim, '<h2>$1</h2>')
            .replace(/^# (.*$)/gim, '<h1>$1</h1>')
            .replace(/\*\*(.*)\*\*/gim, '<strong>$1</strong>')
            .replace(/\*(.*)\*/gim, '<em>$1</em>')
            .replace(/`(.*)`/gim, '<code>$1</code>')
            .replace(/\[(.*?)\]\((.*?)\)/gim, "<a href='$2' target='_blank' rel='noopener noreferrer'>$1</a>")
            .split('\n')
            .map(line => line.trim() ? `<p>${line.trim()}</p>` : '')
            .join('\n');
        }
        
        textareaContent.value = htmlResult;
        showToast('마크다운 파일이 HTML로 파싱되어 에디터에 로드되었습니다! 내용을 검토한 후 저장해 주세요.', 'success');
      };
      reader.readAsText(file);
    });
  }

  async function loadSectionContent(sectionId) {
    try {
      const response = await fetch(`/frags/${sectionId}.html?_t=${Date.now()}`);
      if (response.ok) {
        const text = await response.text();
        textareaContent.value = text;
      }
    } catch (e) {
      console.error('Failed to load section content:', e);
      showToast('섹션 데이터를 가져오는데 실패했습니다.', 'error');
    }
  }

  if (saveBtn) {
    saveBtn.addEventListener('click', async () => {
      const sectionId = selectSection.value;
      const contentHtml = textareaContent.value;
      
      showToast('저장 중...', 'info', 0);
      try {
        const res = await fetch('/admin/update-content', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sectionId, contentHtml })
        });
        const data = await res.json();
        if (res.ok && data.ok) {
          showToast('컨텐츠가 안전하게 업데이트되었습니다!', 'success');
        } else {
          showToast(data.message || '저장 실패', 'error');
        }
      } catch (err) {
        console.error(err);
        showToast('서버 통신 오류', 'error');
      }
    });
  }

  if (registerForm) {
    registerForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const username = document.getElementById('admin-reg-username').value;
      const name = document.getElementById('admin-reg-name').value;
      const password = document.getElementById('admin-reg-password').value;

      showToast('사용자 등록 중...', 'info', 0);
      try {
        const res = await fetch('/admin/register-user', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username, password, name })
        });
        const data = await res.json();
        if (res.ok && data.ok) {
          showToast(data.message, 'success');
          registerForm.reset();
          loadUserList();
        } else {
          showToast(data.message || '등록 실패', 'error');
        }
      } catch (err) {
        console.error(err);
        showToast('서버 통신 오류', 'error');
      }
    });
  }

  // Load and render user list
  const userListContainer = document.getElementById('admin-user-list-container');
  
  async function loadUserList() {
    if (!userListContainer) return;
    try {
      const res = await fetch('/admin/users');
      if (!res.ok) throw new Error('Failed to fetch users');
      const payload = await res.json();
      if (!payload.ok || !payload.data) {
        userListContainer.innerHTML = `<div style="text-align: center; color: #ef4444; padding: 20px; font-size: 0.8rem;">목록 로드 실패: ${payload.message || '오류'}</div>`;
        return;
      }

      const users = payload.data;
      if (users.length === 0) {
        userListContainer.innerHTML = `<div style="text-align: center; color: #64748b; padding: 20px; font-size: 0.8rem;">등록된 사용자가 없습니다.</div>`;
        return;
      }

      userListContainer.innerHTML = '';
      users.forEach(user => {
        const userRow = document.createElement('div');
        userRow.style.cssText = "display: flex; align-items: center; padding: 10px 0; border-bottom: 1px solid rgba(255,255,255,0.03); font-size: 0.8rem; color: #e2e8f0;";
        
        userRow.innerHTML = `
          <div style="flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; padding-right: 8px;">${user.username}</div>
          <div style="flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; padding-right: 8px;">${user.name}</div>
          <div style="width: 60px; display: flex; justify-content: center;">
            <button class="delete-user-btn action-btn" style="margin: 0; padding: 4px 8px; font-size: 0.7rem; border-color: #ef4444; color: #ef4444; background: transparent; cursor: pointer;">삭제</button>
          </div>
        `;

        const deleteBtn = userRow.querySelector('.delete-user-btn');
        deleteBtn.addEventListener('click', async () => {
          if (confirm(`정말로 사용자 '${user.username}' (${user.name}) 계정을 삭제하시겠습니까?`)) {
            showToast('사용자 삭제 중...', 'info', 0);
            try {
              const delRes = await fetch('/admin/delete-user', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id: user.id, username: user.username })
              });
              const delData = await delRes.json();
              if (delRes.ok && delData.ok) {
                showToast('사용자 계정이 삭제되었습니다.', 'success');
                loadUserList();
              } else {
                showToast(delData.message || '삭제 실패', 'error');
              }
            } catch (err) {
              console.error(err);
              showToast('서버 통신 오류', 'error');
            }
          }
        });

        userListContainer.appendChild(userRow);
      });
    } catch (e) {
      console.error(e);
      userListContainer.innerHTML = `<div style="text-align: center; color: #ef4444; padding: 20px; font-size: 0.8rem;">서버 통신 오류 발생</div>`;
    }
  }

  // Trigger initial list load
  loadUserList();
}