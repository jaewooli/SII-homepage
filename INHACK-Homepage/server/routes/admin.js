const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const fs = require('fs');
const path = require('path');
const db = require('../config/db');
const { compileJsonToHtml } = require('../helpers/template');
const { sendJson } = require('../helpers/response');

// Admin Route: Register a new user
router.post('/register-user', (req, res) => {
  if (!req.session.user || !req.session.user.isAdmin) {
    return sendJson(res, { status: 403, ok: false, message: 'Forbidden', code: 'FORBIDDEN' });
  }
  const { username, password, name, is_admin, adminPassword } = req.body;
  if (!username || !password || !name) {
    return sendJson(res, { status: 400, ok: false, message: '모든 필드(아이디, 비밀번호, 이름)를 입력해주세요.', code: 'BAD_REQUEST' });
  }

  const isAdminVal = (is_admin === true || is_admin === 1 || is_admin === 'true') ? 1 : 0;

  const env = require('../config/env');
  if (isAdminVal === 1) {
    const isSuperAdmin = (req.session.user.username === 'developer' || req.session.user.username === env.ADMIN_USERNAME || req.session.user.isSuperAdmin);
    if (!isSuperAdmin) {
      return sendJson(res, { status: 403, ok: false, message: '관리자 계정을 생성할 권한이 없습니다. (최고 관리자 권한 필요)', code: 'FORBIDDEN' });
    }

    if (!adminPassword) {
      return sendJson(res, { status: 400, ok: false, message: '관리자 계정을 생성하려면 본인(현재 관리자)의 비밀번호를 입력해야 합니다.', code: 'ADMIN_PASSWORD_REQUIRED' });
    }

    db.get(`SELECT password FROM users WHERE id = ?`, [req.session.user.id], (err, adminRow) => {
      if (err || !adminRow) {
        return sendJson(res, { status: 500, ok: false, message: '데이터베이스 조회 실패', code: 'DB_ERROR' });
      }
      const match = bcrypt.compareSync(adminPassword, adminRow.password);
      if (!match) {
        return sendJson(res, { status: 401, ok: false, message: '현재 관리자 비밀번호가 일치하지 않습니다.', code: 'INVALID_ADMIN_PASSWORD' });
      }
      performRegister(isAdminVal);
    });
  } else {
    performRegister(0);
  }

  function performRegister(adminFlag) {
    const hashedPassword = bcrypt.hashSync(password, 10);
    db.run(`INSERT INTO users (username, password, name, is_admin) VALUES (?, ?, ?, ?)`, [username, hashedPassword, name, adminFlag], (err) => {
      if (err) {
        if (err.message.includes('UNIQUE constraint failed')) {
          return sendJson(res, { status: 409, ok: false, message: '이미 존재하는 사용자 아이디입니다.', code: 'ALREADY_EXISTS' });
        }
        return sendJson(res, { status: 500, ok: false, message: '사용자 등록 실패', code: 'DB_ERROR' });
      }
      return sendJson(res, { status: 200, ok: true, message: `사용자 '${name}'(이)가 성공적으로 등록되었습니다.`, code: 'SUCCESS' });
    });
  }
});

// Admin Route: Get list of all users
router.get('/users', (req, res) => {
  if (!req.session.user || !req.session.user.isAdmin) {
    return sendJson(res, { status: 403, ok: false, message: 'Forbidden', code: 'FORBIDDEN' });
  }

  const env = require('../config/env');
  const superAdminUser = env.ADMIN_USERNAME || 'developer';

  db.all(
    `SELECT id, username, name, is_blocked, is_admin, 
            (SELECT COUNT(*) FROM dreamhack_solves s WHERE s.username = users.username) AS solve_count 
     FROM users 
     ORDER BY (username = 'developer' OR username = ?) DESC, id DESC`,
    [superAdminUser],
    (err, rows) => {
      if (err) {
        console.error('[Database Error] Failed to list users:', err.message);
        return sendJson(res, { status: 500, ok: false, message: '사용자 목록 조회 실패', code: 'DB_ERROR' });
      }
      let mappedRows = rows.map(row => {
        const isSuper = (row.username === 'developer' || row.username === env.ADMIN_USERNAME) ? 1 : 0;
        return {
          ...row,
          is_admin: isSuper ? 1 : row.is_admin,
          is_super_admin: isSuper
        };
      });

      // Filter other admins if requester is not a super admin
      const isRequesterSuper = (req.session.user.username === 'developer' || req.session.user.username === env.ADMIN_USERNAME || req.session.user.isSuperAdmin);
      if (!isRequesterSuper) {
        mappedRows = mappedRows.filter(row => {
          const isTargetAdmin = row.is_admin === 1 || row.is_super_admin === 1;
          const isSelf = row.username === req.session.user.username;
          return !isTargetAdmin || isSelf;
        });
      }

      sendJson(res, {
        status: 200,
        ok: true,
        data: mappedRows,
        code: 'SUCCESS'
      });
    });
});

// Admin Route: Get list of solves for a specific user
router.get('/user-solves/:username', (req, res) => {
  if (!req.session.user || !req.session.user.isAdmin) {
    return sendJson(res, { status: 403, ok: false, message: 'Forbidden', code: 'FORBIDDEN' });
  }
  const targetUsername = req.params.username;
  const env = require('../config/env');
  const isRequesterSuper = (req.session.user.username === 'developer' || req.session.user.username === env.ADMIN_USERNAME || req.session.user.isSuperAdmin);
  const isSelf = targetUsername === req.session.user.username;

  if (!isRequesterSuper && !isSelf) {
    // Check if target user is admin or super admin
    db.get('SELECT is_admin, username FROM users WHERE username = ?', [targetUsername], (err, row) => {
      if (err) {
        console.error('[Database Error] Failed to get user role for solves access validation:', err.message);
        return sendJson(res, { status: 500, ok: false, message: '데이터베이스 에러', code: 'DB_ERROR' });
      }
      if (!row) {
        return sendJson(res, { status: 404, ok: false, message: '해당 사용자를 찾을 수 없습니다.', code: 'NOT_FOUND' });
      }
      const isTargetSuper = (row.username === 'developer' || row.username === env.ADMIN_USERNAME);
      const isTargetAdmin = (row.is_admin === 1 || isTargetSuper);
      if (isTargetAdmin) {
        return sendJson(res, { status: 403, ok: false, message: '다른 관리자 계정의 문제 풀이 기록은 열람할 수 없습니다.', code: 'FORBIDDEN' });
      }
      fetchSolves();
    });
  } else {
    fetchSolves();
  }

  function fetchSolves() {
    db.all(
      `SELECT challenge_id, challenge_name, timestamp FROM dreamhack_solves WHERE username = ? ORDER BY timestamp DESC`,
      [targetUsername],
      (err, rows) => {
        if (err) {
          console.error('[Database Error] Failed to list user solves:', err.message);
          return sendJson(res, { status: 500, ok: false, message: '사용자 풀이 기록 조회 실패', code: 'DB_ERROR' });
        }
        sendJson(res, {
          status: 200,
          ok: true,
          data: rows,
          code: 'SUCCESS'
        });
      }
    );
  }
});

// Admin Route: Block/Unblock a user
router.post('/block-user', (req, res) => {
  if (!req.session.user || !req.session.user.isAdmin) {
    return sendJson(res, { status: 403, ok: false, message: 'Forbidden', code: 'FORBIDDEN' });
  }

  const { id, username, is_blocked } = req.body;
  if (!id && !username) {
    return sendJson(res, { status: 400, ok: false, message: '사용자 ID 또는 Username이 필요합니다.', code: 'BAD_REQUEST' });
  }

  const currentUsername = req.session.user.username;
  const targetSelector = id ? 'id = ?' : 'username = ?';
  const targetParam = id || username;
  const blockVal = is_blocked ? 1 : 0;

  db.get(`SELECT username, is_admin FROM users WHERE ${targetSelector}`, [targetParam], (err, row) => {
    if (err) {
      console.error('[Database Error] Failed to fetch user for block check validation:', err.message);
      return sendJson(res, { status: 500, ok: false, message: '데이터베이스 에러', code: 'DB_ERROR' });
    }
    if (!row) {
      return sendJson(res, { status: 404, ok: false, message: '해당 사용자를 찾을 수 없습니다.', code: 'NOT_FOUND' });
    }

    const env = require('../config/env');
    const targetUsername = row.username;
    const isTargetSuper = (targetUsername === 'developer' || targetUsername === env.ADMIN_USERNAME);
    const isTargetAdmin = (row.is_admin === 1 || isTargetSuper);

    // 1. 최고 관리자 및 본인 계정은 차단 불가
    if (isTargetSuper || targetUsername === currentUsername) {
      return sendJson(res, {
        status: 400,
        ok: false,
        message: '시스템 관리자 계정 및 본인의 계정은 차단할 수 없습니다.',
        code: 'NOT_ALLOWED'
      });
    }

    // 2. 대상이 관리자인데, 요청자가 최고 관리자가 아닌 경우 차단 불가
    const isRequesterSuper = (currentUsername === 'developer' || currentUsername === env.ADMIN_USERNAME || req.session.user.isSuperAdmin);
    if (isTargetAdmin && !isRequesterSuper) {
      return sendJson(res, {
        status: 403,
        ok: false,
        message: '일반 관리자는 다른 관리자 계정을 차단할 수 없습니다. (최고 관리자 권한 필요)',
        code: 'FORBIDDEN'
      });
    }

    performBlock(targetUsername);
  });

  function performBlock(targetUser) {
    db.run(`UPDATE users SET is_blocked = ? WHERE username = ?`, [blockVal, targetUser], function(err) {
      if (err) {
        console.error('[Database Error] Failed to block/unblock user:', err.message);
        return sendJson(res, { status: 500, ok: false, message: '사용자 차단 상태 변경 실패', code: 'DB_ERROR' });
      }
      sendJson(res, {
        status: 200,
        ok: true,
        message: `사용자가 성공적으로 ${blockVal ? '차단' : '차단 해제'}되었습니다.`,
        code: 'SUCCESS'
      });
    });
  }
});

// Admin Route: Register multiple users in bulk
router.post('/register-users-bulk', (req, res) => {
  if (!req.session.user || !req.session.user.isAdmin) {
    return sendJson(res, { status: 403, ok: false, message: 'Forbidden', code: 'FORBIDDEN' });
  }

  const { users } = req.body;
  if (!users || !Array.isArray(users) || users.length === 0) {
    return sendJson(res, { status: 400, ok: false, message: '등록할 사용자 목록이 비어있거나 올바르지 않습니다.', code: 'BAD_REQUEST' });
  }

  const results = {
    successCount: 0,
    failCount: 0,
    failures: []
  };

  let index = 0;

  function processNext() {
    if (index >= users.length) {
      const summaryMsg = `일괄 등록 완료 - 성공: ${results.successCount}명, 실패: ${results.failCount}명`;
      return sendJson(res, {
        status: 200,
        ok: true,
        message: summaryMsg,
        data: results,
        code: 'SUCCESS'
      });
    }

    const user = users[index];
    const username = (user.username || '').trim();
    const name = (user.name || '').trim();
    const password = (user.password || '').trim();

    if (!username || !name || !password) {
      results.failCount++;
      results.failures.push({
        username: username || `행 ${index + 1}`,
        reason: '아이디, 이름, 비밀번호 중 누락된 필드가 있습니다.'
      });
      index++;
      processNext();
      return;
    }

    const hashedPassword = bcrypt.hashSync(password, 10);
    db.run(
      `INSERT INTO users (username, password, name) VALUES (?, ?, ?)`,
      [username, hashedPassword, name],
      (err) => {
        if (err) {
          results.failCount++;
          let reason = '사용자 등록 실패';
          if (err.message.includes('UNIQUE constraint failed')) {
            reason = '이미 존재하는 사용자 아이디입니다.';
          }
          results.failures.push({ username, reason });
        } else {
          results.successCount++;
        }
        index++;
        processNext();
      }
    );
  }

  processNext();
});

// Admin Route: Download example CSV file
router.get('/sample-csv', (req, res) => {
  if (!req.session.user || !req.session.user.isAdmin) {
    return sendJson(res, { status: 403, ok: false, message: 'Forbidden', code: 'FORBIDDEN' });
  }

  const csvContent = "\ufeffusername,name,password\ntestuser1,홍길동,Password123!\ntestuser2,이순신,SecurePass456!\n";
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename=user_import_sample.csv');
  return res.send(csvContent);
});

// Admin Route: Delete a user
router.post('/delete-user', (req, res) => {
  if (!req.session.user || !req.session.user.isAdmin) {
    return sendJson(res, { status: 403, ok: false, message: 'Forbidden', code: 'FORBIDDEN' });
  }

  const { id, username } = req.body;
  if (!id && !username) {
    return sendJson(res, { status: 400, ok: false, message: '사용자 ID 또는 Username이 필요합니다.', code: 'BAD_REQUEST' });
  }

  const currentUsername = req.session.user.username;
  const targetSelector = id ? 'id = ?' : 'username = ?';
  const targetParam = id || username;

  db.get(`SELECT username, is_admin FROM users WHERE ${targetSelector}`, [targetParam], (err, row) => {
    if (err) {
      console.error('[Database Error] Failed to fetch user for validation:', err.message);
      return sendJson(res, { status: 500, ok: false, message: '데이터베이스 에러', code: 'DB_ERROR' });
    }
    if (!row) {
      return sendJson(res, { status: 404, ok: false, message: '해당 사용자를 찾을 수 없습니다.', code: 'NOT_FOUND' });
    }

    const env = require('../config/env');
    const targetUsername = row.username;
    const isTargetSuper = (targetUsername === 'developer' || targetUsername === env.ADMIN_USERNAME);
    const isTargetAdmin = (row.is_admin === 1 || isTargetSuper);

    // 1. 최고 관리자 및 본인 계정은 삭제 불가
    if (isTargetSuper || targetUsername === currentUsername) {
      return sendJson(res, {
        status: 400,
        ok: false,
        message: '시스템 관리자 계정 및 본인의 계정은 삭제할 수 없습니다.',
        code: 'NOT_ALLOWED'
      });
    }

    // 2. 대상이 관리자인데, 요청자가 최고 관리자가 아닌 경우 삭제 불가
    const isRequesterSuper = (currentUsername === 'developer' || currentUsername === env.ADMIN_USERNAME || req.session.user.isSuperAdmin);
    if (isTargetAdmin && !isRequesterSuper) {
      return sendJson(res, {
        status: 403,
        ok: false,
        message: '일반 관리자는 다른 관리자 계정을 삭제할 수 없습니다. (최고 관리자 권한 필요)',
        code: 'FORBIDDEN'
      });
    }

    performDelete(targetUsername);
  });

  function performDelete(targetUser) {
    db.run(`DELETE FROM users WHERE username = ?`, [targetUser], function(err) {
      if (err) {
        console.error('[Database Error] Failed to delete user:', err.message);
        return sendJson(res, { status: 500, ok: false, message: '사용자 삭제 실패', code: 'DB_ERROR' });
      }
      sendJson(res, {
        status: 200,
        ok: true,
        message: `사용자가 성공적으로 삭제되었습니다.`,
        code: 'SUCCESS'
      });
    });
  }
});

// Admin Route: Toggle admin role for a user
router.post('/toggle-admin', (req, res) => {
  if (!req.session.user || !req.session.user.isAdmin) {
    return sendJson(res, { status: 403, ok: false, message: 'Forbidden', code: 'FORBIDDEN' });
  }

  const env = require('../config/env');
  const isSuperAdmin = (req.session.user.username === 'developer' || req.session.user.username === env.ADMIN_USERNAME || req.session.user.isSuperAdmin);
  if (!isSuperAdmin) {
    return sendJson(res, { status: 403, ok: false, message: '관리자 지정/해제 권한이 없습니다. (최고 관리자 권한 필요)', code: 'FORBIDDEN' });
  }

  const { id, username, is_admin, adminPassword } = req.body;
  if (!id && !username) {
    return sendJson(res, { status: 400, ok: false, message: '사용자 ID 또는 Username이 필요합니다.', code: 'BAD_REQUEST' });
  }

  if (!adminPassword) {
    return sendJson(res, { status: 400, ok: false, message: '관리자 권한을 변경하려면 본인(현재 관리자)의 비밀번호를 입력해야 합니다.', code: 'ADMIN_PASSWORD_REQUIRED' });
  }

  const targetAdminVal = (is_admin === true || is_admin === 1 || is_admin === 'true') ? 1 : 0;
  const currentUsername = req.session.user.username;
  const targetUsername = username || '';

  if (targetUsername === 'developer' || targetUsername === currentUsername) {
    return sendJson(res, {
      status: 400,
      ok: false,
      message: '시스템 관리자 계정 및 본인의 권한은 변경할 수 없습니다.',
      code: 'NOT_ALLOWED'
    });
  }

  // Verify current admin's password
  db.get(`SELECT password FROM users WHERE id = ?`, [req.session.user.id], (err, adminRow) => {
    if (err || !adminRow) {
      return sendJson(res, { status: 500, ok: false, message: '데이터베이스 조회 실패', code: 'DB_ERROR' });
    }
    const match = bcrypt.compareSync(adminPassword, adminRow.password);
    if (!match) {
      return sendJson(res, { status: 401, ok: false, message: '현재 관리자 비밀번호가 일치하지 않습니다.', code: 'INVALID_ADMIN_PASSWORD' });
    }

    // Verify target user is not developer or self
    if (id) {
      db.get(`SELECT username FROM users WHERE id = ?`, [id], (err, row) => {
        if (err) {
          console.error('[Database Error] Failed to fetch user during admin check:', err.message);
          return sendJson(res, { status: 500, ok: false, message: '데이터베이스 에러', code: 'DB_ERROR' });
        }
        if (!row) {
          return sendJson(res, { status: 404, ok: false, message: '해당 사용자를 찾을 수 없습니다.', code: 'NOT_FOUND' });
        }
        if (row.username === 'developer' || row.username === currentUsername) {
          return sendJson(res, {
            status: 400,
            ok: false,
            message: '시스템 관리자 계정 및 본인의 권한은 변경할 수 없습니다.',
            code: 'NOT_ALLOWED'
          });
        }
        performToggle(id, null);
      });
    } else {
      performToggle(null, username);
    }
  });

  function performToggle(userId, userNm) {
    // When demoting admin → regular user, also mark password_changed = 1.
    // Admins bypass the password-change check, so their password_changed is 0.
    // Without this, the moment they become a regular user the middleware forces
    // a password change — even though they've been using the account normally.
    const query = userId
      ? `UPDATE users SET is_admin = ?${targetAdminVal === 0 ? ', password_changed = 1' : ''} WHERE id = ?`
      : `UPDATE users SET is_admin = ?${targetAdminVal === 0 ? ', password_changed = 1' : ''} WHERE username = ?`;
    const param = userId || userNm;

    db.run(query, [targetAdminVal, param], function(err) {
      if (err) {
        console.error('[Database Error] Failed to update user admin role:', err.message);
        return sendJson(res, { status: 500, ok: false, message: '관리자 권한 변경 실패', code: 'DB_ERROR' });
      }
      if (this.changes === 0) {
        return sendJson(res, { status: 404, ok: false, message: '해당 사용자를 찾을 수 없습니다.', code: 'NOT_FOUND' });
      }
      sendJson(res, {
        status: 200,
        ok: true,
        message: `사용자가 성공적으로 ${targetAdminVal ? '관리자로 지정' : '일반 사용자로 변경'}되었습니다.`,
        code: 'SUCCESS'
      });
    });
  }
});

// Helper to check if section ID is valid and safe
function isValidSectionId(sectionId) {
  if (!sectionId || typeof sectionId !== 'string') return false;
  // Allow letters, numbers, dash, underscore and slash
  const sectionRegex = /^[a-zA-Z0-9_\-\/]+$/;
  if (!sectionRegex.test(sectionId)) return false;
  // Prevent directory traversal
  if (sectionId.includes('..') || sectionId.startsWith('/') || sectionId.endsWith('/')) return false;
  return true;
}

// Admin Route: Get raw content (Markdown/HTML) for a section
router.get('/content/:sectionId*', (req, res) => {
  if (!req.session.user || !req.session.user.isAdmin) {
    return sendJson(res, { status: 403, ok: false, message: 'Forbidden', code: 'FORBIDDEN' });
  }
  
  // Express routing gets wildcard parameters from req.params[0]
  // Join the parameter values to capture full path like curriculum/week1
  let sectionId = req.params.sectionId;
  if (req.params[0]) {
    sectionId += req.params[0];
  }

  if (!isValidSectionId(sectionId)) {
    return sendJson(res, { status: 400, ok: false, message: '유효하지 않은 섹션 ID입니다.', code: 'BAD_REQUEST' });
  }

  db.get(`SELECT content_md, content_html FROM site_contents WHERE section_id = ?`, [sectionId], (err, row) => {
    if (err) {
      console.error('[Database Error] Failed to fetch content:', err.message);
      return sendJson(res, { status: 500, ok: false, message: '데이터 로드 실패', code: 'DB_ERROR' });
    }
    // If content_md is empty, fallback to content_html for legacy support
    const content = (row && row.content_md) ? row.content_md : (row ? row.content_html : '');
    sendJson(res, {
      status: 200,
      ok: true,
      data: { content },
      code: 'SUCCESS'
    });
  });
});

// Admin Route: Update site section content (JSON Data)
router.post('/update-content', (req, res) => {
  if (!req.session.user || !req.session.user.isAdmin) {
    return sendJson(res, { status: 403, ok: false, message: 'Forbidden', code: 'FORBIDDEN' });
  }
  const { sectionId, content_md } = req.body; // content_md holds the JSON string
  if (!sectionId || content_md === undefined) {
    return sendJson(res, { status: 400, ok: false, message: '필수 필드가 누락되었습니다.', code: 'BAD_REQUEST' });
  }
  if (!isValidSectionId(sectionId)) {
    return sendJson(res, { status: 400, ok: false, message: '유효하지 않은 섹션 ID입니다.', code: 'BAD_REQUEST' });
  }

  // Server-side JSON syntax check to prevent corrupt saves
  let jsonData;
  try {
    jsonData = JSON.parse(content_md);
  } catch (parseErr) {
    return sendJson(res, { status: 400, ok: false, message: '올바르지 않은 JSON 형식입니다. 문법을 다시 확인해 주세요.', code: 'INVALID_JSON' });
  }

  // Server-side validation: Navigation menu items must have title and URL
  if (sectionId === 'navigation') {
    if (Array.isArray(jsonData)) {
      for (let i = 0; i < jsonData.length; i++) {
        const item = jsonData[i];
        if (item.type === 'menu_item') {
          const title = (item.title || '').trim();
          const url = (item.url || '').trim();
          if (!title || title === '새 메뉴') {
            return sendJson(res, { status: 400, ok: false, message: `메뉴 #${i + 1}의 제목(이름)이 누락되었거나 기본값('새 메뉴')입니다.`, code: 'VALIDATION_ERROR' });
          }
          if (!url || url === '#') {
            return sendJson(res, { status: 400, ok: false, message: `메뉴 #${i + 1}의 URL이 누락되었거나 기본값('#')입니다.`, code: 'VALIDATION_ERROR' });
          }

          if (item.allowedRoles && !Array.isArray(item.allowedRoles)) {
            return sendJson(res, { status: 400, ok: false, message: `메뉴 #${i + 1}의 권한 설정 형식이 올바르지 않습니다.`, code: 'VALIDATION_ERROR' });
          }

          const isExternal = item.external || /^https?:\/\//i.test(url);
          const isLocked = item.deleteLocked === true;
          if (!isExternal) {
            if (!url.startsWith('#') && !url.startsWith('/')) {
              return sendJson(res, { status: 400, ok: false, message: `메뉴 #${i + 1}의 URL은 '/' 또는 '#'으로 시작해야 합니다.`, code: 'VALIDATION_ERROR' });
            }
            if (!isLocked && !url.startsWith('#')) {
              return sendJson(res, { status: 400, ok: false, message: `메뉴 #${i + 1}의 URL은 '#'으로 시작해야 합니다. ('메뉴 삭제 방지 보호(지울 수 없음)'를 체크하면 '#' 없이 입력할 수 있습니다.)`, code: 'VALIDATION_ERROR' });
            }
          }

          // Server-side validation: Submenu items (fragments) must have customized title and URL
          if (item.submenus && Array.isArray(item.submenus)) {
            for (let j = 0; j < item.submenus.length; j++) {
              const sub = item.submenus[j];
              const subTitle = (sub.title || '').trim();
              const subUrl = (sub.url || '').trim();
              if (!subTitle || subTitle === '새 서브메뉴') {
                return sendJson(res, { status: 400, ok: false, message: `메뉴 #${i + 1}의 서브메뉴 #${j + 1} 제목이 누락되었거나 기본값('새 서브메뉴')입니다.`, code: 'VALIDATION_ERROR' });
              }
              if (!subUrl || subUrl === '#' || subUrl.endsWith('/')) {
                return sendJson(res, { status: 400, ok: false, message: `메뉴 #${i + 1}의 서브메뉴 #${j + 1} URL이 올바르지 않습니다.`, code: 'VALIDATION_ERROR' });
              }

              if (sub.allowedRoles && !Array.isArray(sub.allowedRoles)) {
                return sendJson(res, { status: 400, ok: false, message: `메뉴 #${i + 1}의 서브메뉴 #${j + 1} 권한 설정 형식이 올바르지 않습니다.`, code: 'VALIDATION_ERROR' });
              }

              const subIsExternal = sub.external || /^https?:\/\//i.test(subUrl);
              if (!subIsExternal) {
                if (!subUrl.startsWith('#')) {
                  return sendJson(res, { status: 400, ok: false, message: `메뉴 #${i + 1}의 서브메뉴 #${j + 1} URL은 '#'으로 시작해야 합니다.`, code: 'VALIDATION_ERROR' });
                }
              }
            }
          }
        }
      }
    }
  }

  // Server-side validation: CTF dashboard blocks
  if (sectionId === 'ctf') {
    if (Array.isArray(jsonData)) {
      for (let i = 0; i < jsonData.length; i++) {
        const block = jsonData[i];
        if (block.type === 'ctf_dashboard') {
          const leaderboard = block.leaderboard || [];
          for (let j = 0; j < leaderboard.length; j++) {
            const item = leaderboard[j];
            const rank = (item.rank || '').trim();
            const user = (item.user || '').trim();
            const score = (item.score || '').trim();
            const status = (item.status || '').trim();

            if (!rank) {
              return sendJson(res, { status: 400, ok: false, message: `리더보드 #${j + 1} 항목의 순위(Rank)를 입력해 주세요.`, code: 'VALIDATION_ERROR' });
            }
            if (!user || user === '닉네임' || user === 'new_player') {
              return sendJson(res, { status: 400, ok: false, message: `리더보드 #${j + 1} 항목의 올바른 닉네임(User)을 입력해 주세요.`, code: 'VALIDATION_ERROR' });
            }
            if (!score) {
              return sendJson(res, { status: 400, ok: false, message: `리더보드 #${j + 1} 항목의 점수(Score)를 입력해 주세요.`, code: 'VALIDATION_ERROR' });
            }
            if (!/^\d+\s*PTS$/i.test(score)) {
              return sendJson(res, { status: 400, ok: false, message: `리더보드 #${j + 1} 항목의 점수(Score)는 숫자와 'PTS' 조합이어야 합니다. (예: 1200 PTS)`, code: 'VALIDATION_ERROR' });
            }
            if (!status) {
              return sendJson(res, { status: 400, ok: false, message: `리더보드 #${j + 1} 항목의 해결 현황(Status)을 입력해 주세요.`, code: 'VALIDATION_ERROR' });
            }
            if (!/^\d+\s*\/\s*\d+\s*SOLVED$/i.test(status)) {
              return sendJson(res, { status: 400, ok: false, message: `리더보드 #${j + 1} 항목의 해결 현황(Status)은 'X / Y SOLVED' 형식이어야 합니다. (예: 5 / 5 SOLVED)`, code: 'VALIDATION_ERROR' });
            }
          }

          const challenges = block.challenges || [];
          for (let j = 0; j < challenges.length; j++) {
            const chal = challenges[j];
            const category = (chal.category || '').trim().toUpperCase();
            const title = (chal.title || '').trim();
            const score = (chal.score || '').trim();
            const status = (chal.status || '').trim();

            if (!category) {
              return sendJson(res, { status: 400, ok: false, message: `챌린지 #${j + 1} 항목의 분류(Category)를 지정해 주세요.`, code: 'VALIDATION_ERROR' });
            }
            const validCategories = ['WEB', 'PWN', 'REV', 'CRYPTO', 'FORENSICS', 'MISC'];
            if (!validCategories.includes(category)) {
              return sendJson(res, { status: 400, ok: false, message: `챌린지 #${j + 1} 항목의 분류(Category)는 WEB, PWN, REV, CRYPTO, FORENSICS, MISC 중 하나여야 합니다.`, code: 'VALIDATION_ERROR' });
            }
            if (!title || title === 'New Challenge' || title === 'Web Challenge 1') {
              return sendJson(res, { status: 400, ok: false, message: `챌린지 #${j + 1} 항목의 올바른 문제 제목(Title)을 입력해 주세요.`, code: 'VALIDATION_ERROR' });
            }
            if (!score) {
              return sendJson(res, { status: 400, ok: false, message: `챌린지 #${j + 1} 항목의 점수(Score)를 입력해 주세요.`, code: 'VALIDATION_ERROR' });
            }
            if (!/^\d+\s*PTS$/i.test(score)) {
              return sendJson(res, { status: 400, ok: false, message: `챌린지 #${j + 1} 항목의 점수(Score)는 숫자와 'PTS' 조합이어야 합니다. (예: 100 PTS)`, code: 'VALIDATION_ERROR' });
            }
            if (status !== 'open' && status !== 'solved') {
              return sendJson(res, { status: 400, ok: false, message: `챌린지 #${j + 1} 항목의 상태(Status)를 올바르게 선택해 주세요.`, code: 'VALIDATION_ERROR' });
            }
          }
        }
      }
    }
  }

  try {
    const jsonPath = path.join(__dirname, `../../src/html/fragments/${sectionId}.json`);
    const backupPath = path.join(__dirname, `../../src/html/fragments/${sectionId}.json.bak`);
    const htmlPath = path.join(__dirname, `../../src/html/fragments/${sectionId}.html`);

    // Ensure parent directories exist (crucial for nested paths like curriculum/week1)
    const jsonDir = path.dirname(jsonPath);
    const htmlDir = path.dirname(htmlPath);
    if (!fs.existsSync(jsonDir)) {
      fs.mkdirSync(jsonDir, { recursive: true });
    }
    if (!fs.existsSync(htmlDir)) {
      fs.mkdirSync(htmlDir, { recursive: true });
    }

    // 1. Save previous .json file as backup if it exists
    if (fs.existsSync(jsonPath)) {
      try {
        fs.copyFileSync(jsonPath, backupPath);
      } catch (backupErr) {
        console.error(`[Backup Error] Failed to backup old JSON for ${sectionId}:`, backupErr.message);
      }
    }

    // 2. Write new JSON content
    fs.writeFileSync(jsonPath, content_md, 'utf8');

    // 3. Compile JSON data to HTML using template helper
    const compiledHtml = compileJsonToHtml(sectionId, jsonData);

    // 4. Save HTML file physically
    fs.writeFileSync(htmlPath, compiledHtml, 'utf8');

    // 5. Update SQLite database
    const timestamp = new Date().toISOString();
    db.run(
      `INSERT OR REPLACE INTO site_contents (section_id, content_md, content_html, updated_at) VALUES (?, ?, ?, ?)`,
      [sectionId, content_md, compiledHtml, timestamp],
      (err) => {
        if (err) {
          console.error('[Database Error] Content update failed:', err.message);
          return sendJson(res, { status: 500, ok: false, message: '데이터베이스 업데이트 실패', code: 'DB_ERROR' });
        }
        return sendJson(res, { status: 200, ok: true, message: '컨텐츠가 성공적으로 업데이트되었습니다.', code: 'SUCCESS' });
      }
    );
  } catch (error) {
    console.error('[Update Content Error] Process failed:', error.message);
    return sendJson(res, { status: 500, ok: false, message: '컨텐츠 처리 중 서버 에러가 발생했습니다.', code: 'SERVER_ERROR' });
  }
});

// Admin Route: Upload an image (base64 encoded)
router.post('/upload-image', (req, res) => {
  if (!req.session.user || !req.session.user.isAdmin) {
    return sendJson(res, { status: 403, ok: false, message: 'Forbidden', code: 'FORBIDDEN' });
  }

  const { filename, fileData } = req.body;
  if (!filename || !fileData) {
    return sendJson(res, { status: 400, ok: false, message: '파일명과 파일 데이터가 필요합니다.', code: 'BAD_REQUEST' });
  }

  // Basic security check on filename to prevent path traversal
  const cleanFilename = path.basename(filename).replace(/[^a-zA-Z0-9.\-_]/g, '');
  if (!cleanFilename) {
    return sendJson(res, { status: 400, ok: false, message: '유효하지 않은 파일명입니다.', code: 'BAD_REQUEST' });
  }

  // Remove the base64 prefix if present (e.g. data:image/png;base64,)
  const base64Data = fileData.replace(/^data:image\/[^;]+;base64,/, "");
  const buffer = Buffer.from(base64Data, 'base64');

  const uploadDir = path.join(__dirname, '../../images');
  if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
  }

  const targetPath = path.join(uploadDir, cleanFilename);

  fs.writeFile(targetPath, buffer, (err) => {
    if (err) {
      console.error('[Upload Error] Failed to save image:', err.message);
      return sendJson(res, { status: 500, ok: false, message: '이미지 저장 실패', code: 'SERVER_ERROR' });
    }

    return sendJson(res, {
      status: 200,
      ok: true,
      message: '이미지가 성공적으로 업로드되었습니다.',
      data: {
        url: `/images/${cleanFilename}`
      },
      code: 'SUCCESS'
    });
  });
});

// Admin Route: Archive current semester events to activity archive
router.post('/archive-semester', (req, res) => {
  if (!req.session.user || !req.session.user.isAdmin) {
    return sendJson(res, { status: 403, ok: false, message: 'Forbidden', code: 'FORBIDDEN' });
  }

  const { semesterName, semesterCode } = req.body;
  if (!semesterName || !semesterCode) {
    return sendJson(res, { status: 400, ok: false, message: '학기 이름과 학기 코드를 모두 입력해 주세요.', code: 'BAD_REQUEST' });
  }

  // Sanitize semester code (only letters, numbers, and dashes allowed)
  const codeRegex = /^[a-zA-Z0-9\-]+$/;
  if (!codeRegex.test(semesterCode)) {
    return sendJson(res, { status: 400, ok: false, message: '학기 코드는 영문, 숫자, 하이픈(-)만 사용할 수 있습니다.', code: 'BAD_REQUEST' });
  }

  const fragsDir = path.join(__dirname, '../../src/html/fragments');
  const otherJsonPath = path.join(fragsDir, 'other-events.json');
  const otherHtmlPath = path.join(fragsDir, 'other-events.html');
  const pastJsonPath = path.join(fragsDir, 'past-events.json');
  const pastHtmlPath = path.join(fragsDir, 'past-events.html');

  try {
    // 1. Read current other-events.json
    if (!fs.existsSync(otherJsonPath)) {
      throw new Error('other-events.json 파일이 존재하지 않습니다.');
    }
    const otherRaw = fs.readFileSync(otherJsonPath, 'utf8');
    const otherData = JSON.parse(otherRaw);

    // 2. Clone and write as archive-{semesterCode}.json
    const archiveJson = JSON.parse(JSON.stringify(otherData));
    archiveJson[0].title = `${semesterName} 활동 아카이브`;
    archiveJson[0].desc = `${semesterName} 개강총회, 종강총회, 강연 등의 특별 활동 아카이브 기록입니다.`;

    const archiveJsonPath = path.join(fragsDir, `archive-${semesterCode}.json`);
    const archiveHtmlPath = path.join(fragsDir, `archive-${semesterCode}.html`);

    fs.writeFileSync(archiveJsonPath, JSON.stringify(archiveJson, null, 2), 'utf8');

    // 3. Compile archive-{semesterCode}.html and save to DB
    const { compileJsonToHtml } = require('../helpers/template');
    const archiveHtml = compileJsonToHtml(`archive-${semesterCode}`, archiveJson);
    fs.writeFileSync(archiveHtmlPath, archiveHtml, 'utf8');

    const timestamp = new Date().toISOString();
    db.run(
      `INSERT OR REPLACE INTO site_contents (section_id, content_md, content_html, updated_at) VALUES (?, ?, ?, ?)`,
      [`archive-${semesterCode}`, JSON.stringify(archiveJson), archiveHtml, timestamp]
    );

    // 4. Update past-events.json with a new archive card
    let pastData = [];
    if (fs.existsSync(pastJsonPath)) {
      pastData = JSON.parse(fs.readFileSync(pastJsonPath, 'utf8'));
    } else {
      pastData = [
        {
          "type": "header",
          "title": "Activity Archive",
          "desc": "지난 학기들의 동아리 학술 발표 자료 및 학습 세미나 타임라인 아카이브입니다."
        },
        {
          "type": "features",
          "items": []
        }
      ];
    }

    const newArchiveCard = {
      tag: semesterCode,
      title: `${semesterName} 활동 아카이브`,
      desc: `${semesterName} 학기 중에 진행되었던 특별 강연, 학술 세션 및 동아리 총회 등의 활동 기록 모음입니다.`,
      url: `#archive-${semesterCode}`
    };

    // Prepend new archive card to features items
    if (pastData[1] && pastData[1].type === 'features') {
      pastData[1].items.unshift(newArchiveCard);
    } else {
      pastData.push({
        type: 'features',
        items: [newArchiveCard]
      });
    }

    fs.writeFileSync(pastJsonPath, JSON.stringify(pastData, null, 2), 'utf8');

    // Compile past-events.html and save to DB
    const pastHtml = compileJsonToHtml('past-events', pastData);
    fs.writeFileSync(pastHtmlPath, pastHtml, 'utf8');
    db.run(
      `INSERT OR REPLACE INTO site_contents (section_id, content_md, content_html, updated_at) VALUES (?, ?, ?, ?)`,
      ['past-events', JSON.stringify(pastData), pastHtml, timestamp]
    );

    // 5. Reset other-events.json for the next semester
    const resetOtherData = [
      {
        "type": "header",
        "title": "Special Events",
        "desc": "정기 학술 세미나 외에 INHACK에서 주최 및 참여하는 특별 세션과 대내외 주요 활동 내역입니다."
      },
      {
        "type": "features",
        "items": [
          {
            "tag": "Assembly 01",
            "title": "새 학기 개강총회 및 오리엔테이션",
            "desc": "학기 시작을 알리는 개강총회 및 동아리 오리엔테이션 이벤트 세션입니다."
          },
          {
            "tag": "Assembly 02",
            "title": "새 학기 종강총회 & 성과 발표회",
            "desc": "학기를 마무리하는 성과 공유회 및 종강총회 세션입니다."
          }
        ]
      }
    ];

    fs.writeFileSync(otherJsonPath, JSON.stringify(resetOtherData, null, 2), 'utf8');

    // Compile other-events.html and save to DB
    const otherHtml = compileJsonToHtml('other-events', resetOtherData);
    fs.writeFileSync(otherHtmlPath, otherHtml, 'utf8');
    db.run(
      `INSERT OR REPLACE INTO site_contents (section_id, content_md, content_html, updated_at) VALUES (?, ?, ?, ?)`,
      ['other-events', JSON.stringify(resetOtherData), otherHtml, timestamp]
    );

    return sendJson(res, {
      status: 200,
      ok: true,
      message: `'${semesterName}' 활동 내역이 성공적으로 아카이브에 보관되었으며, 특별 행사 페이지가 리셋되었습니다.`,
      code: 'SUCCESS'
    });
  } catch (err) {
    console.error('[Archive Error] Failed to archive semester:', err.message);
    return sendJson(res, { status: 500, ok: false, message: `아카이브 처리 실패: ${err.message}`, code: 'SERVER_ERROR' });
  }
});

module.exports = router;
