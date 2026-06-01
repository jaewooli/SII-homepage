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

  db.all(`SELECT id, username, name, is_blocked FROM users ORDER BY id DESC`, [], (err, rows) => {
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
  const targetUsername = username || '';

  if (targetUsername === 'developer' || targetUsername === currentUsername) {
    return sendJson(res, {
      status: 400,
      ok: false,
      message: '시스템 관리자 계정 및 본인의 계정은 차단할 수 없습니다.',
      code: 'NOT_ALLOWED'
    });
  }

  const blockVal = is_blocked ? 1 : 0;

  if (id) {
    db.get(`SELECT username FROM users WHERE id = ?`, [id], (err, row) => {
      if (err) {
        console.error('[Database Error] Failed to fetch user during block check:', err.message);
        return sendJson(res, { status: 500, ok: false, message: '데이터베이스 에러', code: 'DB_ERROR' });
      }
      if (!row) {
        return sendJson(res, { status: 404, ok: false, message: '해당 사용자를 찾을 수 없습니다.', code: 'NOT_FOUND' });
      }
      if (row.username === 'developer' || row.username === currentUsername) {
        return sendJson(res, {
          status: 400,
          ok: false,
          message: '시스템 관리자 계정 및 본인의 계정은 차단할 수 없습니다.',
          code: 'NOT_ALLOWED'
        });
      }
      performBlock(id, null);
    });
  } else {
    performBlock(null, username);
  }

  function performBlock(userId, userNm) {
    const query = userId ? `UPDATE users SET is_blocked = ? WHERE id = ?` : `UPDATE users SET is_blocked = ? WHERE username = ?`;
    const param = userId || userNm;

    db.run(query, [blockVal, param], function(err) {
      if (err) {
        console.error('[Database Error] Failed to block/unblock user:', err.message);
        return sendJson(res, { status: 500, ok: false, message: '사용자 차단 상태 변경 실패', code: 'DB_ERROR' });
      }
      if (this.changes === 0) {
        return sendJson(res, { status: 404, ok: false, message: '해당 사용자를 찾을 수 없습니다.', code: 'NOT_FOUND' });
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
  const base64Data = fileData.replace(/^data:image\/\w+;base64,/, "");
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

module.exports = router;
