const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const db = require('../config/db');
const { sendJson } = require('../helpers/response');

// Admin Route: Register a new user
router.post('/register-user', (req, res) => {
  if (!req.session.user || !req.session.user.isAdmin) {
    return sendJson(res, { status: 403, ok: false, message: 'Forbidden', code: 'FORBIDDEN' });
  }
  const { username, password, name } = req.body;
  if (!username || !password || !name) {
    return sendJson(res, { status: 400, ok: false, message: '모든 필드(아이디, 비밀번호, 이름)를 입력해주세요.', code: 'BAD_REQUEST' });
  }

  const hashedPassword = bcrypt.hashSync(password, 10);
  db.run(`INSERT INTO users (username, password, name) VALUES (?, ?, ?)`, [username, hashedPassword, name], (err) => {
    if (err) {
      if (err.message.includes('UNIQUE constraint failed')) {
        return sendJson(res, { status: 409, ok: false, message: '이미 존재하는 사용자 아이디입니다.', code: 'ALREADY_EXISTS' });
      }
      return sendJson(res, { status: 500, ok: false, message: '사용자 등록 실패', code: 'DB_ERROR' });
    }
    return sendJson(res, { status: 200, ok: true, message: `사용자 '${name}'(이)가 성공적으로 등록되었습니다.`, code: 'SUCCESS' });
  });
});

// Admin Route: Get list of all users
router.get('/users', (req, res) => {
  if (!req.session.user || !req.session.user.isAdmin) {
    return sendJson(res, { status: 403, ok: false, message: 'Forbidden', code: 'FORBIDDEN' });
  }

  db.all(`SELECT id, username, name FROM users ORDER BY id DESC`, [], (err, rows) => {
    if (err) {
      console.error('[Database Error] Failed to list users:', err.message);
      return sendJson(res, { status: 500, ok: false, message: '사용자 목록 조회 실패', code: 'DB_ERROR' });
    }
    sendJson(res, {
      status: 200,
      ok: true,
      data: rows,
      code: 'SUCCESS'
    });
  });
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
  const targetUsername = username || '';

  if (targetUsername === 'developer' || targetUsername === currentUsername) {
    return sendJson(res, {
      status: 400,
      ok: false,
      message: '시스템 관리자 계정 및 본인의 계정은 삭제할 수 없습니다.',
      code: 'NOT_ALLOWED'
    });
  }

  // Double check user detail if ID is sent
  if (id) {
    db.get(`SELECT username FROM users WHERE id = ?`, [id], (err, row) => {
      if (err) {
        console.error('[Database Error] Failed to fetch user during deletion check:', err.message);
        return sendJson(res, { status: 500, ok: false, message: '데이터베이스 에러', code: 'DB_ERROR' });
      }
      if (!row) {
        return sendJson(res, { status: 404, ok: false, message: '해당 사용자를 찾을 수 없습니다.', code: 'NOT_FOUND' });
      }
      if (row.username === 'developer' || row.username === currentUsername) {
        return sendJson(res, {
          status: 400,
          ok: false,
          message: '시스템 관리자 계정 및 본인의 계정은 삭제할 수 없습니다.',
          code: 'NOT_ALLOWED'
        });
      }
      performDelete(id, null);
    });
  } else {
    performDelete(null, username);
  }

  function performDelete(userId, userNm) {
    const query = userId ? `DELETE FROM users WHERE id = ?` : `DELETE FROM users WHERE username = ?`;
    const param = userId || userNm;

    db.run(query, [param], function(err) {
      if (err) {
        console.error('[Database Error] Failed to delete user:', err.message);
        return sendJson(res, { status: 500, ok: false, message: '사용자 삭제 실패', code: 'DB_ERROR' });
      }
      if (this.changes === 0) {
        return sendJson(res, { status: 404, ok: false, message: '해당 사용자를 찾을 수 없습니다.', code: 'NOT_FOUND' });
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

// Admin Route: Update site section content HTML
router.post('/update-content', (req, res) => {
  if (!req.session.user || !req.session.user.isAdmin) {
    return sendJson(res, { status: 403, ok: false, message: 'Forbidden', code: 'FORBIDDEN' });
  }
  const { sectionId, contentHtml } = req.body;
  const validSections = ['home', 'curriculum', 'seminar', 'ctf'];
  if (!sectionId || contentHtml === undefined) {
    return sendJson(res, { status: 400, ok: false, message: '필수 필드가 누락되었습니다.', code: 'BAD_REQUEST' });
  }
  if (!validSections.includes(sectionId)) {
    return sendJson(res, { status: 400, ok: false, message: '유효하지 않은 섹션 ID입니다.', code: 'BAD_REQUEST' });
  }

  const timestamp = new Date().toISOString();
  db.run(`INSERT OR REPLACE INTO site_contents (section_id, content_html, updated_at) VALUES (?, ?, ?)`,
    [sectionId, contentHtml, timestamp], (err) => {
      if (err) {
        console.error('[Database Error] Content update failed:', err.message);
        return sendJson(res, { status: 500, ok: false, message: '컨텐츠 업데이트 실패', code: 'DB_ERROR' });
      }
      return sendJson(res, { status: 200, ok: true, message: '컨텐츠가 성공적으로 업데이트되었습니다.', code: 'SUCCESS' });
    });
});

module.exports = router;
