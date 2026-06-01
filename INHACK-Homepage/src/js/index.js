import { showToast } from '/assets/js/toast.js';
import { fetchMe } from '/assets/js/auth.js';

// Disable bold and italic markdown rendering on the client side
if (window.marked && window.marked.use) {
  window.marked.use({
    renderer: {
      strong(text) { return `**${text}**`; },
      em(text) { return `*${text}*`; }
    }
  });
}

const contentArea = document.getElementById('view');

async function loadContent(fragmentID){
  // fragmentID can be a nested path like 'curriculum/week1'
  let url = '';
  if (fragmentID){
    url = `/frags/${fragmentID}.html`;
  }else{
    url = `/frags/home.html`;
  }
  try{
    const response = await fetch(url);
    if (!response.ok){
      throw new Error(`Fragment not found: ${url}`);
    }
    const htmlContent = await response.text();
    contentArea.innerHTML = htmlContent;
    // Extract top-level fragment (e.g. 'curriculum' from 'curriculum/week1')
    const topFragment = fragmentID ? fragmentID.split('/')[0] : '';
    if (topFragment === 'admin') {
      initializeAdminPanel();
    }
  }catch(err){
    console.error('Failed to load content:', err);
    contentArea.innerHTML = `
      <div style="padding: 2rem; text-align: center; color: #64748b;">
        <p style="font-size: 1.1rem; margin-bottom: 0.5rem;">페이지를 찾을 수 없습니다.</p>
        <p style="font-size: 0.85rem; color: #475569;">${fragmentID ? `'${fragmentID}' 콘텐츠가 아직 준비되지 않았습니다.` : ''}</p>
      </div>`;
  }
}

function updateActiveNavLink(fragmentID) {
  // Support nested paths: 'curriculum/week1' → parent is 'curriculum'
  const topFragment = fragmentID ? fragmentID.split('/')[0] : '';

  const navList = document.getElementById('sidebar-nav-list');
  if (!navList) return;

  // Reset all active states and close all submenus
  navList.querySelectorAll('li').forEach(li => {
    li.classList.remove('open');
  });
  navList.querySelectorAll('a').forEach(a => {
    a.classList.remove('active');
  });

  navList.querySelectorAll('li').forEach(li => {
    const mainLink = li.querySelector(':scope > a');
    if (!mainLink) return;
    const hash = mainLink.getAttribute('href');

    // Check exact match (top-level fragment)
    const hashFragment = hash && hash.startsWith('#') ? hash.substring(1) : null;
    const isExactMatch = hash === `#${fragmentID}` || (!fragmentID && (hash === '#' || hash === ''));
    const isParentMatch = hashFragment && hashFragment === topFragment && fragmentID !== topFragment;

    if (isExactMatch) {
      mainLink.classList.add('active');
      if (li.classList.contains('has-submenu')) {
        li.classList.add('open');
      }
    } else if (isParentMatch) {
      // Parent menu: highlight and open submenu
      mainLink.classList.add('active');
      li.classList.add('open');
      // Also highlight the matching submenu item
      const subLinks = li.querySelectorAll('.submenu a');
      subLinks.forEach(subA => {
        const subHash = subA.getAttribute('href');
        if (subHash === `#${fragmentID}`) {
          subA.classList.add('active');
        }
      });
    } else {
      // Check if this is a direct submenu match (for external navigation)
      const subLinks = li.querySelectorAll('.submenu a');
      subLinks.forEach(subA => {
        const subHash = subA.getAttribute('href');
        if (subHash === `#${fragmentID}`) {
          subA.classList.add('active');
          mainLink.classList.add('active');
          li.classList.add('open');
        }
      });
    }
  });
}

window.addEventListener('DOMContentLoaded', () => {
  const rawHash = window.location.hash.substring(1);
  const initialFragment = decodeURIComponent(rawHash);
  loadContent(initialFragment);
  updateActiveNavLink(initialFragment);
});

async function loadSidebarNavigation() {
  try {
    const res = await fetch(`/admin/content/navigation`);
    let menuItems = null;
    if (res.ok) {
      const payload = await res.json();
      if (payload.ok && payload.data && payload.data.content) {
        menuItems = JSON.parse(payload.data.content);
      }
    }
    // Fallback: fetch raw JSON from static file
    if (!menuItems) {
      const fallback = await fetch('/frags/navigation.json');
      if (fallback.ok) menuItems = await fallback.json();
    }
    if (!menuItems || !Array.isArray(menuItems)) return;
    renderSidebarNav(menuItems);
  } catch (err) {
    console.warn('[Nav] Failed to load dynamic navigation:', err.message);
  }
}

function renderSidebarNav(menuItems) {
  const navList = document.getElementById('sidebar-nav-list');
  if (!navList) return;

  navList.innerHTML = '';
  menuItems.forEach(item => {
    if (item.type !== 'menu_item') return;
    const li = document.createElement('li');
    li.style.position = 'relative'; // Ensure relative position for absolute toggle arrow
    
    const isExternal = item.external;
    const hasSubmenu = item.submenus && item.submenus.length > 0;
    if (hasSubmenu) li.classList.add('has-submenu');

    const a = document.createElement('a');
    a.href = item.url || '#';
    a.className = 'nav-item-link';
    a.textContent = item.title;
    if (isExternal) {
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
    }
    li.appendChild(a);

    if (hasSubmenu) {
      // Create separate submenu toggle arrow
      const toggle = document.createElement('span');
      toggle.className = 'submenu-toggle';
      toggle.textContent = '›';
      
      toggle.addEventListener('click', (e) => {
        e.stopPropagation();
        e.preventDefault();
        li.classList.toggle('open');
      });
      li.appendChild(toggle);

      const subUl = document.createElement('ul');
      subUl.className = 'submenu';
      item.submenus.forEach(sub => {
        const subLi = document.createElement('li');
        const subA = document.createElement('a');
        subA.href = sub.url || '#';
        subA.className = 'nav-item-link';
        subA.textContent = sub.title;
        if (sub.external) { subA.target = '_blank'; subA.rel = 'noopener noreferrer'; }
        subLi.appendChild(subA);
        subUl.appendChild(subLi);
      });
      li.appendChild(subUl);

      const isPureCategory = !item.url || item.url === '#';
      a.addEventListener('click', (e) => {
        if (isPureCategory) {
          e.preventDefault();
          li.classList.toggle('open');
        } else {
          // Navigates naturally, and expand submenu
          li.classList.add('open');
        }
      });
    }
    navList.appendChild(li);
  });

  // Re-append admin link if the current user is admin (it gets wiped by innerHTML = '')
  if (window.__currentUser && window.__currentUser.isAdmin && !document.getElementById('nav-admin-link')) {
    const adminLi = document.createElement('li');
    adminLi.innerHTML = `<a href="#admin" id="nav-admin-link" class="nav-item-link" style="color: #ff4b4b; border-left: 2px solid #ff4b4b; font-weight: 700;">Admin Panel</a>`;
    navList.appendChild(adminLi);
  }
}

window.addEventListener('hashchange', () => {
  // Decode URI component to handle encoded characters in fragment paths
  const rawHash = window.location.hash.substring(1);
  const fragmentID = decodeURIComponent(rawHash);
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
    window.__currentUser = user;   // Make available to renderSidebarNav
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
  window.__currentUser = me;   // Store globally so renderSidebarNav can access it
  renderUserUI(me);
  // Load dynamic sidebar AFTER user is known (so admin link is re-added correctly)
  await loadSidebarNavigation();

  // Force first-time users to change their password immediately
  if (me && !me.isAdmin && me.passwordChanged === 0) {
    showForcePasswordChangeModal();
  }

  const message = sessionStorage.getItem('toastMessage');
  const type = sessionStorage.getItem('toastType');

  if (message) {
    sessionStorage.removeItem('toastMessage');
    sessionStorage.removeItem('toastType');
    showToast(message, type || 'info');
  }
});

// Fullscreen overlay modal enforcing E2E mixed password rules
function showForcePasswordChangeModal() {
  const overlay = document.createElement('div');
  overlay.id = 'force-password-change-overlay';
  overlay.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    width: 100vw;
    height: 100vh;
    background: rgba(8, 11, 18, 0.95);
    backdrop-filter: blur(10px);
    display: flex;
    justify-content: center;
    align-items: center;
    z-index: 9998;
  `;

  const modal = document.createElement('div');
  modal.style.cssText = `
    width: 100%;
    max-width: 420px;
    padding: 2.5rem;
    background: #0d131f;
    border: 1px solid rgba(239, 68, 68, 0.3);
    border-radius: 8px;
    box-shadow: 0 10px 25px rgba(0,0,0,0.5);
    color: #fff;
    font-family: sans-serif;
  `;

  modal.innerHTML = `
    <h2 style="color: #ef4444; font-size: 1.25rem; margin-top: 0; margin-bottom: 0.5rem; text-transform: uppercase; font-weight: 700; letter-spacing: 0.05em;">최초 비밀번호 변경 필수</h2>
    <p style="font-size: 0.8rem; color: #94a3b8; line-height: 1.5; margin-bottom: 1.5rem;">보안 강화를 위해 첫 로그인 시 비밀번호 변경이 강제됩니다. 변경 완료 전까지 포털 사용이 불가능합니다.</p>
    
    <form id="force-password-form" style="display: flex; flex-direction: column; gap: 1rem;">
      <div style="display: flex; flex-direction: column; gap: 6px;">
        <label style="font-size: 0.75rem; color: #64748b; font-weight: 600;">현재 비밀번호</label>
        <input type="password" id="force-curr-pw" placeholder="현재 임시 비밀번호" required style="padding: 10px; background: rgba(0,0,0,0.3); border: 1px solid rgba(255,255,255,0.08); border-radius: 4px; color: #fff; outline: none; border-color: rgba(255,255,255,0.1);">
      </div>
      <div style="display: flex; flex-direction: column; gap: 6px;">
        <label style="font-size: 0.75rem; color: #64748b; font-weight: 600;">새 비밀번호</label>
        <input type="password" id="force-new-pw" placeholder="영어 대/소문자, 숫자, 특수문자 포함 (8자 이상)" required style="padding: 10px; background: rgba(0,0,0,0.3); border: 1px solid rgba(255,255,255,0.08); border-radius: 4px; color: #fff; outline: none; border-color: rgba(255,255,255,0.1);">
      </div>
      <div style="display: flex; flex-direction: column; gap: 6px;">
        <label style="font-size: 0.75rem; color: #64748b; font-weight: 600;">새 비밀번호 확인</label>
        <input type="password" id="force-confirm-pw" placeholder="새 비밀번호 다시 입력" required style="padding: 10px; background: rgba(0,0,0,0.3); border: 1px solid rgba(255,255,255,0.08); border-radius: 4px; color: #fff; outline: none; border-color: rgba(255,255,255,0.1);">
      </div>
      
      <button type="submit" class="action-btn" style="border-color: #ef4444; color: #ef4444; margin-top: 1rem; width: 100%; font-weight: 600; padding: 12px; cursor: pointer; background: transparent;">비밀번호 변경 완료</button>
    </form>
  `;

  overlay.appendChild(modal);
  document.body.appendChild(overlay);

  const form = modal.querySelector('#force-password-form');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      const currentPassword = document.getElementById('force-curr-pw').value;
      const newPassword = document.getElementById('force-new-pw').value;
      const confirmPassword = document.getElementById('force-confirm-pw').value;

      if (newPassword === currentPassword) {
        showToast('새 비밀번호는 현재 비밀번호와 다르게 설정해야 합니다.', 'error');
        return;
      }

      if (newPassword !== confirmPassword) {
        showToast('새 비밀번호와 비밀번호 확인이 일치하지 않습니다.', 'error');
        return;
      }

      // Complexity check: Uppercase, Lowercase, Number, keyboard special character, >= 8 chars
      const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?~`]).{8,}$/;
      if (!passwordRegex.test(newPassword)) {
        showToast('새 비밀번호는 최소 8자 이상이어야 하며 숫자, 영문 대문자, 영문 소문자, 특수문자를 각각 최소 1개 이상 포함해야 합니다.', 'error');
        return;
      }

      showToast('비밀번호 변경 처리 중...', 'info', 0);
      const res = await fetch('/change-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentPassword, newPassword })
      });
      const data = await res.json();
      if (res.ok && data.ok) {
        showToast('비밀번호가 성공적으로 변경되었습니다! 포털 페이지로 진입합니다.', 'success');
        overlay.remove();
        setTimeout(() => {
          window.location.reload();
        }, 1000);
      } else {
        showToast(data.message || '비밀번호 변경 실패', 'error');
      }
    } catch (err) {
      console.error('[Force Password Change Error]:', err);
      showToast(`비밀번호 변경 처리 중 오류가 발생했습니다: ${err.message}`, 'error');
    }
  });
}

// Confirmation overlay modal to verify markdown preview and prevent accidental edits
function showSaveConfirmationModal(sectionId, onConfirm) {
  const overlay = document.createElement('div');
  overlay.id = 'admin-save-confirm-overlay';
  overlay.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    width: 100vw;
    height: 100vh;
    background: rgba(8, 11, 18, 0.85);
    backdrop-filter: blur(8px);
    display: flex;
    justify-content: center;
    align-items: center;
    z-index: 9999;
  `;

  const modal = document.createElement('div');
  modal.style.cssText = `
    width: 100%;
    max-width: 480px;
    padding: 2rem;
    background: #0d131f;
    border: 1px solid rgba(59, 130, 246, 0.3);
    border-radius: 8px;
    box-shadow: 0 10px 30px rgba(0,0,0,0.6);
    color: #fff;
    font-family: 'Inter', system-ui, sans-serif;
  `;

  const sectionNameMap = {
    'home': '동아리 소개 (Home)',
    'curriculum': 'Curriculum',
    'seminar': 'Seminar',
    'ctf': 'CTF Challenge'
  };
  const sectionName = sectionNameMap[sectionId] || sectionId;

  modal.innerHTML = `
    <h3 style="color: #06b6d4; font-size: 1.15rem; margin-top: 0; margin-bottom: 1rem; font-weight: 700; letter-spacing: 0.03em;">변경 사항 저장 확인</h3>
    <p style="font-size: 0.85rem; color: #e2e8f0; line-height: 1.6; margin-bottom: 1rem;">
      <strong>[${sectionName}]</strong> 섹션의 마크다운 수정 내용을 저장하시겠습니까?
    </p>
    <div style="background: rgba(59, 130, 246, 0.05); border-left: 3px solid #3b82f6; padding: 12px; margin-bottom: 1.5rem; border-radius: 0 4px 4px 0;">
      <p style="font-size: 0.75rem; color: #94a3b8; margin: 0; line-height: 1.5;">
        ⚠️ <strong>불필요한 수정 방지 안내:</strong><br>
        우측의 <strong>실시간 미리보기(HTML Preview)</strong>를 통해 렌더링된 화면에 이상이 없는지 확인하셨나요? 오탈자나 마크다운 서식 오류가 없는지 다시 한번 점검해 주세요.
      </p>
    </div>
    
    <div style="display: flex; gap: 12px; justify-content: flex-end;">
      <button id="confirm-cancel-btn" style="padding: 10px 16px; background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1); border-radius: 4px; color: #94a3b8; font-size: 0.8rem; cursor: pointer; transition: all 0.2s; outline: none;">취소</button>
      <button id="confirm-save-btn" style="padding: 10px 20px; background: #3b82f6; border: none; border-radius: 4px; color: #fff; font-size: 0.8rem; font-weight: 600; cursor: pointer; transition: all 0.2s; outline: none;">확인 및 저장</button>
    </div>
  `;

  overlay.appendChild(modal);
  document.body.appendChild(overlay);

  const cancelBtn = modal.querySelector('#confirm-cancel-btn');
  const saveBtn = modal.querySelector('#confirm-save-btn');

  cancelBtn.addEventListener('mouseenter', () => { cancelBtn.style.background = 'rgba(255,255,255,0.1)'; cancelBtn.style.color = '#fff'; });
  cancelBtn.addEventListener('mouseleave', () => { cancelBtn.style.background = 'rgba(255,255,255,0.05)'; cancelBtn.style.color = '#94a3b8'; });
  saveBtn.addEventListener('mouseenter', () => { saveBtn.style.background = '#2563eb'; });
  saveBtn.addEventListener('mouseleave', () => { saveBtn.style.background = '#3b82f6'; });

  cancelBtn.addEventListener('click', () => {
    overlay.remove();
  });

  saveBtn.addEventListener('click', () => {
    overlay.remove();
    onConfirm();
  });
}

// Client-side JSON layout compiler (matches backend template compile logic)
function clientCompileJsonToHtml(sectionId, data) {
  function renderInline(text) {
    if (!text) return '';
    if (window.marked && window.marked.parseInline) {
      return window.marked.parseInline(text);
    }
    return text;
  }

  // Handle legacy fallback
  if (!Array.isArray(data)) {
    const legacyBlocks = [];
    if (sectionId === 'home') {
      if (data.banner) legacyBlocks.push({ type: 'banner', ...data.banner });
      if (data.features) legacyBlocks.push({ type: 'features', items: data.features });
      if (data.links) {
        legacyBlocks.push({ type: 'spacer', height: '1.75rem' });
        legacyBlocks.push({ type: 'features', items: data.links });
      }
    } else if (sectionId === 'curriculum') {
      if (data.header) legacyBlocks.push({ type: 'header', ...data.header });
      if (data.phases) legacyBlocks.push({ type: 'phases', items: data.phases });
    } else if (sectionId === 'seminar') {
      if (data.header) legacyBlocks.push({ type: 'header', ...data.header });
      if (data.items) legacyBlocks.push({ type: 'timeline', items: data.items });
    } else if (sectionId === 'ctf') {
      if (data.header) legacyBlocks.push({ type: 'header', ...data.header });
      if (data.leaderboard || data.challenges) {
        legacyBlocks.push({
          type: 'ctf_dashboard',
          leaderboard: data.leaderboard || [],
          challenges: data.challenges || []
        });
      }
    }
    data = legacyBlocks;
  }

  try {
    let htmlResult = '';
    if (sectionId === 'home') {
      htmlResult += '<section class="page-home animate-fade-in">\n';
    } else if (sectionId === 'curriculum') {
      htmlResult += '<section id="curriculum" class="curriculum-view animate-fade-in">\n';
    } else if (sectionId === 'seminar') {
      htmlResult += '<section id="seminar" class="seminar-view animate-fade-in">\n';
    } else if (sectionId === 'ctf') {
      htmlResult += '<section id="ctf" class="ctf-view animate-fade-in">\n';
    } else {
      htmlResult += `<section id="${sectionId}" class="animate-fade-in">\n`;
    }

    data.forEach(block => {
      if (block.type === 'banner') {
        const title = renderInline(block.title);
        const lead = renderInline(block.lead);
        const desc = renderInline(block.desc);
        htmlResult += `<div class="terminal-banner">
<h2 class="hero-title">${title}</h2>
<p class="lead-text">${lead}</p>
<p class="hero-desc">${desc}</p>
</div>\n`;
      } 
      else if (block.type === 'header') {
        const title = renderInline(block.title);
        const desc = renderInline(block.desc);
        htmlResult += `<div class="section-header">
<h2>${title}</h2>
<p class="section-desc">${desc}</p>
</div>\n`;
      } 
      else if (block.type === 'spacer') {
        const height = block.height || '1.5rem';
        htmlResult += `<div style="height: ${height};"></div>\n`;
      }
      else if (block.type === 'features') {
        let featuresHtml = '';
        (block.items || []).forEach(f => {
          if (f.url) {
            featuresHtml += `<a href="${f.url}" target="_blank" rel="noopener noreferrer" style="text-decoration: none;">
<div class="feat-card" style="height: 100%; border: 1px solid rgba(59, 130, 246, 0.15);">
<div class="feat-card-header">
<span class="feat-card-id">${f.tag}</span>
<h4 style="color: var(--color-cyan);">${f.title}</h4>
</div>
<p>${renderInline(f.desc)}</p>
</div>
</a>\n`;
          } else {
            featuresHtml += `<div class="feat-card">
<div class="feat-card-header">
<span class="feat-card-id">${f.tag}</span>
<h4>${f.title}</h4>
</div>
<p>${renderInline(f.desc)}</p>
</div>\n`;
          }
        });
        htmlResult += `<div class="features-grid">
${featuresHtml}</div>\n`;
      } 
      else if (block.type === 'phases') {
        let phasesHtml = '';
        (block.items || []).forEach(p => {
          let topicsHtml = '';
          (p.topics || []).forEach(t => {
            topicsHtml += `<li>${renderInline(t)}</li>\n`;
          });
          phasesHtml += `<div class="roadmap-card">
<div class="card-badge">${p.phase}</div>
<h3 class="card-title">${p.title}</h3>
<p class="card-desc">${renderInline(p.desc)}</p>
<ul class="card-topics">
${topicsHtml}</ul>
</div>\n`;
        });
        htmlResult += `<div class="roadmap-grid">
${phasesHtml}</div>\n`;
      } 
      else if (block.type === 'timeline') {
        let itemsHtml = '';
        (block.items || []).forEach(item => {
          itemsHtml += `<div class="timeline-item">
<div class="timeline-date">${item.week}</div>
<div class="timeline-content">
<h3 class="timeline-title">${item.title}</h3>
<p>${renderInline(item.desc)}</p>
<span class="presenter">${item.presenter}</span>
</div>
</div>\n`;
        });
        htmlResult += `<div class="timeline">
${itemsHtml}</div>\n`;
      } 
      else if (block.type === 'ctf_dashboard') {
        let ranksHtml = '';
        (block.leaderboard || []).forEach((r, idx) => {
          ranksHtml += `<tr class="rank-${idx + 1}">
<td>${r.rank}</td>
<td class="user-cell">${r.user}</td>
<td class="pts-cell">${r.score}</td>
<td class="status-cell">${r.status}</td>
</tr>\n`;
        });

        let chalsHtml = '';
        (block.challenges || []).forEach(c => {
          const isSolved = c.status.toLowerCase() === 'solved';
          const cardClass = isSolved ? 'challenge-card solved' : 'challenge-card';
          const badgeClass = `status-badge ${isSolved ? 'solved' : 'open'}`;
          const badgeText = isSolved ? 'COMPLETED' : 'ACTIVE';
          const categoryClass = `chal-category ${c.category.toLowerCase()}`;

          chalsHtml += `<div class="${cardClass}">
<span class="${categoryClass}">${c.category}</span>
<div class="chal-details">
<h4>${c.title}</h4>
<p class="chal-pts">${c.score}</p>
</div>
<span class="${badgeClass}">${badgeText}</span>
</div>\n`;
        });

        htmlResult += `<div class="ctf-container">
<!-- Scoreboard Panel -->
<div class="scoreboard-section">
<h3 class="panel-title">Leaderboard</h3>
<table class="ctf-table">
<thead>
<tr>
<th>RANK</th>
<th>USER</th>
<th>SCORE</th>
<th>STATUS</th>
</tr>
</thead>
<tbody>
${ranksHtml}</tbody>
</table>
</div>
<!-- Challenges Panel -->
<div class="challenges-section">
<h3 class="panel-title">Active Challenges</h3>
<div class="challenge-list">
${chalsHtml}</div>
</div>
</div>\n`;
      }
      else if (block.type === 'menu_item') {
        const submenusHtml = (block.submenus || []).map(s =>
          `<li style="padding: 4px 0 4px 16px; color: #94a3b8; font-size: 0.8rem;">└ <a href="${s.url || '#'}" style="color: #94a3b8;">${s.title}${s.external ? ' ↗' : ''}</a></li>`
        ).join('\n');
        const externalBadge = block.external ? ' <span style="font-size:0.65rem; color:#fbbf24; vertical-align: middle;">↗ EXT</span>' : '';
        htmlResult += `<div style="padding: 10px 0; border-bottom: 1px solid rgba(255,255,255,0.06);">
  <a href="${block.url || '#'}" style="font-family: var(--font-mono); font-size: 0.85rem; font-weight: 700; color: #e2e8f0; text-decoration: none;">${block.title || '(제목 없음)'}${externalBadge}</a>
  ${submenusHtml ? `<ul style="list-style:none; padding: 0; margin: 4px 0 0 0;">${submenusHtml}</ul>` : ''}
</div>\n`;
      }
    });

    htmlResult += '</section>';
    return htmlResult;
  } catch (err) {
    return `<div style="color: #ef4444; padding: 1.5rem; border: 1px dashed rgba(239, 68, 68, 0.3); border-radius: 6px; background: rgba(239, 68, 68, 0.05);">
      <h4 style="margin: 0 0 0.5rem 0;">⚠️ 템플릿 컴파일 오류</h4>
      <p style="margin: 0; font-size: 0.8rem;">데이터가 올바른 구조를 갖고 있지 않습니다: ${err.message}</p>
    </div>`;
  }
}

async function initializeAdminPanel() {
  const selectSection = document.getElementById('admin-edit-section');
  const formContainer = document.getElementById('admin-block-form-container');
  const previewArea = document.getElementById('admin-html-preview');
  const saveBtn = document.getElementById('admin-save-content-btn');
  const registerForm = document.getElementById('admin-register-form');

  if (selectSection && formContainer && previewArea) {
    let currentBlocks = [];
    let activeBlockIndex = null;
    let draggedIndex = null;
    let isDirty = false;
    let lastSelectedSection = selectSection.value;

    // Dynamic loading of section options based on navigation configuration
    async function updateEditSectionOptions() {
      let menuItems = null;
      try {
        const res = await fetch(`/admin/content/navigation?_t=${Date.now()}`);
        if (res.ok) {
          const payload = await res.json();
          if (payload.ok && payload.data && payload.data.content) {
            menuItems = JSON.parse(payload.data.content);
          }
        }
      } catch (err) {
        console.warn('Failed to load navigation for admin select:', err);
      }
      
      if (!menuItems) {
        try {
          const fallback = await fetch('/frags/navigation.json');
          if (fallback.ok) menuItems = await fallback.json();
        } catch(e) {}
      }

      const selectSection = document.getElementById('admin-edit-section');
      if (!selectSection) return;

      const prevValue = selectSection.value;
      selectSection.innerHTML = '';

      // Default page title mapping
      const defaultPages = {
        'home': '동아리 소개 (Home)',
        'curriculum': 'Curriculum',
        'seminar': 'Seminar',
        'ctf': 'CTF Challenge'
      };

      // Set to track compiled sections and avoid duplicate rendering
      const renderedSections = new Set();

      if (menuItems && Array.isArray(menuItems)) {
        menuItems.forEach(item => {
          if (!item.url || item.external) return;
          if (item.url.startsWith('#')) {
            const mainVal = item.url.substring(1);
            if (!mainVal) return;

            // Render parent menu option
            const option = document.createElement('option');
            option.value = mainVal;
            option.textContent = defaultPages[mainVal] || item.title;
            selectSection.appendChild(option);
            renderedSections.add(mainVal);

            // Render corresponding submenus directly underneath this parent
            if (item.submenus && Array.isArray(item.submenus)) {
              item.submenus.forEach(sub => {
                if (sub.url && sub.url.startsWith('#') && !sub.external) {
                  const subVal = sub.url.substring(1);
                  if (!renderedSections.has(subVal)) {
                    const subOption = document.createElement('option');
                    subOption.value = subVal;
                    subOption.textContent = `  └ [서브메뉴] ${sub.title}`;
                    selectSection.appendChild(subOption);
                    renderedSections.add(subVal);
                  }
                }
              });
            }
          }
        });
      }

      // Add default pages if they are missing in the navigation list (safety fallback)
      Object.keys(defaultPages).forEach(val => {
        if (!renderedSections.has(val)) {
          const option = document.createElement('option');
          option.value = val;
          option.textContent = defaultPages[val];
          selectSection.appendChild(option);
          renderedSections.add(val);
        }
      });

      // Always append navigation page editor option at the bottom
      const navOption = document.createElement('option');
      navOption.value = 'navigation';
      navOption.textContent = '🧭 Navigation (메뉴)';
      selectSection.appendChild(navOption);

      if (Array.from(selectSection.options).some(opt => opt.value === prevValue)) {
        selectSection.value = prevValue;
      }
    }

    // Tab switching logic
    const tabButtons = document.querySelectorAll('.admin-tab-btn');
    tabButtons.forEach(btn => {
      btn.addEventListener('click', () => {
        const targetTab = btn.getAttribute('data-tab');

        // Update active class on buttons
        tabButtons.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');

        // Update active class on panes
        document.querySelectorAll('.admin-tab-pane').forEach(pane => {
          pane.classList.remove('active');
        });
        const targetPane = document.getElementById(`admin-pane-${targetTab}`);
        if (targetPane) {
          targetPane.classList.add('active');
        }
      });
    });

    // Overlay launch and close listeners
    const openEditorBtn = document.getElementById('admin-open-editor-btn');
    const closeEditorBtn = document.getElementById('admin-close-editor-btn');
    const editorOverlay = document.getElementById('admin-editor-overlay');

    if (openEditorBtn && editorOverlay) {
      openEditorBtn.addEventListener('click', async () => {
        // Load dynamic options right before opening
        await updateEditSectionOptions();
        editorOverlay.classList.add('active');
        document.body.style.overflow = 'hidden';
      });
    }

    if (closeEditorBtn && editorOverlay) {
      closeEditorBtn.addEventListener('click', () => {
        if (isDirty) {
          if (confirm('수정 중인 내용이 저장되지 않았을 수 있습니다. 정말로 에디터를 닫으시겠습니까?')) {
            editorOverlay.classList.remove('active');
            document.body.style.overflow = '';
          }
        } else {
          editorOverlay.classList.remove('active');
          document.body.style.overflow = '';
        }
      });
    }

    // Load dynamic edit sections options first
    await updateEditSectionOptions();

    // Load default section on load
    await loadSectionMarkdown(selectSection.value);

    // Toolbar Block Injector Logic
    const toolbar = document.querySelector('.block-toolbar');
    if (toolbar) {
      toolbar.querySelectorAll('.tool-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          const blockType = btn.getAttribute('data-block-type');
          injectBlockTemplate(blockType);
        });
      });
    }

    function legacyFallback(data, sectionId) {
      const legacyBlocks = [];
      if (sectionId === 'home') {
        if (data.banner) legacyBlocks.push({ type: 'banner', ...data.banner });
        if (data.features) legacyBlocks.push({ type: 'features', items: data.features });
        if (data.links) {
          legacyBlocks.push({ type: 'spacer', height: '1.75rem' });
          legacyBlocks.push({ type: 'features', items: data.links });
        }
      } else if (sectionId === 'curriculum') {
        if (data.header) legacyBlocks.push({ type: 'header', ...data.header });
        if (data.phases) legacyBlocks.push({ type: 'phases', items: data.phases });
      } else if (sectionId === 'seminar') {
        if (data.header) legacyBlocks.push({ type: 'header', ...data.header });
        if (data.items) legacyBlocks.push({ type: 'timeline', items: data.items });
      } else if (sectionId === 'ctf') {
        if (data.header) legacyBlocks.push({ type: 'header', ...data.header });
        if (data.leaderboard || data.challenges) {
          legacyBlocks.push({
            type: 'ctf_dashboard',
            leaderboard: data.leaderboard || [],
            challenges: data.challenges || []
          });
        }
      }
      return legacyBlocks;
    }

    const templates = {
      banner: {
        type: "banner",
        title: "새로운 배너 제목",
        lead: "여기에 **강조 텍스트**나 리드 문구를 입력하세요.",
        desc: "상세 설명 텍스트를 입력할 수 있습니다."
      },
      header: {
        type: "header",
        title: "새로운 섹션 헤더 제목",
        desc: "이 섹션에 대한 간단한 설명입니다."
      },
      features: {
        type: "features",
        items: [
          {
            tag: "TAG 01 //",
            title: "카드 제목",
            desc: "카드 설명글 상세 정보",
            url: ""
          }
        ]
      },
      spacer: {
        type: "spacer",
        height: "1.75rem"
      },
      phases: {
        type: "phases",
        items: [
          {
            phase: "Phase 01",
            title: "단계 제목",
            desc: "해당 단계에서 공부하는 주요 개념",
            topics: [
              "상세 주제 1",
              "상세 주제 2"
            ]
          }
        ]
      },
      timeline: {
        type: "timeline",
        items: [
          {
            week: "Week 01",
            title: "세미나 주제",
            desc: "세미나 및 활동 내용 설명",
            presenter: "Presenter: 발표자 이름"
          }
        ]
      },
      ctf_dashboard: {
        type: "ctf_dashboard",
        leaderboard: [
          {
            rank: "1st 🥇",
            user: "닉네임",
            score: "1000 PTS",
            status: "5 / 5 SOLVED"
          }
        ],
        challenges: [
          {
            category: "WEB",
            title: "Web Challenge 1",
            score: "100 PTS",
            status: "open"
          }
        ]
      },
      menu_item: {
        type: "menu_item",
        title: "새 메뉴",
        url: "#",
        external: false,
        submenus: []
      }
    };

    function injectBlockTemplate(type) {
      const blockObj = JSON.parse(JSON.stringify(templates[type]));
      if (!blockObj) return;

      currentBlocks.push(blockObj);
      activeBlockIndex = currentBlocks.length - 1;

      renderBlockList();
      renderActiveBlockForm();
      renderPreview();
      showToast(`새로운 ${type} 블록이 추가되었습니다!`, 'success');
      
      const blockListContainer = document.getElementById('admin-block-list');
      if (blockListContainer) {
        blockListContainer.scrollTop = blockListContainer.scrollHeight;
      }
    }

    selectSection.addEventListener('change', async () => {
      if (isDirty) {
        if (!confirm('저장하지 않은 변경 사항이 있습니다. 다른 섹션으로 이동하시겠습니까?')) {
          selectSection.value = lastSelectedSection;
          return;
        }
      }
      lastSelectedSection = selectSection.value;
      await loadSectionMarkdown(selectSection.value);
    });

    function renderPreview(skipDirty = false) {
      if (!previewArea) return;
      const sectionId = selectSection.value;
      
      if (!skipDirty) {
        isDirty = true;
      }
      
      try {
        const htmlResult = clientCompileJsonToHtml(sectionId, currentBlocks);
        previewArea.innerHTML = htmlResult;
        if (saveBtn) saveBtn.disabled = false;
      } catch (err) {
        previewArea.innerHTML = `<div style="color: #ef4444; padding: 1.5rem; border: 1px dashed rgba(239, 68, 68, 0.3); border-radius: 6px; background: rgba(239, 68, 68, 0.05); font-family: monospace; font-size: 0.85rem;">
          <h4 style="margin-top: 0; margin-bottom: 0.5rem; text-transform: uppercase;">⚠️ 렌더링 오류</h4>
          <p style="margin: 0; line-height: 1.5;">${err.message}</p>
        </div>`;
        if (saveBtn) saveBtn.disabled = true;
      }
    }

    function renderBlockList() {
      const blockListContainer = document.getElementById('admin-block-list');
      if (!blockListContainer) return;
      
      if (!currentBlocks || !Array.isArray(currentBlocks) || currentBlocks.length === 0) {
        blockListContainer.innerHTML = '<div style="color: #64748b; font-size: 0.75rem; text-align: center; padding: 20px;">등록된 블록이 없습니다.</div>';
        return;
      }

      blockListContainer.innerHTML = '';
      currentBlocks.forEach((block, index) => {
        const blockCard = document.createElement('div');
        blockCard.className = `block-hierarchy-card block-type-${block.type}${index === activeBlockIndex ? ' active' : ''}`;
        blockCard.style.cursor = 'grab';
        blockCard.setAttribute('draggable', 'true');
        
        let titlePreview = '';
        let icon = '📦';
        if (block.type === 'banner') { icon = '📢'; titlePreview = block.title || ''; }
        else if (block.type === 'header') { icon = '🏷️'; titlePreview = block.title || ''; }
        else if (block.type === 'features') { icon = '🎴'; titlePreview = `카드 ${block.items?.length || 0}개`; }
        else if (block.type === 'spacer') { icon = '↕️'; titlePreview = block.height || '1.5rem'; }
        else if (block.type === 'phases') { icon = '🗺️'; titlePreview = `단계 ${block.items?.length || 0}개`; }
        else if (block.type === 'timeline') { icon = '📅'; titlePreview = `아이템 ${block.items?.length || 0}개`; }
        else if (block.type === 'ctf_dashboard') { icon = '🏆'; titlePreview = '대시보드'; }
        else if (block.type === 'menu_item') { icon = '🧭'; titlePreview = block.title || '새 메뉴'; }

        if (titlePreview && titlePreview.length > 15) {
          titlePreview = titlePreview.substring(0, 15) + '...';
        }

        blockCard.innerHTML = `
          <div class="block-select-zone" style="display: flex; flex-direction: column; flex: 1; min-width: 0; text-align: left; gap: 4px;">
            <div style="display: flex; align-items: center; gap: 6px;">
              <span class="block-badge block-badge-${block.type}">#${index + 1} ${block.type.toUpperCase()}</span>
            </div>
            <span style="font-size: 0.78rem; color: #f1f5f9; font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${icon} ${titlePreview || block.type}</span>
          </div>
          <div style="display: flex; gap: 4px; flex-shrink: 0; align-items: center;">
            <button type="button" class="hierarchy-btn move-up" data-index="${index}" title="위로 이동">↑</button>
            <button type="button" class="hierarchy-btn move-down" data-index="${index}" title="아래로 이동">↓</button>
            <button type="button" class="hierarchy-btn delete-block" data-index="${index}" title="삭제">🗑️</button>
          </div>
        `;
        
        blockCard.querySelector('.block-select-zone').addEventListener('click', () => {
          activeBlockIndex = index;
          renderBlockList();
          renderActiveBlockForm();
        });

        blockCard.querySelector('.move-up').addEventListener('click', (e) => {
          e.stopPropagation();
          moveBlock(index, -1);
        });
        blockCard.querySelector('.move-down').addEventListener('click', (e) => {
          e.stopPropagation();
          moveBlock(index, 1);
        });
        blockCard.querySelector('.delete-block').addEventListener('click', (e) => {
          e.stopPropagation();
          deleteBlock(index);
        });

        // Drag & Drop event listeners
        blockCard.addEventListener('dragstart', (e) => {
          draggedIndex = index;
          e.dataTransfer.effectAllowed = 'move';
          blockCard.classList.add('dragging');
        });

        blockCard.addEventListener('dragover', (e) => {
          e.preventDefault();
          e.dataTransfer.dropEffect = 'move';
        });

        blockCard.addEventListener('dragenter', (e) => {
          e.preventDefault();
          if (index !== draggedIndex) {
            blockCard.classList.add('drag-over');
          }
        });

        blockCard.addEventListener('dragleave', () => {
          blockCard.classList.remove('drag-over');
        });

        blockCard.addEventListener('drop', (e) => {
          e.preventDefault();
          blockCard.classList.remove('drag-over');
          
          if (draggedIndex !== null && draggedIndex !== index) {
            const draggedBlock = currentBlocks[draggedIndex];
            currentBlocks.splice(draggedIndex, 1);
            currentBlocks.splice(index, 0, draggedBlock);
            activeBlockIndex = index;

            renderBlockList();
            renderActiveBlockForm();
            renderPreview();
            showToast('블록 위치가 드래그로 변경되었습니다.', 'success');
          }
          draggedIndex = null;
        });

        blockCard.addEventListener('dragend', () => {
          blockCard.classList.remove('dragging');
          blockListContainer.querySelectorAll('.block-hierarchy-card').forEach(card => {
            card.classList.remove('drag-over');
          });
        });

        blockListContainer.appendChild(blockCard);
      });
    }

    function moveBlock(idx, direction) {
      const targetIdx = idx + direction;
      if (targetIdx < 0 || targetIdx >= currentBlocks.length) return;

      const temp = currentBlocks[idx];
      currentBlocks[idx] = currentBlocks[targetIdx];
      currentBlocks[targetIdx] = temp;

      if (activeBlockIndex === idx) {
        activeBlockIndex = targetIdx;
      } else if (activeBlockIndex === targetIdx) {
        activeBlockIndex = idx;
      }

      renderBlockList();
      renderActiveBlockForm();
      renderPreview();
      showToast('블록 순서가 변경되었습니다.', 'success');
    }

    function deleteBlock(idx) {
      const block = currentBlocks[idx];
      if (block && block.deleteLocked) {
        showToast(`'${block.title || block.type}' 메뉴는 삭제 방지 보호가 활성화되어 있어 삭제할 수 없습니다. 먼저 편집 창에서 '메뉴 삭제 방지 보호' 체크박스를 해제해 주세요.`, 'error');
        return;
      }
      if (!confirm('정말로 이 블록을 삭제하시겠습니까?')) return;

      currentBlocks.splice(idx, 1);

      if (currentBlocks.length === 0) {
        activeBlockIndex = null;
      } else if (activeBlockIndex === idx) {
        activeBlockIndex = Math.max(0, idx - 1);
      } else if (activeBlockIndex > idx) {
        activeBlockIndex--;
      }

      renderBlockList();
      renderActiveBlockForm();
      renderPreview();
      showToast('블록이 삭제되었습니다.', 'success');
    }

    function renderActiveBlockForm() {
      if (!formContainer) return;

      if (activeBlockIndex === null || activeBlockIndex < 0 || activeBlockIndex >= currentBlocks.length) {
        formContainer.innerHTML = `<div style="color: #64748b; font-size: 0.8rem; text-align: center; margin-top: 50px;">왼쪽에서 편집할 블록을 선택하거나 새로운 블록을 추가해 주세요.</div>`;
        return;
      }

      const block = currentBlocks[activeBlockIndex];
      formContainer.innerHTML = '';

      const wrapper = document.createElement('div');
      wrapper.style.display = 'flex';
      wrapper.style.flexDirection = 'column';
      wrapper.style.gap = '12px';

      const headerTitle = document.createElement('div');
      headerTitle.style.cssText = "font-size: 0.8rem; color: var(--color-cyan); font-weight: bold; border-bottom: 1px solid rgba(255,255,255,0.08); padding-bottom: 8px; margin-bottom: 10px; text-transform: uppercase;";
      headerTitle.textContent = `✍️ ${block.type} 블록 편집`;
      wrapper.appendChild(headerTitle);

      if (block.type === 'banner') {
        wrapper.innerHTML += `
          <div class="block-form-group">
            <label>배너 제목 (Title)</label>
            <input type="text" class="block-form-input block-field" data-field="title" value="${block.title || ''}">
          </div>
          <div class="block-form-group">
            <label>서브 타이틀 / 리드 텍스트 (Lead)</label>
            <input type="text" class="block-form-input block-field" data-field="lead" value="${block.lead || ''}">
          </div>
          <div class="block-form-group">
            <label>설명 (Description)</label>
            <div class="block-form-input block-field content-editor" data-field="desc" contenteditable="true" style="min-height: 100px;">${block.desc || ''}</div>
          </div>
        `;
      } 
      else if (block.type === 'header') {
        wrapper.innerHTML += `
          <div class="block-form-group">
            <label>헤더 제목 (Title)</label>
            <input type="text" class="block-form-input block-field" data-field="title" value="${block.title || ''}">
          </div>
          <div class="block-form-group">
            <label>설명 (Description)</label>
            <div class="block-form-input block-field content-editor" data-field="desc" contenteditable="true" style="min-height: 100px;">${block.desc || ''}</div>
          </div>
        `;
      } 
      else if (block.type === 'spacer') {
        wrapper.innerHTML += `
          <div class="block-form-group">
            <label>여백 높이 (Height - px, rem, em 등 단위 포함)</label>
            <input type="text" class="block-form-input block-field" data-field="height" value="${block.height || '1.5rem'}">
          </div>
        `;
      } 
      else if (block.type === 'features') {
        const items = block.items || [];
        let itemsHtml = items.map((item, idx) => `
          <div class="block-card-item feature-item" data-item-index="${idx}">
            <div class="block-card-header">
              <span class="block-card-title-label">CARD #${idx + 1}</span>
              <button type="button" class="hierarchy-btn delete-card-item" data-item-index="${idx}">삭제</button>
            </div>
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px;">
              <div class="block-form-group">
                <label>태그 (Tag)</label>
                <input type="text" class="block-form-input item-field" data-field="tag" value="${item.tag || ''}">
              </div>
              <div class="block-form-group">
                <label>제목 (Title)</label>
                <input type="text" class="block-form-input item-field" data-field="title" value="${item.title || ''}">
              </div>
            </div>
            <div class="block-form-group">
              <label>링크 URL (선택 사항)</label>
              <input type="text" class="block-form-input item-field" data-field="url" value="${item.url || ''}">
            </div>
            <div class="block-form-group" style="margin-bottom: 0;">
              <label>설명 (Description)</label>
              <div class="block-form-input item-field content-editor" data-field="desc" contenteditable="true" style="min-height: 60px;">${item.desc || ''}</div>
            </div>
          </div>
        `).join('');

        wrapper.innerHTML += `
          <div style="display: flex; flex-direction: column; gap: 10px;">
            ${itemsHtml}
            <button type="button" class="action-btn add-card-item">+ 새 카드 추가</button>
          </div>
        `;
      } 
      else if (block.type === 'phases') {
        const items = block.items || [];
        let itemsHtml = items.map((item, idx) => `
          <div class="block-card-item phase-item" data-item-index="${idx}">
            <div class="block-card-header">
              <span class="block-card-title-label">PHASE #${idx + 1}</span>
              <button type="button" class="hierarchy-btn delete-card-item" data-item-index="${idx}">삭제</button>
            </div>
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px;">
              <div class="block-form-group">
                <label>단계명 (Phase)</label>
                <input type="text" class="block-form-input item-field" data-field="phase" value="${item.phase || ''}">
              </div>
              <div class="block-form-group">
                <label>제목 (Title)</label>
                <input type="text" class="block-form-input item-field" data-field="title" value="${item.title || ''}">
              </div>
            </div>
            <div class="block-form-group">
              <label>설명 (Description)</label>
              <div class="block-form-input item-field content-editor" data-field="desc" contenteditable="true" style="min-height: 60px;">${item.desc || ''}</div>
            </div>
            <div class="block-form-group" style="margin-bottom: 0;">
              <label>상세 주제 목록 (Topics - 한 줄에 하나씩 입력)</label>
              <textarea class="block-form-input topics-field" style="min-height: 80px;">${(item.topics || []).join('\n')}</textarea>
            </div>
          </div>
        `).join('');

        wrapper.innerHTML += `
          <div style="display: flex; flex-direction: column; gap: 10px;">
            ${itemsHtml}
            <button type="button" class="action-btn add-card-item">+ 새 단계 추가</button>
          </div>
        `;
      } 
      else if (block.type === 'timeline') {
        const items = block.items || [];
        let itemsHtml = items.map((item, idx) => `
          <div class="block-card-item timeline-item" data-item-index="${idx}">
            <div class="block-card-header">
              <span class="block-card-title-label">WEEK/ITEM #${idx + 1}</span>
              <button type="button" class="hierarchy-btn delete-card-item" data-item-index="${idx}">삭제</button>
            </div>
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px;">
              <div class="block-form-group">
                <label>주차/날짜 (Week)</label>
                <input type="text" class="block-form-input item-field" data-field="week" value="${item.week || ''}">
              </div>
              <div class="block-form-group">
                <label>발표자 (Presenter)</label>
                <input type="text" class="block-form-input item-field" data-field="presenter" value="${item.presenter || ''}">
              </div>
            </div>
            <div class="block-form-group">
              <label>주제/제목 (Title)</label>
              <input type="text" class="block-form-input item-field" data-field="title" value="${item.title || ''}">
            </div>
            <div class="block-form-group" style="margin-bottom: 0;">
              <label>설명 (Description)</label>
              <div class="block-form-input item-field content-editor" data-field="desc" contenteditable="true" style="min-height: 60px;">${item.desc || ''}</div>
            </div>
          </div>
        `).join('');

        wrapper.innerHTML += `
          <div style="display: flex; flex-direction: column; gap: 10px;">
            ${itemsHtml}
            <button type="button" class="action-btn add-card-item">+ 새 일정 추가</button>
          </div>
        `;
      } 
      else if (block.type === 'ctf_dashboard') {
        const leaderboard = block.leaderboard || [];
        const challenges = block.challenges || [];

        let leaderboardHtml = leaderboard.map((user, idx) => `
          <div class="block-card-item ctf-leaderboard-item" data-item-index="${idx}">
            <div class="block-card-header">
              <span class="block-card-title-label">RANK #${idx + 1}</span>
              <button type="button" class="hierarchy-btn delete-leaderboard-item" data-item-index="${idx}">삭제</button>
            </div>
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px;">
              <div class="block-form-group">
                <label>순위 (Rank)</label>
                <input type="text" class="block-form-input leaderboard-field" data-field="rank" value="${user.rank || ''}">
              </div>
              <div class="block-form-group">
                <label>닉네임 (User)</label>
                <input type="text" class="block-form-input leaderboard-field" data-field="user" value="${user.user || ''}">
              </div>
            </div>
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-top: 6px;">
              <div class="block-form-group" style="margin-bottom: 0;">
                <label>점수 (Score)</label>
                <input type="text" class="block-form-input leaderboard-field" data-field="score" value="${user.score || ''}">
              </div>
              <div class="block-form-group" style="margin-bottom: 0;">
                <label>해결 현황 (Status)</label>
                <input type="text" class="block-form-input leaderboard-field" data-field="status" value="${user.status || ''}">
              </div>
            </div>
          </div>
        `).join('');

        let challengesHtml = challenges.map((chal, idx) => `
          <div class="block-card-item ctf-challenge-item" data-item-index="${idx}">
            <div class="block-card-header">
              <span class="block-card-title-label">CHALLENGE #${idx + 1}</span>
              <button type="button" class="hierarchy-btn delete-challenge-item" data-item-index="${idx}">삭제</button>
            </div>
            <div style="display: grid; grid-template-columns: 1fr 1.5fr; gap: 10px;">
              <div class="block-form-group">
                <label>분류 (Category)</label>
                <input type="text" class="block-form-input challenge-field" data-field="category" value="${chal.category || ''}">
              </div>
              <div class="block-form-group">
                <label>문제 제목 (Title)</label>
                <input type="text" class="block-form-input challenge-field" data-field="title" value="${chal.title || ''}">
              </div>
            </div>
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-top: 6px;">
              <div class="block-form-group" style="margin-bottom: 0;">
                <label>점수 (Score)</label>
                <input type="text" class="block-form-input challenge-field" data-field="score" value="${chal.score || ''}">
              </div>
              <div class="block-form-group" style="margin-bottom: 0;">
                <label>상태 (Status)</label>
                <select class="block-form-input challenge-field" data-field="status">
                  <option value="solved" ${chal.status === 'solved' ? 'selected' : ''}>Solved (COMPLETED)</option>
                  <option value="open" ${chal.status !== 'solved' ? 'selected' : ''}>Open (ACTIVE)</option>
                </select>
              </div>
            </div>
          </div>
        `).join('');

        wrapper.innerHTML += `
          <div>
            <h4 style="color: var(--color-cyan); margin: 0 0 10px 0; font-size: 0.85rem; border-bottom: 1px solid rgba(59,130,246,0.2); padding-bottom: 6px;">🏆 LEADERBOARD</h4>
            <div style="display: flex; flex-direction: column; gap: 10px; margin-bottom: 15px;">
              ${leaderboardHtml}
              <button type="button" class="action-btn add-leaderboard-item">+ 리더보드 항목 추가</button>
            </div>
            <h4 style="color: var(--color-cyan); margin: 20px 0 10px 0; font-size: 0.85rem; border-bottom: 1px solid rgba(59,130,246,0.2); padding-bottom: 6px;">🧩 ACTIVE CHALLENGES</h4>
            <div style="display: flex; flex-direction: column; gap: 10px;">
              ${challengesHtml}
              <button type="button" class="action-btn add-challenge-item">+ 챌린지 추가</button>
            </div>
          </div>
        `;
      }
      else if (block.type === 'menu_item') {
        const submenus = block.submenus || [];
        let submenusHtml = submenus.map((sub, idx) => `
          <div class="block-card-item submenu-item" data-item-index="${idx}">
            <div class="block-card-header">
              <span class="block-card-title-label">SUBMENU #${idx + 1}</span>
              <button type="button" class="hierarchy-btn delete-submenu-item" data-item-index="${idx}">삭제</button>
            </div>
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px;">
              <div class="block-form-group">
                <label>서브메뉴 제목 (Title)</label>
                <input type="text" class="block-form-input submenu-field" data-field="title" value="${sub.title || ''}">
              </div>
              <div class="block-form-group">
                <label>URL / Hash</label>
                <input type="text" class="block-form-input submenu-field" data-field="url" value="${sub.url || ''}" placeholder="${block.url ? (block.url.startsWith('#') ? block.url : '#' + block.url) + '/' : '#'}">
              </div>
            </div>
            <div class="block-form-group" style="margin-top: 6px;">
              <label style="display:flex; align-items:center; gap: 8px; cursor:pointer;">
                <input type="checkbox" class="submenu-field submenu-external-check" data-field="external" ${sub.external ? 'checked' : ''}>
                <span>외부 링크 (새 탭으로 열기)</span>
              </label>
            </div>
          </div>
        `).join('');

        wrapper.innerHTML += `
          <div class="block-form-group">
            <label>메뉴 제목 (Title)</label>
            <input type="text" class="block-form-input block-field" data-field="title" value="${block.title || ''}">
          </div>
          <div class="block-form-group">
            <label>메뉴 URL (없으면 # 또는 비워두기)</label>
            <input type="text" class="block-form-input block-field" data-field="url" value="${block.url || ''}">
          </div>
          <div class="block-form-group">
            <label style="display:flex; align-items:center; gap: 8px; cursor:pointer;">
              <input type="checkbox" class="block-external-check" ${block.external ? 'checked' : ''}>
              <span>외부 링크 (새 탭으로 열기)</span>
            </label>
          </div>
          <div class="block-form-group" style="margin-top: 10px; padding: 10px; background: rgba(244, 63, 94, 0.05); border: 1px solid rgba(244, 63, 94, 0.15); border-radius: 4px;">
            <label style="display:flex; align-items:center; gap: 8px; cursor:pointer; color: #f43f5e; font-weight: 600; font-size: 0.8rem;">
              <input type="checkbox" class="block-delete-lock-check" ${block.deleteLocked ? 'checked' : ''}>
              <span>⚠️ 메뉴 삭제 방지 보호 (활성화 시 삭제 불가)</span>
            </label>
          </div>
          <h4 style="color: var(--color-cyan); margin: 16px 0 8px 0; font-size: 0.82rem; border-bottom: 1px solid rgba(59,130,246,0.2); padding-bottom: 6px;">📂 세부 메뉴 (Submenus)</h4>
          <div style="display: flex; flex-direction: column; gap: 10px;">
            ${submenusHtml}
            <button type="button" class="action-btn add-submenu-item">+ 세부 메뉴 추가</button>
          </div>
        `;
      }

      formContainer.appendChild(wrapper);
      attachFormattingToolbars(formContainer);

      // Attach dynamic listeners for block-level basic fields
      formContainer.querySelectorAll('.block-field').forEach(input => {
        const isEditable = input.getAttribute('contenteditable') === 'true';
        input.addEventListener('input', (e) => {
          const field = e.target.getAttribute('data-field');
          block[field] = isEditable ? e.target.innerHTML : e.target.value;
          renderPreview();
          if (field === 'title' || field === 'height') {
            renderBlockList();
          }
        });
      });

      // Attach dynamic listeners for card items
      formContainer.querySelectorAll('.item-field').forEach(input => {
        const isEditable = input.getAttribute('contenteditable') === 'true';
        input.addEventListener('input', (e) => {
          const cardItem = e.target.closest('.block-card-item');
          const itemIndex = parseInt(cardItem.getAttribute('data-item-index'));
          const field = e.target.getAttribute('data-field');
          if (block.items && block.items[itemIndex]) {
            block.items[itemIndex][field] = isEditable ? e.target.innerHTML : e.target.value;
            renderPreview();
          }
        });
      });

      // Attach select listeners
      formContainer.querySelectorAll('select.item-field, select.challenge-field').forEach(select => {
        select.addEventListener('change', (e) => {
          const cardItem = e.target.closest('.block-card-item');
          const itemIndex = parseInt(cardItem.getAttribute('data-item-index'));
          const field = e.target.getAttribute('data-field');
          if (cardItem.classList.contains('ctf-challenge-item')) {
            if (block.challenges && block.challenges[itemIndex]) {
              block.challenges[itemIndex][field] = e.target.value;
            }
          } else if (block.items && block.items[itemIndex]) {
            block.items[itemIndex][field] = e.target.value;
          }
          renderPreview();
        });
      });

      // Attach topics textareas listener
      formContainer.querySelectorAll('.topics-field').forEach(textarea => {
        textarea.addEventListener('input', (e) => {
          const cardItem = e.target.closest('.block-card-item');
          const itemIndex = parseInt(cardItem.getAttribute('data-item-index'));
          const lines = e.target.value.split('\n').map(line => line.trim()).filter(line => line.length > 0);
          if (block.items && block.items[itemIndex]) {
            block.items[itemIndex].topics = lines;
            renderPreview();
          }
        });
      });

      // Attach delete card item listeners (for features, phases, timeline)
      formContainer.querySelectorAll('.delete-card-item').forEach(btn => {
        btn.addEventListener('click', (e) => {
          const itemIndex = parseInt(e.target.getAttribute('data-item-index'));
          if (block.items) {
            block.items.splice(itemIndex, 1);
            renderActiveBlockForm();
            renderPreview();
            renderBlockList();
          }
        });
      });

      // Add item listener (for features, phases, timeline)
      const addCardItemBtn = formContainer.querySelector('.add-card-item');
      if (addCardItemBtn) {
        addCardItemBtn.addEventListener('click', () => {
          if (!block.items) block.items = [];
          if (block.type === 'features') {
            block.items.push({
              tag: `TAG ${String(block.items.length + 1).padStart(2, '0')} //`,
              title: "새로운 카드 제목",
              desc: "카드 설명 내용",
              url: ""
            });
          } else if (block.type === 'phases') {
            block.items.push({
              phase: `Phase ${String(block.items.length + 1).padStart(2, '0')}`,
              title: "새로운 단계 제목",
              desc: "단계 설명 내용",
              topics: ["상세 주제 1"]
            });
          } else if (block.type === 'timeline') {
            block.items.push({
              week: `Week ${String(block.items.length + 1).padStart(2, '0')}`,
              title: "새로운 일정 주제",
              desc: "일정 설명 내용",
              presenter: "Presenter: 발표자"
            });
          }
          renderActiveBlockForm();
          renderPreview();
          renderBlockList();
        });
      }

      // CTF dashboard fields
      formContainer.querySelectorAll('.leaderboard-field').forEach(input => {
        input.addEventListener('input', (e) => {
          const cardItem = e.target.closest('.ctf-leaderboard-item');
          const idx = parseInt(cardItem.getAttribute('data-item-index'));
          const field = e.target.getAttribute('data-field');
          if (block.leaderboard && block.leaderboard[idx]) {
            block.leaderboard[idx][field] = e.target.value;
            renderPreview();
          }
        });
      });

      formContainer.querySelectorAll('.challenge-field').forEach(input => {
        input.addEventListener('input', (e) => {
          const cardItem = e.target.closest('.ctf-challenge-item');
          const idx = parseInt(cardItem.getAttribute('data-item-index'));
          const field = e.target.getAttribute('data-field');
          if (block.challenges && block.challenges[idx]) {
            block.challenges[idx][field] = e.target.value;
            renderPreview();
          }
        });
      });

      // Delete leaderboard item
      formContainer.querySelectorAll('.delete-leaderboard-item').forEach(btn => {
        btn.addEventListener('click', (e) => {
          const idx = parseInt(e.target.getAttribute('data-item-index'));
          if (block.leaderboard) {
            block.leaderboard.splice(idx, 1);
            renderActiveBlockForm();
            renderPreview();
          }
        });
      });

      // Add leaderboard item
      const addLeaderboardItemBtn = formContainer.querySelector('.add-leaderboard-item');
      if (addLeaderboardItemBtn) {
        addLeaderboardItemBtn.addEventListener('click', () => {
          if (!block.leaderboard) block.leaderboard = [];
          block.leaderboard.push({
            rank: `${block.leaderboard.length + 1}th`,
            user: "new_player",
            score: "0 PTS",
            status: "0 / 5 SOLVED"
          });
          renderActiveBlockForm();
          renderPreview();
        });
      }

      // Delete challenge item
      formContainer.querySelectorAll('.delete-challenge-item').forEach(btn => {
        btn.addEventListener('click', (e) => {
          const idx = parseInt(e.target.getAttribute('data-item-index'));
          if (block.challenges) {
            block.challenges.splice(idx, 1);
            renderActiveBlockForm();
            renderPreview();
          }
        });
      });

      // Add challenge item
      const addChallengeItemBtn = formContainer.querySelector('.add-challenge-item');
      if (addChallengeItemBtn) {
        addChallengeItemBtn.addEventListener('click', () => {
          if (!block.challenges) block.challenges = [];
          block.challenges.push({
            category: "WEB",
            title: "New Challenge",
            score: "100 PTS",
            status: "open"
          });
          renderActiveBlockForm();
          renderPreview();
        });
      }

      // -- menu_item listeners --
      const externalCheck = formContainer.querySelector('.block-external-check');
      if (externalCheck) {
        externalCheck.addEventListener('change', () => {
          block.external = externalCheck.checked;
          renderPreview();
          renderBlockList();
        });
      }

      const deleteLockCheck = formContainer.querySelector('.block-delete-lock-check');
      if (deleteLockCheck) {
        deleteLockCheck.addEventListener('change', () => {
          block.deleteLocked = deleteLockCheck.checked;
          renderPreview();
        });
      }

      // Submenu text field input listener
      formContainer.querySelectorAll('.submenu-field:not(.submenu-external-check)').forEach(input => {
        // Change handler triggers when focus is lost, ensuring proper formatting of local hash
        input.addEventListener('change', (e) => {
          const card = e.target.closest('.submenu-item');
          const idx = parseInt(card.getAttribute('data-item-index'));
          const field = e.target.getAttribute('data-field');
          if (block.submenus && block.submenus[idx] !== undefined) {
            let val = e.target.value.trim();
            if (field === 'url' && val) {
              const parentUrl = block.url || '#';
              // Check if URL is not external, does not start with #, and doesn't already contain parent fragment
              if (!val.startsWith('#') && !val.startsWith('http://') && !val.startsWith('https://')) {
                // Determine clean parent URL with '#' prefix
                const cleanParent = parentUrl.startsWith('#') ? parentUrl : '#' + parentUrl;
                val = `${cleanParent}/${val}`;
                e.target.value = val;
              }
            }
            block.submenus[idx][field] = val;
            renderPreview();
            if (field === 'title') renderBlockList();
          }
        });

        // Key/input listener for real-time text updates
        input.addEventListener('input', (e) => {
          const card = e.target.closest('.submenu-item');
          const idx = parseInt(card.getAttribute('data-item-index'));
          const field = e.target.getAttribute('data-field');
          if (block.submenus && block.submenus[idx] !== undefined) {
            block.submenus[idx][field] = e.target.value;
            renderPreview();
            if (field === 'title') renderBlockList();
          }
        });
      });

      // Submenu external checkbox
      formContainer.querySelectorAll('.submenu-external-check').forEach(check => {
        check.addEventListener('change', (e) => {
          const card = e.target.closest('.submenu-item');
          const idx = parseInt(card.getAttribute('data-item-index'));
          if (block.submenus && block.submenus[idx] !== undefined) {
            block.submenus[idx].external = e.target.checked;
            renderPreview();
          }
        });
      });

      // Delete submenu
      formContainer.querySelectorAll('.delete-submenu-item').forEach(btn => {
        btn.addEventListener('click', (e) => {
          const idx = parseInt(e.target.getAttribute('data-item-index'));
          if (block.submenus) {
            block.submenus.splice(idx, 1);
            renderActiveBlockForm();
            renderPreview();
          }
        });
      });

      // Add submenu
      const addSubmenuBtn = formContainer.querySelector('.add-submenu-item');
      if (addSubmenuBtn) {
        addSubmenuBtn.addEventListener('click', () => {
          if (!block.submenus) block.submenus = [];
          const parentUrl = block.url || '#';
          const defaultSubUrl = parentUrl.startsWith('#') ? `${parentUrl}/` : `#${parentUrl}/`;
          block.submenus.push({ title: '새 서브메뉴', url: defaultSubUrl, external: false });
          renderActiveBlockForm();
          renderPreview();
        });
      }
    }

    async function loadSectionMarkdown(sectionId) {
      try {
        const response = await fetch(`/admin/content/${sectionId}?_t=${Date.now()}`);
        if (response.ok) {
          const payload = await response.json();
          if (payload.ok && payload.data) {
            let content = payload.data.content || '';
            try {
              currentBlocks = JSON.parse(content);
              if (!Array.isArray(currentBlocks)) {
                currentBlocks = legacyFallback(currentBlocks, sectionId);
              }
            } catch (e) {
              console.error(e);
              currentBlocks = [];
            }
            activeBlockIndex = currentBlocks.length > 0 ? 0 : null;
            renderBlockList();
            renderActiveBlockForm();
            renderPreview(true);
            isDirty = false;
          }
        }
      } catch (e) {
        console.error(e);
        showToast('섹션 데이터를 가져오는데 실패했습니다.', 'error');
      }
    }

    // Workspace Columns Resizer Logic
    const workspaceGrid = document.querySelector('.overlay-workspace');
    const resizer1 = document.getElementById('admin-resizer-1');
    const resizer2 = document.getElementById('admin-resizer-2');

    if (workspaceGrid && resizer1 && resizer2) {
      // Define initial width variables (default matching style.css)
      let pane1Width = 260; // px
      let pane2Width = 550; // px
      const minPaneWidth = 150; // px
      const maxPaneWidth = 1000; // px

      // Set initial inline grid style so it starts cleanly
      workspaceGrid.style.gridTemplateColumns = `${pane1Width}px 6px ${pane2Width}px 6px 1fr`;

      // Helper to handle column dragging
      function initResizer(resizer, targetPaneIndex) {
        let startX = 0;
        let initialWidth = 0;

        const onMouseMove = (e) => {
          const deltaX = e.clientX - startX;
          let newWidth = initialWidth + deltaX;

          if (newWidth < minPaneWidth) newWidth = minPaneWidth;
          if (newWidth > maxPaneWidth) newWidth = maxPaneWidth;

          if (targetPaneIndex === 1) {
            pane1Width = newWidth;
          } else {
            pane2Width = newWidth;
          }

          workspaceGrid.style.gridTemplateColumns = `${pane1Width}px 6px ${pane2Width}px 6px 1fr`;
        };

        const onMouseUp = () => {
          document.body.classList.remove('resizing-active');
          resizer.classList.remove('active');
          document.removeEventListener('mousemove', onMouseMove);
          document.removeEventListener('mouseup', onMouseUp);
        };

        resizer.addEventListener('mousedown', (e) => {
          e.preventDefault();
          startX = e.clientX;
          initialWidth = targetPaneIndex === 1 ? pane1Width : pane2Width;

          document.body.classList.add('resizing-active');
          resizer.classList.add('active');

          document.addEventListener('mousemove', onMouseMove);
          document.addEventListener('mouseup', onMouseUp);
        });
      }

      // Initialize the resizers
      initResizer(resizer1, 1);
      initResizer(resizer2, 2);
    }

    if (saveBtn) {
      saveBtn.addEventListener('click', () => {
        const sectionId = selectSection.value;
        
        // Deep copy currentBlocks and clean any img-broken classes or titles in HTML fields
        const cleanedBlocks = JSON.parse(JSON.stringify(currentBlocks));
        const cleanHtml = (html) => {
          if (!html || typeof html !== 'string') return html;
          const temp = document.createElement('div');
          temp.innerHTML = html;
          temp.querySelectorAll('img').forEach(img => {
            img.classList.remove('img-broken');
            if (img.classList.length === 0) {
              img.removeAttribute('class');
            }
            if (img.getAttribute('title') && img.getAttribute('title').includes('불러올 수 없습니다')) {
              img.removeAttribute('title');
            }
          });
          return temp.innerHTML;
        };
        
        cleanedBlocks.forEach(block => {
          if (block.desc) block.desc = cleanHtml(block.desc);
          if (block.lead) block.lead = cleanHtml(block.lead);
          if (block.items) {
            block.items.forEach(item => {
              if (item.desc) item.desc = cleanHtml(item.desc);
            });
          }
        });

        const content_md = JSON.stringify(cleanedBlocks, null, 2);

        showSaveConfirmationModal(sectionId, async () => {
          showToast('저장 중...', 'info', 0);
          try {
            const res = await fetch('/admin/update-content', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ sectionId, content_md })
            });
            const data = await res.json();
            if (res.ok && data.ok) {
              showToast('컨텐츠가 안전하게 업데이트되었습니다!', 'success');
              isDirty = false;
              // If navigation was saved, refresh sidebar immediately and reload options
              if (sectionId === 'navigation') {
                renderSidebarNav(currentBlocks.filter(b => b.type === 'menu_item'));
                await updateEditSectionOptions();
              }
            } else {
              showToast(data.message || '저장 실패', 'error');
            }
          } catch (err) {
            console.error(err);
            showToast('서버 통신 오류', 'error');
          }
        });
      });
    }
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
        
        const isBlocked = user.is_blocked === 1;
        const blockText = isBlocked ? '해제' : '차단';
        const blockColor = isBlocked ? '#10b981' : '#f59e0b';
        const blockBorder = isBlocked ? 'rgba(16, 185, 129, 0.4)' : 'rgba(245, 158, 11, 0.4)';

        userRow.innerHTML = `
          <div style="flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; padding-right: 8px; ${isBlocked ? 'text-decoration: line-through; color: #64748b;' : ''}">${user.username}</div>
          <div style="flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; padding-right: 8px; ${isBlocked ? 'color: #64748b;' : ''}">
            ${user.name} ${isBlocked ? '<span style="font-size: 0.65rem; color: #f59e0b; padding: 1px 4px; border: 1px solid rgba(245,158,11,0.3); border-radius: 3px; margin-left: 4px;">차단됨</span>' : ''}
          </div>
          <div style="width: 110px; display: flex; gap: 4px; justify-content: center;">
            <button class="block-user-btn action-btn" style="padding: 3px 6px; font-size: 0.7rem; border-color: ${blockBorder}; color: ${blockColor};">${blockText}</button>
            <button class="delete-user-btn action-btn" style="padding: 3px 6px; font-size: 0.7rem; border-color: rgba(239, 68, 68, 0.4); color: #ef4444;">삭제</button>
          </div>
        `;

        // Block/Unblock Button Event Listener
        const blockBtn = userRow.querySelector('.block-user-btn');
        blockBtn.addEventListener('click', async () => {
          const actionWord = isBlocked ? '차단 해제' : '차단';
          if (confirm(`정말로 사용자 '${user.username}' (${user.name}) 계정을 ${actionWord}하시겠습니까?`)) {
            showToast(`${actionWord} 처리 중...`, 'info', 0);
            try {
              const blockRes = await fetch('/admin/block-user', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id: user.id, username: user.username, is_blocked: !isBlocked })
              });
              const blockData = await blockRes.json();
              if (blockRes.ok && blockData.ok) {
                showToast(`사용자 계정이 ${actionWord}되었습니다.`, 'success');
                loadUserList();
              } else {
                showToast(blockData.message || '처리 실패', 'error');
              }
            } catch (err) {
              console.error(err);
              showToast('서버 통신 오류', 'error');
            }
          }
        });

        // Delete Button Event Listener
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

  // CSV file parsing function
  function parseCSV(text) {
    const lines = text.split(/\r?\n/);
    const users = [];
    
    let startIdx = 0;
    if (lines.length > 0) {
      const firstLine = lines[0].toLowerCase();
      if (firstLine.includes('username') || firstLine.includes('name') || firstLine.includes('password') || firstLine.includes('아이디') || firstLine.includes('이름') || firstLine.includes('비밀번호')) {
        startIdx = 1;
      }
    }

    for (let i = startIdx; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;
      
      const parts = [];
      let current = '';
      let inQuotes = false;
      for (let c = 0; c < line.length; c++) {
        const char = line[c];
        if (char === '"') {
          inQuotes = !inQuotes;
        } else if (char === ',' && !inQuotes) {
          parts.push(current.trim());
          current = '';
        } else {
          current += char;
        }
      }
      parts.push(current.trim());

      if (parts.length >= 3) {
        const cleanParts = parts.map(p => p.replace(/^"|"$/g, ''));
        users.push({
          username: cleanParts[0],
          name: cleanParts[1],
          password: cleanParts[2]
        });
      }
    }
    return users;
  }

  // CSV upload handler
  const csvForm = document.getElementById('admin-csv-upload-form');
  const csvFileInput = document.getElementById('admin-csv-file');
  const csvResultDiv = document.getElementById('admin-csv-result');

  if (csvForm) {
    csvForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      
      const file = csvFileInput.files[0];
      if (!file) {
        showToast('파일을 선택해 주세요.', 'error');
        return;
      }

      showToast('CSV 파일 분석 중...', 'info', 0);
      
      const reader = new FileReader();
      reader.onload = async (event) => {
        try {
          const text = event.target.result;
          const parsedUsers = parseCSV(text);
          
          if (parsedUsers.length === 0) {
            showToast('등록 가능한 사용자 데이터가 존재하지 않습니다.', 'error');
            if (csvResultDiv) {
              csvResultDiv.style.display = 'block';
              csvResultDiv.style.backgroundColor = 'rgba(239, 68, 68, 0.15)';
              csvResultDiv.style.border = '1px solid rgba(239, 68, 68, 0.3)';
              csvResultDiv.style.color = '#f87171';
              csvResultDiv.textContent = 'CSV 파일에서 유효한 사용자 행을 찾을 수 없습니다. (헤더 제외 최소 1개 행 필요)';
            }
            return;
          }

          showToast(`${parsedUsers.length}명의 사용자 업로드 중...`, 'info', 0);

          const res = await fetch('/admin/register-users-bulk', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ users: parsedUsers })
          });
          
          const data = await res.json();
          if (res.ok && data.ok) {
            showToast(data.message || '일괄 등록 성공', 'success');
            
            if (csvResultDiv) {
              csvResultDiv.style.display = 'block';
              csvResultDiv.style.backgroundColor = 'rgba(16, 185, 129, 0.15)';
              csvResultDiv.style.border = '1px solid rgba(16, 185, 129, 0.3)';
              csvResultDiv.style.color = '#34d399';
              
              let resultHtml = `<strong>${data.message}</strong>`;
              if (data.data && data.data.failures && data.data.failures.length > 0) {
                resultHtml += `<div style="margin-top: 5px; max-height: 100px; overflow-y: auto; font-size: 0.7rem; color: #f87171;">`;
                data.data.failures.forEach(f => {
                  resultHtml += `<div>- ${f.username}: ${f.reason}</div>`;
                });
                resultHtml += `</div>`;
              }
              csvResultDiv.innerHTML = resultHtml;
            }
            
            csvForm.reset();
            loadUserList();
          } else {
            showToast(data.message || '등록 실패', 'error');
            if (csvResultDiv) {
              csvResultDiv.style.display = 'block';
              csvResultDiv.style.backgroundColor = 'rgba(239, 68, 68, 0.15)';
              csvResultDiv.style.border = '1px solid rgba(239, 68, 68, 0.3)';
              csvResultDiv.style.color = '#f87171';
              csvResultDiv.textContent = data.message || '일괄 등록에 실패했습니다.';
            }
          }
        } catch (err) {
          console.error(err);
          showToast('CSV 파일 처리 오류', 'error');
        }
      };
      
      reader.onerror = () => {
        showToast('파일 읽기 실패', 'error');
      };
      
      reader.readAsText(file, 'utf-8');
    });
  }

  // Helper to insert a DOM node at the current cursor selection inside contenteditable editor
  function insertNodeAtSelection(editor, node, savedRange) {
    if (savedRange) {
      const sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(savedRange);
    }
    
    const sel = window.getSelection();
    if (sel.rangeCount > 0) {
      const range = sel.getRangeAt(0);
      
      let containerNode = range.commonAncestorContainer;
      if (containerNode.nodeType === 3) containerNode = containerNode.parentNode;
      
      if (editor.contains(containerNode)) {
        range.deleteContents();
        range.insertNode(node);
        
        range.setStartAfter(node);
        range.setEndAfter(node);
        sel.removeAllRanges();
        sel.addRange(range);
      } else {
        editor.appendChild(node);
      }
    } else {
      editor.appendChild(node);
    }
    
    editor.dispatchEvent(new Event('input', { bubbles: true }));
  }

  // Formatting toolbar creation and mounting helper for contenteditable editors
  function attachFormattingToolbars(container) {
    if (!container) return;
    const editors = container.querySelectorAll('.content-editor');
    
    editors.forEach(editor => {
      if (editor.previousElementSibling && editor.previousElementSibling.classList.contains('textarea-toolbar')) {
        return;
      }

      const toolbar = document.createElement('div');
      toolbar.className = 'textarea-toolbar';
      toolbar.style.cssText = "display: flex; gap: 6px; margin-bottom: 6px; padding: 6px; background: rgba(0, 0, 0, 0.25); border: 1px solid rgba(255, 255, 255, 0.08); border-radius: 4px; align-items: center; flex-wrap: wrap; position: relative; width: 100%; box-sizing: border-box;";

      const btnRow = document.createElement('div');
      btnRow.style.cssText = "display: flex; gap: 6px; align-items: center; flex-wrap: wrap;";
      toolbar.appendChild(btnRow);

      const inputPanel = document.createElement('div');
      inputPanel.className = 'toolbar-input-panel';
      inputPanel.style.cssText = "display: none; width: 100%; margin-top: 6px; padding: 6px; background: rgba(255, 255, 255, 0.03); border: 1px solid rgba(255, 255, 255, 0.08); border-radius: 3px; gap: 8px; align-items: center; flex-wrap: wrap; box-sizing: border-box;";
      toolbar.appendChild(inputPanel);

      let savedRange = null;
      function saveSelection() {
        const sel = window.getSelection();
        if (sel.rangeCount > 0) {
          const range = sel.getRangeAt(0);
          let containerNode = range.commonAncestorContainer;
          if (containerNode.nodeType === 3) containerNode = containerNode.parentNode;
          
          if (editor.contains(containerNode)) {
            savedRange = range.cloneRange();
            return;
          }
        }
        savedRange = null;
      }

      function showInputPanel(htmlContent, onApply) {
        inputPanel.innerHTML = htmlContent;
        inputPanel.style.display = 'flex';
        
        const cancelBtn = inputPanel.querySelector('.panel-cancel-btn');
        if (cancelBtn) {
          cancelBtn.addEventListener('click', () => {
            inputPanel.style.display = 'none';
            inputPanel.innerHTML = '';
            editor.focus();
          });
        }
        
        const applyBtn = inputPanel.querySelector('.panel-apply-btn');
        if (applyBtn) {
          applyBtn.addEventListener('click', () => {
            onApply();
            inputPanel.style.display = 'none';
            inputPanel.innerHTML = '';
          });
        }

        const firstInput = inputPanel.querySelector('input');
        if (firstInput) {
          firstInput.focus();
          firstInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              if (applyBtn) applyBtn.click();
            }
          });
        }
      }

      function createBtn(text, title, onClick) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.textContent = text;
        btn.title = title;
        btn.style.cssText = "padding: 3px 8px; font-size: 0.72rem; background: rgba(255, 255, 255, 0.05); border: 1px solid rgba(255, 255, 255, 0.15); border-radius: 3px; color: #e2e8f0; cursor: pointer; transition: all 0.2s;";
        btn.addEventListener('mouseenter', () => {
          btn.style.background = 'rgba(255, 255, 255, 0.1)';
          btn.style.borderColor = 'var(--color-cyan, #00f0ff)';
        });
        btn.addEventListener('mouseleave', () => {
          btn.style.background = 'rgba(255, 255, 255, 0.05)';
          btn.style.borderColor = 'rgba(255, 255, 255, 0.15)';
        });
        btn.addEventListener('mousedown', (e) => {
          saveSelection();
        });
        btn.addEventListener('click', onClick);
        return btn;
      }

      const boldBtn = createBtn('B', '굵게 (Bold)', (e) => {
        e.preventDefault();
        editor.focus();
        if (savedRange) {
          const sel = window.getSelection();
          sel.removeAllRanges();
          sel.addRange(savedRange);
        }
        document.execCommand('bold', false, null);
        editor.dispatchEvent(new Event('input', { bubbles: true }));
      });
      boldBtn.style.fontWeight = 'bold';

      const italicBtn = createBtn('I', '기울임 (Italic)', (e) => {
        e.preventDefault();
        editor.focus();
        if (savedRange) {
          const sel = window.getSelection();
          sel.removeAllRanges();
          sel.addRange(savedRange);
        }
        document.execCommand('italic', false, null);
        editor.dispatchEvent(new Event('input', { bubbles: true }));
      });
      italicBtn.style.fontStyle = 'italic';

      const sizeBtn = createBtn('📏 크기', '글씨 크기 (Font Size)', (e) => {
        e.preventDefault();
        const selectedText = savedRange ? savedRange.toString() : '';
        const modeHintHtml = selectedText.trim()
          ? `<div style="font-size: 0.65rem; color: var(--color-cyan, #00f0ff); margin-top: 4px; width: 100%;">선택한 텍스트 (${selectedText.length > 8 ? selectedText.substring(0, 8) + '...' : selectedText})의 크기를 변경합니다.</div>`
          : `<div style="font-size: 0.65rem; color: #94a3b8; margin-top: 4px; width: 100%;">현재 커서 위치부터 새로 작성할 글자의 크기를 지정합니다.</div>`;
        showInputPanel(`
          <div style="display: flex; gap: 6px; align-items: center; width: 100%;">
            <span style="font-size: 0.72rem; color: #94a3b8;">글씨 크기:</span>
            <input type="number" class="panel-input" value="18" min="8" max="72" style="width: 60px; padding: 2px 6px; font-size: 0.72rem; background: rgba(0,0,0,0.3); border: 1px solid rgba(255,255,255,0.15); color: #fff; border-radius: 2px;">
            <span style="font-size: 0.72rem; color: #94a3b8;">px</span>
            <button type="button" class="panel-apply-btn" style="padding: 2px 8px; font-size: 0.7rem; background: var(--color-cyan); color: #000; border: none; border-radius: 2px; cursor: pointer; font-weight: bold; margin-left: 6px;">적용</button>
            <button type="button" class="panel-cancel-btn" style="padding: 2px 8px; font-size: 0.7rem; background: #475569; color: #fff; border: none; border-radius: 2px; cursor: pointer;">취소</button>
          </div>
          ${modeHintHtml}
        `, () => {
          const val = parseInt(inputPanel.querySelector('.panel-input').value.trim(), 10);
          if (val && !isNaN(val)) {
            const span = document.createElement('span');
            span.style.fontSize = `${val}px`;
            
            if (savedRange && !savedRange.collapsed) {
              const fragment = savedRange.cloneContents();
              span.appendChild(fragment);
              insertNodeAtSelection(editor, span, savedRange);
            } else {
              span.innerHTML = '&#8203;'; // zero-width space
              insertNodeAtSelection(editor, span, savedRange);
              
              // Place cursor inside the empty span
              const sel = window.getSelection();
              const range = document.createRange();
              range.selectNodeContents(span);
              range.collapse(false);
              sel.removeAllRanges();
              sel.addRange(range);
            }
          }
        });
      });

      const linkBtn = createBtn('🔗 링크', '하이퍼링크 (Link)', (e) => {
        e.preventDefault();
        const selectedText = savedRange ? savedRange.toString() : '';
        showInputPanel(`
          <span style="font-size: 0.72rem; color: #94a3b8;">URL:</span>
          <input type="text" class="panel-url-input" placeholder="https://example.com" style="width: 150px; padding: 2px 6px; font-size: 0.72rem; background: rgba(0,0,0,0.3); border: 1px solid rgba(255,255,255,0.15); color: #fff; border-radius: 2px;">
          <span style="font-size: 0.72rem; color: #94a3b8;">텍스트:</span>
          <input type="text" class="panel-text-input" value="${selectedText}" placeholder="링크 텍스트" style="width: 100px; padding: 2px 6px; font-size: 0.72rem; background: rgba(0,0,0,0.3); border: 1px solid rgba(255,255,255,0.15); color: #fff; border-radius: 2px;">
          <button type="button" class="panel-apply-btn" style="padding: 2px 8px; font-size: 0.7rem; background: var(--color-cyan); color: #000; border: none; border-radius: 2px; cursor: pointer; font-weight: bold;">적용</button>
          <button type="button" class="panel-cancel-btn" style="padding: 2px 8px; font-size: 0.7rem; background: #475569; color: #fff; border: none; border-radius: 2px; cursor: pointer;">취소</button>
        `, () => {
          let url = inputPanel.querySelector('.panel-url-input').value.trim();
          const textVal = inputPanel.querySelector('.panel-text-input').value.trim();
          if (url) {
            if (!/^https?:\/\//i.test(url)) {
              url = 'https://' + url;
            }
            const a = document.createElement('a');
            a.href = url;
            a.target = '_blank';
            a.style.cssText = "color: var(--color-cyan, #00f0ff); text-decoration: underline;";
            a.textContent = textVal || url;
            insertNodeAtSelection(editor, a, savedRange);
          }
        });
      });

      const imgUrlBtn = createBtn('🖼️ 이미지 URL', '이미지 링크 삽입 (Image URL)', (e) => {
        e.preventDefault();
        showInputPanel(`
          <span style="font-size: 0.72rem; color: #94a3b8;">이미지 URL:</span>
          <input type="text" class="panel-input" placeholder="https://example.com/image.png" style="width: 200px; padding: 2px 6px; font-size: 0.72rem; background: rgba(0,0,0,0.3); border: 1px solid rgba(255,255,255,0.15); color: #fff; border-radius: 2px;">
          <button type="button" class="panel-apply-btn" style="padding: 2px 8px; font-size: 0.7rem; background: var(--color-cyan); color: #000; border: none; border-radius: 2px; cursor: pointer; font-weight: bold;">적용</button>
          <button type="button" class="panel-cancel-btn" style="padding: 2px 8px; font-size: 0.7rem; background: #475569; color: #fff; border: none; border-radius: 2px; cursor: pointer;">취소</button>
        `, () => {
          let val = inputPanel.querySelector('.panel-input').value.trim();
          if (val) {
            if (!/^https?:\/\//i.test(val)) {
              val = 'https://' + val;
            }
            const img = document.createElement('img');
            img.src = val;
            img.style.cssText = "max-width: 100%; border-radius: 4px; display: block; margin: 10px 0;";
            insertNodeAtSelection(editor, img, savedRange);

            // Register error handler to style immediately
            img.onerror = () => {
              img.classList.add('img-broken');
              img.title = "이미지를 불러올 수 없습니다 (클릭 선택 후 Delete로 삭제)";
            };
          }
        });
      });

      const fileInput = document.createElement('input');
      fileInput.type = 'file';
      fileInput.accept = 'image/*';
      fileInput.style.display = 'none';
      
      fileInput.addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        showToast('이미지 업로드 중...', 'info', 0);
        
        const reader = new FileReader();
        reader.onload = async (event) => {
          try {
            const res = await fetch('/admin/upload-image', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                filename: file.name,
                fileData: event.target.result
              })
            });
            const data = await res.json();
            if (res.ok && data.ok && data.data && data.data.url) {
              showToast('이미지 업로드 성공!', 'success');
              const img = document.createElement('img');
              img.src = data.data.url;
              img.style.cssText = "max-width: 100%; border-radius: 4px; display: block; margin: 10px 0;";
              insertNodeAtSelection(editor, img, savedRange);
              
              img.onerror = () => {
                img.classList.add('img-broken');
                img.title = "이미지를 불러올 수 없습니다 (클릭 선택 후 Delete로 삭제)";
              };
            } else {
              showToast(data.message || '이미지 업로드 실패', 'error');
            }
          } catch (err) {
            console.error(err);
            showToast('서버 통신 오류', 'error');
          }
        };
        reader.readAsDataURL(file);
      });

      const imgUploadBtn = createBtn('📤 이미지 업로드', '이미지 파일 업로드 (Upload Image)', (e) => {
        e.preventDefault();
        saveSelection();
        fileInput.click();
      });

      btnRow.appendChild(boldBtn);
      btnRow.appendChild(italicBtn);
      btnRow.appendChild(sizeBtn);
      btnRow.appendChild(linkBtn);
      btnRow.appendChild(imgUrlBtn);
      btnRow.appendChild(imgUploadBtn);
      btnRow.appendChild(fileInput);

      editor.parentNode.insertBefore(toolbar, editor);

      // Capture error events on images in the content editor to style broken images
      editor.addEventListener('error', (e) => {
        if (e.target && e.target.tagName === 'IMG') {
          e.target.classList.add('img-broken');
          e.target.title = "이미지를 불러올 수 없습니다 (클릭 선택 후 Delete로 삭제)";
        }
      }, true); // Capture phase is required since 'error' does not bubble

      // Scan for already broken/loading images inside this editor
      const scanBrokenImages = () => {
        editor.querySelectorAll('img').forEach(img => {
          if (img.classList.contains('img-broken')) return;
          if (img.complete) {
            if (img.naturalWidth === 0) {
              img.classList.add('img-broken');
              img.title = "이미지를 불러올 수 없습니다 (클릭 선택 후 Delete로 삭제)";
            }
          } else {
            img.onerror = () => {
              img.classList.add('img-broken');
              img.title = "이미지를 불러올 수 없습니다 (클릭 선택 후 Delete로 삭제)";
            };
          }
        });
      };
      // Scan initially and on content updates/input
      setTimeout(scanBrokenImages, 300);
      editor.addEventListener('input', scanBrokenImages);
    });
  }

  // Trigger initial list load
  loadUserList();
}