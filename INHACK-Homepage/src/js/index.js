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
    return text.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
  }

  // Handle legacy fallback
  if (!Array.isArray(data)) {
    const legacyBlocks = [];
    if (sectionId === 'home') {
      if (data.banner) legacyBlocks.push({ type: 'banner', ...data.banner });
      if (data.features) legacyBlocks.push({ type: 'features', items: data.features });
      if (data.links) legacyBlocks.push({ type: 'links', items: data.links });
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
      else if (block.type === 'links') {
        let linksHtml = '';
        (block.items || []).forEach(l => {
          if (l.url) {
            linksHtml += `<a href="${l.url}" target="_blank" rel="noopener noreferrer" style="text-decoration: none;">
<div class="feat-card" style="height: 100%; border: 1px solid rgba(59, 130, 246, 0.15);">
<div class="feat-card-header">
<span class="feat-card-id">${l.tag}</span>
<h4 style="color: var(--color-cyan);">${l.title}</h4>
</div>
<p>${renderInline(l.desc)}</p>
</div>
</a>\n`;
          } else {
            linksHtml += `<div class="feat-card">
<div class="feat-card-header">
<span class="feat-card-id">${l.tag}</span>
<h4>${l.title}</h4>
</div>
<p>${renderInline(l.desc)}</p>
</div>\n`;
          }
        });
        htmlResult += `<div class="features-grid" style="margin-top: 1.75rem;">
${linksHtml}</div>\n`;
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
  const textareaMarkdown = document.getElementById('admin-edit-content') || document.getElementById('admin-edit-markdown');
  const previewArea = document.getElementById('admin-html-preview');
  const saveBtn = document.getElementById('admin-save-content-btn');
  const registerForm = document.getElementById('admin-register-form');

  if (selectSection && textareaMarkdown && previewArea) {
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

    function injectBlockTemplate(type) {
      const currentVal = textareaMarkdown.value;

      const templates = {
        banner: {
          type: "banner",
          title: "New Banner Title",
          lead: "This is a **lead text** that supports inline markdown.",
          desc: "Description text goes here."
        },
        header: {
          type: "header",
          title: "New Section Header",
          desc: "Section description goes here."
        },
        features: {
          type: "features",
          items: [
            {
              tag: "TAG 01 //",
              title: "Feature Title",
              desc: "Feature description detail."
            }
          ]
        },
        links: {
          type: "links",
          items: [
            {
              tag: "LINK //",
              title: "Link Description ↗",
              url: "https://example.com",
              desc: "Details about where this external link points."
            }
          ]
        },
        phases: {
          type: "phases",
          items: [
            {
              phase: "Phase 01",
              title: "Phase Title",
              desc: "What this phase covers.",
              topics: [
                "Detailed Topic 1",
                "Detailed Topic 2"
              ]
            }
          ]
        },
        timeline: {
          type: "timeline",
          items: [
            {
              week: "Week 01",
              title: "Topic/Title",
              desc: "Summary of activities.",
              presenter: "Presenter: Name"
            }
          ]
        },
        ctf_dashboard: {
          type: "ctf_dashboard",
          leaderboard: [
            {
              rank: "1st 🥇",
              user: "alice",
              score: "1000 PTS",
              status: "5 / 5 SOLVED"
            }
          ],
          challenges: [
            {
              category: "WEB",
              title: "Super Simple SQL",
              score: "100 PTS",
              status: "solved"
            }
          ]
        }
      };

      const blockObj = templates[type];
      if (!blockObj) return;

      // If the editor is empty or just whitespace or empty array/object
      if (!currentVal.trim() || currentVal.trim() === '[]' || currentVal.trim() === '{}') {
        textareaMarkdown.value = JSON.stringify([blockObj], null, 2);
        renderPreview(textareaMarkdown.value);
        showToast(`새로운 ${type} 블록이 추가되었습니다!`, 'success');
        return;
      }

      // Check if overall JSON is valid to give confidence
      try {
        JSON.parse(currentVal);
      } catch (e) {
        if (!confirm('현재 에디터에 올바르지 않은 JSON 데이터가 있습니다. 커서 위치에 강제로 텍스트를 삽입할까요? (그렇지 않으면 삽입이 취소됩니다)')) {
          return;
        }
      }

      const startPos = textareaMarkdown.selectionStart;
      const endPos = textareaMarkdown.selectionEnd;
      const beforeText = currentVal.substring(0, startPos);
      const afterText = currentVal.substring(endPos);

      // Stringify block
      let insertStr = JSON.stringify(blockObj, null, 2);
      
      // Indent block body
      insertStr = insertStr.split('\n').map((line, idx) => idx === 0 ? line : '  ' + line).join('\n');

      let prefix = '';
      let suffix = '';

      const trimmedBefore = beforeText.trim();
      const trimmedAfter = afterText.trim();

      if (trimmedBefore.endsWith('}')) {
        prefix = ',\n  ';
      } else if (trimmedBefore.endsWith('[')) {
        prefix = '\n  ';
      } else if (trimmedBefore && !trimmedBefore.endsWith(',') && !trimmedBefore.endsWith('[')) {
        prefix = ',\n  ';
      }

      if (trimmedAfter.startsWith('{')) {
        suffix = ',\n';
      } else if (trimmedAfter.startsWith(']')) {
        suffix = '\n';
      }

      const finalInsert = prefix + insertStr + suffix;

      textareaMarkdown.value = beforeText + finalInsert + afterText;
      
      // Focus and set selection range right after insertion
      const newCursorPos = startPos + finalInsert.length;
      textareaMarkdown.selectionStart = newCursorPos;
      textareaMarkdown.selectionEnd = newCursorPos;
      textareaMarkdown.focus();

      renderPreview(textareaMarkdown.value);
      showToast(`커서 위치에 ${type} 블록이 주입되었습니다!`, 'success');
    }

    selectSection.addEventListener('change', async () => {
      await loadSectionMarkdown(selectSection.value);
    });

    // Real-time Preview Logic (Validates JSON and draws preview)
    textareaMarkdown.addEventListener('input', () => {
      renderPreview(textareaMarkdown.value);
    });
  }

  function renderPreview(jsonText) {
    if (!previewArea) return;
    const sectionId = selectSection.value;
    
    try {
      const data = JSON.parse(jsonText);
      const htmlResult = clientCompileJsonToHtml(sectionId, data);
      previewArea.innerHTML = htmlResult;
      
      // Clear error highlights
      textareaMarkdown.style.borderColor = 'rgba(255, 255, 255, 0.08)';
      if (saveBtn) saveBtn.disabled = false;

      updateBlockListUI(data);
    } catch (err) {
      // Draw error message in the preview panel
      previewArea.innerHTML = `<div style="color: #ef4444; padding: 1.5rem; border: 1px dashed rgba(239, 68, 68, 0.3); border-radius: 6px; background: rgba(239, 68, 68, 0.05); font-family: monospace; font-size: 0.85rem;">
        <h4 style="margin-top: 0; margin-bottom: 0.5rem; text-transform: uppercase;">⚠️ JSON 문법 에러</h4>
        <p style="margin: 0; line-height: 1.5;">${err.message}</p>
        <p style="margin-top: 10px; margin-bottom: 0; font-size: 0.75rem; color: #94a3b8;">중괄호, 쉼표, 큰따옴표의 정렬이 올바른지 확인해 주세요.</p>
      </div>`;
      
      // Highlight editor border as error and block save
      textareaMarkdown.style.borderColor = '#ef4444';
      if (saveBtn) saveBtn.disabled = true;

      updateBlockListUI(null, err.message);
    }
  }

  function updateBlockListUI(blocks, errMsg) {
    const blockListContainer = document.getElementById('admin-block-list');
    if (!blockListContainer) return;
    
    if (errMsg) {
      blockListContainer.innerHTML = `<div style="color: #ef4444; font-size: 0.75rem; padding: 10px; text-align: center; border: 1px dashed rgba(239,68,68,0.2); border-radius: 4px;">
        ⚠️ JSON 에러 발생<br><span style="font-size: 0.65rem; color: #94a3b8; word-break: break-all;">${errMsg}</span>
      </div>`;
      return;
    }
    
    if (!blocks || !Array.isArray(blocks) || blocks.length === 0) {
      blockListContainer.innerHTML = '<div style="color: #64748b; font-size: 0.75rem; text-align: center; padding: 20px;">등록된 블록이 없습니다.</div>';
      return;
    }

    blockListContainer.innerHTML = '';
    blocks.forEach((block, index) => {
      const blockCard = document.createElement('div');
      blockCard.className = 'block-hierarchy-card';
      
      let titlePreview = '';
      let icon = '📦';
      if (block.type === 'banner') { icon = '📢'; titlePreview = block.title || ''; }
      else if (block.type === 'header') { icon = '🏷️'; titlePreview = block.title || ''; }
      else if (block.type === 'features') { icon = '🎴'; titlePreview = `카드 ${block.items?.length || 0}개`; }
      else if (block.type === 'links') { icon = '🔗'; titlePreview = `링크 ${block.items?.length || 0}개`; }
      else if (block.type === 'phases') { icon = '🗺️'; titlePreview = `단계 ${block.items?.length || 0}개`; }
      else if (block.type === 'timeline') { icon = '📅'; titlePreview = `아이템 ${block.items?.length || 0}개`; }
      else if (block.type === 'ctf_dashboard') { icon = '🏆'; titlePreview = '대시보드'; }

      if (titlePreview && titlePreview.length > 15) {
        titlePreview = titlePreview.substring(0, 15) + '...';
      }

      blockCard.innerHTML = `
        <div style="display: flex; flex-direction: column; flex: 1; min-width: 0; text-align: left;">
          <span style="font-size: 0.65rem; color: #64748b; font-family: monospace;">#${index + 1} ${block.type.toUpperCase()}</span>
          <span style="font-size: 0.75rem; color: #e2e8f0; font-weight: 500; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${icon} ${titlePreview || block.type}</span>
        </div>
        <div style="display: flex; gap: 4px; flex-shrink: 0; align-items: center;">
          <button type="button" class="hierarchy-btn move-up" data-index="${index}" title="위로 이동" style="padding: 4px 6px; font-size: 0.65rem; background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1); border-radius: 3px; color: #fff; cursor: pointer;">↑</button>
          <button type="button" class="hierarchy-btn move-down" data-index="${index}" title="아래로 이동" style="padding: 4px 6px; font-size: 0.65rem; background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1); border-radius: 3px; color: #fff; cursor: pointer;">↓</button>
          <button type="button" class="hierarchy-btn delete-block" data-index="${index}" title="삭제" style="padding: 4px 6px; font-size: 0.65rem; background: rgba(239, 68, 68, 0.1); border: 1px solid rgba(239, 68, 68, 0.3); border-radius: 3px; color: #ef4444; cursor: pointer;">🗑️</button>
        </div>
      `;
      blockListContainer.appendChild(blockCard);
    });

    blockListContainer.querySelectorAll('.move-up').forEach(btn => {
      btn.addEventListener('click', () => {
        const idx = parseInt(btn.getAttribute('data-index'));
        moveBlock(idx, -1);
      });
    });
    blockListContainer.querySelectorAll('.move-down').forEach(btn => {
      btn.addEventListener('click', () => {
        const idx = parseInt(btn.getAttribute('data-index'));
        moveBlock(idx, 1);
      });
    });
    blockListContainer.querySelectorAll('.delete-block').forEach(btn => {
      btn.addEventListener('click', () => {
        const idx = parseInt(btn.getAttribute('data-index'));
        deleteBlock(idx);
      });
    });
  }

  function moveBlock(idx, direction) {
    try {
      const data = JSON.parse(textareaMarkdown.value);
      if (!Array.isArray(data)) return;
      const targetIdx = idx + direction;
      if (targetIdx < 0 || targetIdx >= data.length) return;

      const temp = data[idx];
      data[idx] = data[targetIdx];
      data[targetIdx] = temp;

      textareaMarkdown.value = JSON.stringify(data, null, 2);
      renderPreview(textareaMarkdown.value);
      showToast('블록 순서가 변경되었습니다.', 'success');
    } catch (e) {
      showToast('순서 변경 실패: JSON이 올바르지 않습니다.', 'error');
    }
  }

  function deleteBlock(idx) {
    try {
      const data = JSON.parse(textareaMarkdown.value);
      if (!Array.isArray(data)) return;
      if (!confirm('정말로 이 블록을 삭제하시겠습니까?')) return;

      data.splice(idx, 1);

      textareaMarkdown.value = JSON.stringify(data, null, 2);
      renderPreview(textareaMarkdown.value);
      showToast('블록이 삭제되었습니다.', 'success');
    } catch (e) {
      showToast('삭제 실패: JSON이 올바르지 않습니다.', 'error');
    }
  }

  // JSON File Upload and Parse
  const fileInput = document.getElementById('admin-md-file');
  const fileTrigger = document.getElementById('admin-upload-trigger-btn');
  const filenameSpan = document.getElementById('admin-md-filename');

  if (fileTrigger && fileInput && textareaMarkdown) {
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
        const jsonText = e.target.result;
        textareaMarkdown.value = jsonText;
        renderPreview(jsonText);
        showToast('JSON 데이터 파일이 에디터에 로드되었습니다! 미리보기를 확인한 후 저장해 주세요.', 'success');
      };
      reader.readAsText(file);
    });
  }

  async function loadSectionMarkdown(sectionId) {
    try {
      const response = await fetch(`/admin/content/${sectionId}?_t=${Date.now()}`);
      if (response.ok) {
        const payload = await response.json();
        if (payload.ok && payload.data) {
          let content = payload.data.content || '';
          
          // Formats JSON with 2-spaces indent for readability
          try {
            const parsed = JSON.parse(content);
            content = JSON.stringify(parsed, null, 2);
          } catch (e) {}

          textareaMarkdown.value = content;
          renderPreview(content);
        }
      }
    } catch (e) {
      console.error('Failed to load section content:', e);
      showToast('섹션 데이터를 가져오는데 실패했습니다.', 'error');
    }
  }

  if (saveBtn) {
    saveBtn.addEventListener('click', () => {
      const sectionId = selectSection.value;
      const content_md = textareaMarkdown.value;

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