const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const db = require('../config/db');
const env = require('../config/env');
const { sendJson } = require('../helpers/response');
const { validateLogin } = require('../middlewares/auth');

// Login route
router.post('/login', validateLogin, (req, res) => {
    const { username, password } = req.body;

    const query = `SELECT * FROM users WHERE username = ?`;

    db.get(query, [username], (err, row) => {
        if (err) {
             return sendJson(res, {
              status: 500, ok: false, action: 'auth', resource: 'users',
              message: 'Database error',
              code: 'DB_ERROR'
            });
        }
        if (!row) {
            return sendJson(res, {
                status: 401, ok: false, action: 'auth', resource: 'users',
                message: 'Invalid username or password',
                code: 'INVALID_CREDENTIALS'
            });
        }

        try {
            const passwordMatch = bcrypt.compareSync(password, row.password);
            if (!passwordMatch) {
                return sendJson(res, {
                    status: 401, ok: false, action: 'auth', resource: 'users',
                    message: 'Invalid username or password',
                    code: 'INVALID_CREDENTIALS'
                });
            }

            const adminUser = env.ADMIN_USERNAME;
            const isAdmin = (row.username === adminUser);
            req.session.user = { 
                id: row.id, 
                username: row.username, 
                name: row.name, 
                isAdmin, 
                passwordChanged: row.password_changed || 0 
            };
            req.session.save((saveErr) => {
                if (saveErr) {
                    console.error('[Session Save Error] Failed to save session:', saveErr.message);
                    return sendJson(res, {
                        status: 500, ok: false, action: 'auth', resource: 'users',
                        message: 'Session creation failed',
                        code: 'SESSION_SAVE_ERROR'
                    });
                }
                sendJson(res, {
                    status: 200, ok: true, action: 'auth', resource: 'users',
                    message: 'Login Success!.',
                    code: 'LOGIN_SUCCESS'
                });
            });
        } catch (e) {
            sendJson(res, {
                status: 500, ok: false, action: 'auth', resource: 'users',
                message: 'Password comparison error',
                code: 'HASH_ERROR'
            });
        }
    });
});

router.get('/me', (req, res) => {
  if (req.session.user) {
    return sendJson(res, {
      status: 200, ok: true, action: 'auth', resource: 'session',
      message: 'Session active', data: req.session.user, code: 'SESSION_ACTIVE'
    });
  }
  return sendJson(res, {
    status: 401, ok: false, action: 'auth', resource: 'session',
    message: 'No active session', code: 'NO_SESSION'
  });
});

// User Route: Change password (enforcing security rules)
router.post('/change-password', (req, res) => {
  if (!req.session.user) {
    return sendJson(res, { status: 401, ok: false, message: '로그인이 필요합니다.', code: 'UNAUTHORIZED' });
  }

  const { currentPassword, newPassword } = req.body;
  if (!currentPassword || !newPassword) {
    return sendJson(res, { status: 400, ok: false, message: '현재 비밀번호와 새 비밀번호를 모두 입력해 주세요.', code: 'BAD_REQUEST' });
  }

  // Enforce password requirements: Number, Upper/Lower English letter, general special character, at least 8 chars
  const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?~`]).{8,}$/;
  if (!passwordRegex.test(newPassword)) {
    return sendJson(res, {
      status: 400,
      ok: false,
      message: '새 비밀번호는 최소 8자 이상이어야 하며 숫자, 영문 대문자, 영문 소문자, 특수문자를 각각 최소 1개 이상 포함해야 합니다.',
      code: 'PASSWORD_TOO_WEAK'
    });
  }

  db.get(`SELECT password FROM users WHERE id = ?`, [req.session.user.id], (err, row) => {
    if (err || !row) {
      console.error('[Database Error] Failed to fetch user password:', err ? err.message : 'User not found');
      return sendJson(res, { status: 500, ok: false, message: '데이터베이스 조회 실패', code: 'DB_ERROR' });
    }

    try {
      const match = bcrypt.compareSync(currentPassword, row.password);
      if (!match) {
        return sendJson(res, { status: 400, ok: false, message: '현재 비밀번호가 일치하지 않습니다.', code: 'INVALID_CURRENT_PASSWORD' });
      }

      const hashedNewPassword = bcrypt.hashSync(newPassword, 10);
      db.run(`UPDATE users SET password = ?, password_changed = 1 WHERE id = ?`, [hashedNewPassword, req.session.user.id], (updateErr) => {
        if (updateErr) {
          console.error('[Database Error] Failed to update password:', updateErr.message);
          return sendJson(res, { status: 500, ok: false, message: '비밀번호 변경 실패', code: 'DB_ERROR' });
        }

        req.session.user.passwordChanged = 1;
        req.session.save((saveErr) => {
          if (saveErr) {
            console.error('[Session Save Error] Failed to save session after password change:', saveErr.message);
            return sendJson(res, { status: 500, ok: false, message: '세션 업데이트 실패', code: 'SESSION_SAVE_ERROR' });
          }
          sendJson(res, { status: 200, ok: true, message: '비밀번호가 성공적으로 변경되었습니다. 이제 포털 서비스를 이용하실 수 있습니다.', code: 'SUCCESS' });
        });
      });
    } catch (e) {
      sendJson(res, { status: 500, ok: false, message: '비밀번호 검증 오류', code: 'HASH_ERROR' });
    }
  });
});

router.post('/logout', (req, res) => {
  req.session.destroy((err) => {
    if (err) {  
      return sendJson(res, {
        status: 500, ok: false, action: 'auth', resource: 'session',
        message: 'Logout failed', code: 'LOGOUT_FAILED'
      });
    }
    sendJson(res, {
      status: 200, ok: true, action: 'auth', resource: 'session',
      message: 'Logout successful', code: 'LOGOUT_SUCCESS'
    });
  });
});

module.exports = router;
