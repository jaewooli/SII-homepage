const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const db = require('../config/db');
const env = require('../config/env');
const dreamhackState = require('../services/dreamhackState');
const { loginDreamhackWithPuppeteer } = require('../services/puppeteer');
const { sendJson } = require('../helpers/response');

// Get encrypted credentials for E2E decryption in chrome extension
router.get('/encrypted-credentials', (req, res) => {
  if (!req.session.user || !req.session.user.isAdmin) {
    return sendJson(res, {
      status: 403, ok: false, action: 'read', resource: 'dreamhack_credentials',
      message: 'Forbidden', code: 'FORBIDDEN'
    });
  }

  db.get(`SELECT encrypted_password, iv FROM admin_credentials WHERE id = 1`, [], (err, row) => {
    if (err) {
      console.error('[Database Read Error] Failed to read admin credentials:', err.message);
      return sendJson(res, {
        status: 500, ok: false, action: 'read', resource: 'dreamhack_credentials',
        message: 'Database error', code: 'DATABASE_ERROR'
      });
    }

    if (!row) {
      // Fallback: If E2E is not seeded yet, check if plaintext credentials exist in env
      if (process.env.DREAMHACKPASSWORD) {
        return sendJson(res, {
          status: 200, ok: true, action: 'read', resource: 'dreamhack_credentials',
          data: {
            isPlain: true,
            email: process.env.DREAMHACKEMAIL || '',
            plainPassword: process.env.DREAMHACKPASSWORD
          },
          code: 'PLAINTEXT_FALLBACK'
        });
      }

      return sendJson(res, {
        status: 404, ok: false, action: 'read', resource: 'dreamhack_credentials',
        message: 'No credentials found in database or environment', code: 'NOT_FOUND'
      });
    }

    sendJson(res, {
      status: 200, ok: true, action: 'read', resource: 'dreamhack_credentials',
      data: {
        isPlain: false,
        email: process.env.DREAMHACKEMAIL || '',
        encryptedPassword: row.encrypted_password,
        iv: row.iv
      },
      code: 'SUCCESS'
    });
  });
});

// Update encrypted credentials from client side (E2E Encrypted)
router.post('/encrypted-credentials', (req, res) => {
  if (!req.session.user || !req.session.user.isAdmin) {
    return sendJson(res, {
      status: 403, ok: false, action: 'create', resource: 'dreamhack_credentials',
      message: 'Forbidden', code: 'FORBIDDEN'
    });
  }

  const { encryptedPassword, iv } = req.body;
  if (!encryptedPassword || !iv) {
    return sendJson(res, {
      status: 400, ok: false, action: 'create', resource: 'dreamhack_credentials',
      message: 'encryptedPassword and iv are required', code: 'BAD_REQUEST'
    });
  }

  const timestamp = new Date().toISOString();
  const email = process.env.DREAMHACKEMAIL || '';

  db.run(`INSERT OR REPLACE INTO admin_credentials (id, email, encrypted_password, iv, updated_at) 
          VALUES (1, ?, ?, ?, ?)`, [email, encryptedPassword, iv, timestamp], (err) => {
    if (err) {
      console.error('[Database Error] Failed to save encrypted credentials:', err.message);
      return sendJson(res, {
        status: 500, ok: false, action: 'create', resource: 'dreamhack_credentials',
        message: 'Database error', code: 'DATABASE_ERROR'
      });
    }

    sendJson(res, {
      status: 200, ok: true, action: 'create', resource: 'dreamhack_credentials',
      message: '종단간(E2E) 암호화된 비밀번호가 성공적으로 저장되었습니다.',
      code: 'SUCCESS'
    });
  });
});

router.post('/regenerate', async (req, res) => {
  const adminUser = env.ADMIN_USERNAME;
  if (!req.session.user || (req.session.user.username !== adminUser && !req.session.user.isAdmin)) {
    return sendJson(res, {
      status: 403, ok: false, action: 'create', resource: 'dreamhack_regenerate',
      message: 'Only the administrator can regenerate shared sessions', code: 'FORBIDDEN'
    });
  }

  console.log('[Dreamhack Connect] Starting server-side headless chrome regeneration for 3 sessions...');
  const sessions = [];

  const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || req.ip;
  const timestamp = new Date().toISOString();

  // Generate 3 unique sessions sequentially
  for (let i = 0; i < 3; i++) {
    console.log(`[Dreamhack Connect] Executing headless login ${i + 1}/3...`);
    const sessionData = await loginDreamhackWithPuppeteer();
    if (sessionData && sessionData.sessionid) {
      sessions.push(sessionData);
      console.log(`[Dreamhack Connect] Session ${i + 1} generated successfully.`);
    } else {
      console.warn(`[Dreamhack Connect] Failed to generate session ${i + 1}.`);
    }
    // Add small delay to prevent rate limiting
    await new Promise(resolve => setTimeout(resolve, 1000));
  }

  if (sessions.length === 0) {
    return sendJson(res, {
      status: 500, ok: false, action: 'create', resource: 'dreamhack_regenerate',
      message: 'Headless Chrome failed to generate any active sessions. Check credentials/network.',
      code: 'REGENERATION_FAILED'
    });
  }

  // Update DB (clear first, then insert the new sessions)
  db.serialize(() => {
    db.run(`DELETE FROM shared_session`, [], (err) => {
      if (err) {
        console.error('[Database Error] Failed to clear shared sessions during regeneration:', err.message);
      }
    });
    const stmt = db.prepare(`INSERT INTO shared_session (id, sessionid, csrftoken, updated_at) VALUES (?, ?, ?, ?)`);
    sessions.forEach((s, idx) => {
      stmt.run(idx + 1, s.sessionid, s.csrftoken || '', timestamp);
    });
    stmt.finalize();
  });

  // Log action
  const logMessage = `[${timestamp}] Headless Chrome session regeneration by admin from IP: ${ip} (Generated: ${sessions.length}/3)\n`;
  const logFilePath = path.join(__dirname, '../../log/login_attempts.log');
  fs.appendFileSync(logFilePath, logMessage);

  // Sync server-side global variables (using first session as primary)
  const primarySession = sessions[0];
  dreamhackState.sessionid = primarySession.sessionid;
  process.env.DREAMHACK_SESSIONID = primarySession.sessionid;
  if (primarySession.csrftoken) {
    process.env.DREAMHACK_CSRF = primarySession.csrftoken;
  }

  console.log(`[Dreamhack Connect] Session pool regenerated successfully. Count: ${sessions.length}`);

  sendJson(res, {
    status: 200, ok: true, action: 'create', resource: 'dreamhack_regenerate',
    message: `공용 세션 ${sessions.length}개가 성공적으로 재발급 및 갱신되었습니다.`,
    data: { valid_count: sessions.length },
    code: 'SUCCESS'
  });
});

router.get('/logs', async (req, res) => {
  if (!req.session.user) {
    return sendJson(res, {
      status: 401, ok: false, action: 'read', resource: 'dreamhack_logs',
      message: 'Unauthorized access', code: 'UNAUTHORIZED'
    });
  }

  const { username, isAdmin: sessionIsAdmin } = req.session.user;
  const adminUser = env.ADMIN_USERNAME;
  const isAdmin = (username === adminUser || sessionIsAdmin);

  let queryAccess = `SELECT username, ip_address, timestamp FROM dreamhack_access_logs ORDER BY timestamp DESC LIMIT 50`;
  let querySolves = `SELECT username, challenge_id, challenge_name, timestamp FROM dreamhack_solves ORDER BY timestamp DESC LIMIT 50`;
  let queryIntercepts = `SELECT username, ip_address, timestamp FROM dreamhack_intercept_logs ORDER BY timestamp DESC LIMIT 50`;
  let queryParams = [];

  if (!isAdmin) {
    queryAccess = `SELECT username, ip_address, timestamp FROM dreamhack_access_logs WHERE username = ? ORDER BY timestamp DESC LIMIT 50`;
    querySolves = `SELECT username, challenge_id, challenge_name, timestamp FROM dreamhack_solves WHERE username = ? ORDER BY timestamp DESC LIMIT 50`;
    queryIntercepts = `SELECT username, ip_address, timestamp FROM dreamhack_intercept_logs WHERE username = ? ORDER BY timestamp DESC LIMIT 50`;
    queryParams = [username];
  }

  const queryPromise = (sql, params) => new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) reject(err);
      else resolve(rows);
    });
  });

  try {
    const [accessLogs, solveLogs, interceptLogs] = await Promise.all([
      queryPromise(queryAccess, queryParams),
      queryPromise(querySolves, queryParams),
      queryPromise(queryIntercepts, queryParams)
    ]);

    sendJson(res, {
      status: 200, ok: true, action: 'read', resource: 'dreamhack_logs',
      data: {
        accessLogs,
        solveLogs,
        interceptLogs
      },
      code: 'SUCCESS'
    });
  } catch (err) {
    console.error('[Database Read Error] Parallel read failed:', err.message);
    sendJson(res, {
      status: 500, ok: false, action: 'read', resource: 'dreamhack_logs',
      message: 'Failed to retrieve logs', code: 'DATABASE_ERROR'
    });
  }
});

router.post('/login', async (req, res) => {
    const { id, username, isAdmin: sessionIsAdmin } = req.session.user;
    const adminUser = env.ADMIN_USERNAME;
    if (username !== adminUser && !sessionIsAdmin) {
      return sendJson(res, {
        status: 403, ok: false, action: 'auth', resource: 'dreamhack',
        message: 'Only the administrator can synchronize the shared session',
        code: 'UNAUTHORIZED'
      });
    }

    const { sessions } = req.body;
    if (!sessions || !Array.isArray(sessions) || sessions.length === 0) {
      return sendJson(res, {
        status: 400, ok: false, action: 'auth', resource: 'dreamhack',
        message: 'Sessions array is required', code: 'LOGIN_FAILED'
      });
    }

    const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || req.ip;
    const timestamp = new Date().toISOString();
    
    // 1. Log to SQLite database
    db.run(`INSERT INTO dreamhack_access_logs (user_id, username, ip_address, timestamp) VALUES (?, ?, ?, ?)`, 
      [id, username, ip, timestamp], (err) => {
        if (err) {
          console.error('[Database Log Error] Failed to log dreamhack login attempt:', err.message);
        }
      }
    );

    // Save sessions to shared_session table (clear first, then insert up to 5)
    db.serialize(() => {
      db.run(`DELETE FROM shared_session`, [], (err) => {
        if (err) {
          console.error('[Database Error] Failed to clear shared sessions:', err.message);
        }
      });
      const stmt = db.prepare(`INSERT INTO shared_session (id, sessionid, csrftoken, updated_at) VALUES (?, ?, ?, ?)`);
      sessions.forEach((s, idx) => {
        stmt.run(idx + 1, s.sessionid, s.csrftoken || '', timestamp);
      });
      stmt.finalize();
    });

    const logMessage = `[${timestamp}] Cookie sync for user: ${username} (pool size: ${sessions.length}) from IP: ${ip}\n`;
    const logFilePath = path.join(__dirname, '../../log/login_attempts.log');

    fs.appendFileSync(logFilePath, logMessage);

    try {
      // Synchronize client session tokens to server global variables (use first one as default)
      const primarySession = sessions[0];
      dreamhackState.sessionid = primarySession.sessionid;
      
      process.env.DREAMHACK_SESSIONID = primarySession.sessionid;
      if (primarySession.csrftoken) {
        process.env.DREAMHACK_CSRF = primarySession.csrftoken;
      }

      console.log(`[Dreamhack Sync] Successfully synchronized ${sessions.length} session cookies for user: ${username}`);

      sendJson(res, {
          status: 200, ok: true, action: 'auth', resource: 'dreamhack',
          message: 'Dreamhack login successful',
          data: { sessionid: dreamhackState.sessionid, csrf_token: primarySession.csrftoken },
          code: 'LOGIN_SUCCESS'
        });
      
    } catch (error) {
        console.error('Dreamhack login sync error:', error.message);
        sendJson(res, {
            status: 500, ok: false, action: 'auth', resource: 'dreamhack',
            message: `Dreamhack API Error: ${error.message}`,
            code: 'SERVER_ERROR'
        });
    }
});

router.get('/shared-session', (req, res) => {
  if (!req.session || !req.session.user) {
    return sendJson(res, {
      status: 401, ok: false, action: 'read', resource: 'dreamhack',
      message: 'Unauthorized', code: 'UNAUTHORIZED'
    });
  }

  db.all(`SELECT id, sessionid, csrftoken, updated_at FROM shared_session`, [], (err, rows) => {
    if (err) {
      console.error('[Database Read Error] Failed to read shared sessions:', err.message);
      return sendJson(res, {
        status: 500, ok: false, action: 'read', resource: 'dreamhack',
        message: 'Database error', code: 'DATABASE_ERROR'
      });
    }
    if (!rows || rows.length === 0) {
      return sendJson(res, {
        status: 404, ok: false, action: 'read', resource: 'dreamhack',
        message: 'Shared session not found', code: 'NOT_FOUND'
      });
    }

    // Assign a random session from the pool to distribute the load, bypassing active verification
    const randomIndex = Math.floor(Math.random() * rows.length);
    const chosenSession = rows[randomIndex];

    sendJson(res, {
      status: 200, ok: true, action: 'read', resource: 'dreamhack',
      data: {
        sessionid: chosenSession.sessionid,
        csrftoken: chosenSession.csrftoken,
        updated_at: chosenSession.updated_at,
        total_sessions: rows.length,
        valid_sessions: rows.length,
        sessions: rows.map(r => ({ sessionid: r.sessionid, csrftoken: r.csrftoken }))
      },
      code: 'SUCCESS'
    });
  });
});

router.post('/invalidate-session', (req, res) => {
  if (!req.session || !req.session.user) {
    return sendJson(res, {
      status: 401, ok: false, action: 'delete', resource: 'dreamhack',
      message: 'Unauthorized', code: 'UNAUTHORIZED'
    });
  }

  const { sessionid: targetSessionid } = req.body;
  if (!targetSessionid) {
    return sendJson(res, {
      status: 400, ok: false, action: 'delete', resource: 'dreamhack',
      message: 'sessionid is required', code: 'BAD_REQUEST'
    });
  }

  db.run(`DELETE FROM shared_session WHERE sessionid = ?`, [targetSessionid], (err) => {
    if (err) {
      console.error('[Database Error] Failed to delete invalid shared session:', err.message);
      return sendJson(res, {
        status: 500, ok: false, action: 'delete', resource: 'dreamhack',
        message: 'Database error', code: 'DATABASE_ERROR'
      });
    }

    console.log(`[Dreamhack Sync] Invalid session deleted from DB via client report: ${targetSessionid.substring(0, 8)}...`);

    sendJson(res, {
      status: 200, ok: true, action: 'delete', resource: 'dreamhack',
      message: 'Invalid session cleared successfully', code: 'SUCCESS'
    });
  });
});

router.post('/clear-shared-session', (req, res) => {
  const adminUser = env.ADMIN_USERNAME;
  if (!req.session.user || (req.session.user.username !== adminUser && !req.session.user.isAdmin)) {
    return sendJson(res, {
      status: 403, ok: false, action: 'delete', resource: 'dreamhack',
      message: 'Only the administrator can clear the shared session', code: 'FORBIDDEN'
    });
  }

  db.run(`DELETE FROM shared_session`, [], (err) => {
    if (err) {
      console.error('[Database Error] Failed to delete shared session:', err.message);
      return sendJson(res, {
        status: 500, ok: false, action: 'delete', resource: 'dreamhack',
        message: 'Database error', code: 'DATABASE_ERROR'
      });
    }

    // Also clear global variables
    dreamhackState.sessionid = "";
    process.env.DREAMHACK_SESSIONID = "";
    process.env.DREAMHACK_CSRF = "";

    console.log('[Dreamhack Sync] Shared session cleared by admin.');
    sendJson(res, {
      status: 200, ok: true, action: 'delete', resource: 'dreamhack',
      message: 'Shared session cleared successfully', code: 'SUCCESS'
    });
  });
});

router.post('/intercept-logout', (req, res) => {
  const username = (req.session && req.session.user) ? req.session.user.username : 'Unknown Student';
  const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || req.ip;
  const timestamp = new Date().toISOString();

  db.run(`INSERT INTO dreamhack_intercept_logs (username, ip_address, timestamp) VALUES (?, ?, ?)`,
    [username, ip, timestamp], (err) => {
      if (err) {
        console.error('[Database Error] Failed to log logout interception:', err.message);
        return sendJson(res, { status: 500, ok: false, action: 'create', resource: 'dreamhack_intercept_logs', message: 'Database insertion failed' });
      }
      
      const logMessage = `[${timestamp}] Intercepted logout for student user: ${username} from IP: ${ip}\n`;
      const logFilePath = path.join(__dirname, '../../log/logout_intercepts.log');
      fs.appendFileSync(logFilePath, logMessage);
      
      console.log(`[INHACK Intercept] Recorded logout intercept for student user: ${username}`);
      sendJson(res, { status: 200, ok: true, action: 'create', resource: 'dreamhack_intercept_logs', message: 'Logout interception logged' });
    }
  );
});

router.post('/solve-log', (req, res) => {
  const { username, challengeId, challengeName, timestamp } = req.body;
  if (!username || !challengeId || !challengeName) {
    return sendJson(res, {
      status: 400, ok: false, action: 'create', resource: 'dreamhack_solves',
      message: 'Invalid payload details', code: 'BAD_REQUEST'
    });
  }
  
  // 1. Log to SQLite database
  db.run(`INSERT INTO dreamhack_solves (username, challenge_id, challenge_name, timestamp) VALUES (?, ?, ?, ?)`,
    [username, challengeId, challengeName, timestamp], (err) => {
      if (err) {
        console.error('[Database Log Error] Failed to log dreamhack solve:', err.message);
        return sendJson(res, {
          status: 500, ok: false, action: 'create', resource: 'dreamhack_solves',
          message: 'Database insertion failed', code: 'DATABASE_ERROR'
        });
      }
      
      // 2. Log to log file
      const logMessage = `[${timestamp}] Operator '${username}' solved challenge '${challengeName}' (ID: ${challengeId})\n`;
      const logFilePath = path.join(__dirname, '../../log/dreamhack_solves.log');
      fs.appendFileSync(logFilePath, logMessage);
      
      console.log(`[INHACK Tracker] Solve recorded: User '${username}' solved '${challengeName}' (${challengeId})`);

      sendJson(res, {
        status: 200, ok: true, action: 'create', resource: 'dreamhack_solves',
        message: 'Solve successfully logged', code: 'SUCCESS'
      });
    }
  );
});

module.exports = router;
