import { showToast } from '/assets/js/toast.js';
import { fetchMe } from '/assets/js/auth.js';

// Disable bold and italic markdown rendering on the client side
if (window.marked && window.marked.use) {
  window.marked.use({
    renderer: {
      strong(arg) {
        const text = (arg && typeof arg === 'object') ? arg.text : arg;
        return `**${text}**`;
      },
      em(arg) {
        const text = (arg && typeof arg === 'object') ? arg.text : arg;
        return `*${text}*`;
      }
    }
  });
}

const contentArea = document.getElementById('view');

// Helper to check if a specific fragment url exists in menu data
function checkIfMenuExists(menuItems, fragmentID) {
  if (!Array.isArray(menuItems)) return false;
  const target = fragmentID.toLowerCase();
  for (const item of menuItems) {
    const itemUrl = (item.url || '').replace(/^#/, '').replace(/^\//, '').toLowerCase();
    if (itemUrl === target) return true;
    if (item.submenus) {
      for (const sub of item.submenus) {
        const subUrl = (sub.url || '').replace(/^#/, '').replace(/^\//, '').toLowerCase();
        if (subUrl === target) return true;
      }
    }
  }
  return false;
}

async function loadContent(fragmentID){
  // 1. Resolve user role
  const user = await fetchMe();
  const role = !user ? 'guest' : (user.isAdmin ? 'admin' : 'member');
  const topFragment = fragmentID ? fragmentID.split('/')[0] : '';

  // 2. Explicit admin panel redirect
  if (topFragment === 'admin') {
    window.location.href = '/admin';
    return;
  }

  // 3. Dynamic route roles validation guard
  if (fragmentID) {
    let allowed = true;
    try {
      const res = await fetch('/navigation');
      if (res.ok) {
        const payload = await res.json();
        if (payload.ok && payload.data) {
          const allowedMenus = payload.data;
          
          // Check if this path exists in the filtered (allowed) menus
          const isAllowedInNav = checkIfMenuExists(allowedMenus, fragmentID);
          
          if (!isAllowedInNav) {
            // If it's not in the filtered menus, check if it actually exists in the global menu
            const fallback = await fetch('/frags/navigation.json');
            if (fallback.ok) {
              const allMenus = await fallback.json();
              const isActuallyAMenuItem = checkIfMenuExists(allMenus, fragmentID);
              if (isActuallyAMenuItem) {
                // It is a registered menu, but filtered out (meaning current role does not have access)
                allowed = false;
              }
            }
          }
        }
      }
    } catch (err) {
      console.warn('[Guard] Route authorization check bypassed due to network error:', err);
    }

    if (!allowed) {
      showToast('이 페이지에 접근할 권한이 없습니다.', 'error');
      window.location.hash = '#home';
      return;
    }
  }

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

    // Extract the fragment ID from the hash (supports "#fragment", "/#fragment", and "/homepage#fragment")
    let hashFragment = null;
    if (hash) {
      if (hash.startsWith('#')) {
        hashFragment = hash.substring(1);
      } else if (hash.startsWith('/#')) {
        hashFragment = hash.substring(2);
      } else if (hash.startsWith('/homepage#')) {
        hashFragment = hash.substring(10);
      }
    }

    const isExactMatch = hashFragment === fragmentID || (!fragmentID && (hash === '#' || hash === '' || hash === '/homepage' || hash === '/'));
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
        let subHashFragment = null;
        if (subHash) {
          if (subHash.startsWith('#')) {
            subHashFragment = subHash.substring(1);
          } else if (subHash.startsWith('/#')) {
            subHashFragment = subHash.substring(2);
          } else if (subHash.startsWith('/homepage#')) {
            subHashFragment = subHash.substring(10);
          }
        }
        if (subHashFragment === fragmentID) {
          subA.classList.add('active');
        }
      });
    } else {
      // Check if this is a direct submenu match (for external navigation)
      const subLinks = li.querySelectorAll('.submenu a');
      subLinks.forEach(subA => {
        const subHash = subA.getAttribute('href');
        let subHashFragment = null;
        if (subHash) {
          if (subHash.startsWith('#')) {
            subHashFragment = subHash.substring(1);
          } else if (subHash.startsWith('/#')) {
            subHashFragment = subHash.substring(2);
          } else if (subHash.startsWith('/homepage#')) {
            subHashFragment = subHash.substring(10);
          }
        }
        if (subHashFragment === fragmentID) {
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
    const res = await fetch(`/navigation`);
    if (res.ok) {
      const payload = await res.json();
      if (payload.ok && payload.data) {
        renderSidebarNav(payload.data);
        return;
      }
    }
    // Fallback: fetch raw JSON from static file and filter manually if API fails
    const fallback = await fetch('/frags/navigation.json');
    if (fallback.ok) {
      const menuItems = await fallback.json();
      const user = await fetchMe();
      const role = !user ? 'guest' : (user.isAdmin ? 'admin' : 'member');
      const filtered = menuItems.filter(item => {
        const allowed = item.allowedRoles || ['guest', 'member', 'admin'];
        return allowed.includes(role);
      }).map(item => {
        const newItem = { ...item };
        if (newItem.submenus && Array.isArray(newItem.submenus)) {
          newItem.submenus = newItem.submenus.filter(sub => {
            const allowed = sub.allowedRoles || ['guest', 'member', 'admin'];
            return allowed.includes(role);
          });
        }
        return newItem;
      });
      renderSidebarNav(filtered);
    }
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
    const isHomepage = window.location.pathname === '/' || window.location.pathname === '/homepage' || window.location.pathname === '/homepage/main';
    let resolvedUrl = item.url || '#';
    if (resolvedUrl.startsWith('#') && resolvedUrl !== '#') {
      resolvedUrl = isHomepage ? resolvedUrl : `/${resolvedUrl}`;
    }
    a.href = resolvedUrl;
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
        const isHomepage = window.location.pathname === '/' || window.location.pathname === '/homepage' || window.location.pathname === '/homepage/main';
        let resolvedSubUrl = sub.url || '#';
        if (resolvedSubUrl.startsWith('#') && resolvedSubUrl !== '#') {
          resolvedSubUrl = isHomepage ? resolvedSubUrl : `/${resolvedSubUrl}`;
        }
        subA.href = resolvedSubUrl;
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
    adminLi.innerHTML = `<a href="/admin" id="nav-admin-link" class="nav-item-link" style="color: #ff4b4b; border-left: 2px solid #ff4b4b; font-weight: 700;">Admin Panel</a>`;
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
        adminLi.innerHTML = `<a href="/admin" id="nav-admin-link" class="nav-item-link" style="color: #ff4b4b; border-left: 2px solid #ff4b4b; font-weight: 700;">Admin Panel</a>`;
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
