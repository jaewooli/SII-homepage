import { showToast } from "/assets/js/toast.js";
import { apiRequest } from "/assets/js/api.js";

// ── Sidebar navigation (shared with dreamhack.js pattern) ──────────────────

function renderSidebarNav(menuItems) {
  const navList = document.getElementById('sidebar-nav-list');
  if (!navList) return;
  navList.innerHTML = '';

  menuItems.forEach(item => {
    if (item.type !== 'menu_item') return;
    const li = document.createElement('li');
    li.style.position = 'relative';
    const hasSubmenu = item.submenus && item.submenus.length > 0;
    if (hasSubmenu) li.classList.add('has-submenu');

    const a = document.createElement('a');
    let resolvedUrl = item.url || '#';
    if (resolvedUrl.startsWith('#') && resolvedUrl !== '#') {
      resolvedUrl = `/${resolvedUrl.replace(/^#/, '')}`;
    }
    a.href = resolvedUrl;
    a.className = 'nav-item-link';
    a.textContent = item.title;
    if (item.external) { a.target = '_blank'; a.rel = 'noopener noreferrer'; }
    if (window.location.pathname === resolvedUrl) a.classList.add('active');
    li.appendChild(a);

    if (hasSubmenu) {
      const toggle = document.createElement('span');
      toggle.className = 'submenu-toggle';
      toggle.innerHTML = '<span>›</span>';
      toggle.addEventListener('click', e => {
        e.stopPropagation();
        e.preventDefault();
        if (window.innerWidth > 1100 || window.innerWidth <= 500) {
          li.classList.toggle('open');
        }
      });
      li.appendChild(toggle);

      const subUl = document.createElement('ul');
      subUl.className = 'submenu';
      item.submenus.forEach(sub => {
        const subLi = document.createElement('li');
        const subA = document.createElement('a');
        let resolvedSub = sub.url || '#';
        if (resolvedSub.startsWith('#') && resolvedSub !== '#') resolvedSub = `/${resolvedSub.replace(/^#/, '')}`;
        subA.href = resolvedSub;
        subA.className = 'nav-item-link';
        subA.textContent = sub.title;
        if (sub.external) { subA.target = '_blank'; subA.rel = 'noopener noreferrer'; }
        subLi.appendChild(subA);
        subUl.appendChild(subLi);
      });
      li.appendChild(subUl);

      const isPureCategory = !item.url || item.url === '#';
      a.addEventListener('click', e => {
        if (isPureCategory) {
          e.preventDefault();
          if (window.innerWidth > 1100 || window.innerWidth <= 500) {
            li.classList.toggle('open');
          }
        } else {
          if (window.innerWidth > 1100 || window.innerWidth <= 500) {
            li.classList.add('open');
          }
        }
      });
    }
    navList.appendChild(li);
  });

  // Admin panel link
  if (window.__currentUser && window.__currentUser.isAdmin && !document.getElementById('nav-admin-link')) {
    const adminLi = document.createElement('li');
    adminLi.innerHTML = `<a href="/admin" id="nav-admin-link" class="nav-item-link" style="color:#ff4b4b;border-left:2px solid #ff4b4b;font-weight:700;">Admin Panel</a>`;
    navList.appendChild(adminLi);
  }
}

async function loadSidebarNavigation() {
  try {
    const res = await fetch('/navigation');
    if (res.ok) {
      const payload = await res.json();
      if (payload.ok && payload.data) { renderSidebarNav(payload.data); return; }
    }
    const fallback = await fetch('/frags/navigation.json');
    if (fallback.ok) {
      const menuItems = await fallback.json();
      const user = window.__currentUser;
      const role = !user ? 'guest' : (user.isAdmin ? 'admin' : 'member');
      const filtered = menuItems.filter(item => {
        const allowed = item.allowedRoles || ['guest', 'member', 'admin'];
        return allowed.includes(role);
      }).map(item => {
        const newItem = { ...item };
        if (newItem.submenus) newItem.submenus = newItem.submenus.filter(sub => {
          const allowed = sub.allowedRoles || ['guest', 'member', 'admin'];
          return allowed.includes(role);
        });
        return newItem;
      });
      renderSidebarNav(filtered);
    }
  } catch (err) {
    console.warn('[Nav] Failed to load navigation:', err.message);
  }
}

// ── Render user profile ────────────────────────────────────────────────────

function getInitials(name, username) {
  if (name && name.trim()) return name.trim()[0].toUpperCase();
  if (username) return username[0].toUpperCase();
  return '?';
}

function renderProfile(user) {
  const avatar   = document.getElementById('profile-avatar');
  const nameEl   = document.getElementById('profile-name');
  const userEl   = document.getElementById('profile-username');
  const badgeEl  = document.getElementById('profile-badge');
  const infoUser = document.getElementById('info-username');
  const infoName = document.getElementById('info-name');
  const infoRole = document.getElementById('info-role');

  if (!user) {
    nameEl.textContent = '로그인이 필요합니다.';
    return;
  }

  const displayName = user.name || user.username;
  avatar.textContent = getInitials(user.name, user.username);
  nameEl.textContent = displayName;
  userEl.textContent = `@${user.username}`;

  if (user.isSuperAdmin) {
    badgeEl.textContent = '최고 관리자';
    badgeEl.className = 'profile-badge badge-super';
  } else if (user.isAdmin) {
    badgeEl.textContent = '관리자';
    badgeEl.className = 'profile-badge badge-admin';
  } else {
    badgeEl.textContent = '일반 회원';
    badgeEl.className = 'profile-badge badge-member';
  }

  if (infoUser) infoUser.textContent = user.username;
  if (infoName) infoName.textContent = user.name || '—';
  if (infoRole) {
    infoRole.textContent = user.isSuperAdmin ? '최고 관리자 (Super Admin)' :
                           user.isAdmin      ? '관리자 (Admin)' : '일반 회원 (Member)';
  }
}

// ── Password strength meter ────────────────────────────────────────────────

function measureStrength(pw) {
  let score = 0;
  if (pw.length >= 8)  score++;
  if (pw.length >= 12) score++;
  if (/[a-z]/.test(pw)) score++;
  if (/[A-Z]/.test(pw)) score++;
  if (/\d/.test(pw))    score++;
  if (/[^a-zA-Z\d]/.test(pw)) score++;
  return score; // 0–6
}

function updateStrengthUI(pw) {
  const fill  = document.getElementById('pw-strength-fill');
  const label = document.getElementById('pw-strength-label');
  if (!fill || !label) return;

  const score = measureStrength(pw);
  const pct   = Math.round((score / 6) * 100);
  fill.style.width = pw.length ? `${pct}%` : '0%';

  if (!pw.length) { fill.style.background = ''; label.textContent = ''; return; }

  if (score <= 2)      { fill.style.background = '#ef4444'; label.textContent = '취약'; label.style.color = '#ef4444'; }
  else if (score <= 4) { fill.style.background = '#f59e0b'; label.textContent = '보통'; label.style.color = '#f59e0b'; }
  else                 { fill.style.background = '#22c55e'; label.textContent = '강함'; label.style.color = '#22c55e'; }
}

// ── Change password form ────────────────────────────────────────────────────

function initPasswordForm() {
  const newPwInput = document.getElementById('new-pw');
  if (newPwInput) {
    newPwInput.addEventListener('input', () => updateStrengthUI(newPwInput.value));
  }

  const form = document.getElementById('change-pw-form');
  if (!form) return;

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = document.getElementById('change-pw-btn');
    const currentPassword = document.getElementById('cur-pw').value.trim();
    const newPassword     = document.getElementById('new-pw').value;
    const confirmPassword = document.getElementById('confirm-pw').value;

    if (!currentPassword || !newPassword || !confirmPassword) {
      showToast('모든 필드를 입력해 주세요.', 'error');
      return;
    }
    if (newPassword !== confirmPassword) {
      showToast('새 비밀번호와 확인 비밀번호가 일치하지 않습니다.', 'error');
      return;
    }
    if (newPassword === currentPassword) {
      showToast('새 비밀번호는 현재 비밀번호와 달라야 합니다.', 'error');
      return;
    }

    btn.disabled = true;
    btn.textContent = '변경 중...';

    try {
      const res = await apiRequest('/change-password', 'POST', { currentPassword, newPassword });
      if (res.ok) {
        showToast('비밀번호가 성공적으로 변경되었습니다!', 'success');
        form.reset();
        updateStrengthUI('');
      } else {
        showToast(res.message || '비밀번호 변경에 실패했습니다.', 'error');
      }
    } catch (err) {
      showToast('서버 통신 오류가 발생했습니다.', 'error');
    } finally {
      btn.disabled = false;
      btn.textContent = '비밀번호 변경';
    }
  });
}

document.addEventListener('DOMContentLoaded', async () => {
  const res = await apiRequest('/me', 'GET');
  const user = res.ok ? res.data : null;

  if (!user) {
    // Not logged in → redirect to login
    location.href = '/login';
    return;
  }

  window.__currentUser = user;
  renderProfile(user);
  await loadSidebarNavigation();
  initPasswordForm();
});
