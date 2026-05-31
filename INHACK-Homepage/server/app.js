const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

// Verify environment variables on startup
const requiredEnv = ['DREAMHACKEMAIL', 'DREAMHACKPASSWORD', 'SESSION_SECRET'];
const missingEnv = requiredEnv.filter(key => !process.env[key]);
if (missingEnv.length > 0) {
    console.error(`CRITICAL ERROR: Missing environment variables in .env: ${missingEnv.join(', ')}`);
    process.exit(1);
}


const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const session = require('express-session');
const SQLiteStore = require('connect-sqlite3')(session);
const rateLimit = require('express-rate-limit');

const helmet = require("helmet");
const axios = require('axios');
const fs = require('fs');
const bcrypt = require('bcryptjs');

const app = express();

// Ensure log directory exists
const logDir = path.join(__dirname, '../log');
if (!fs.existsSync(logDir)) {
    fs.mkdirSync(logDir, { recursive: true });
}

app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      fontSrc: ["'self'", "https://fonts.gstatic.com"],
      imgSrc: ["'self'", "data:", "/images/", "http://127.0.0.1:8080", "http://localhost:8080", "https://dreamhack.io"],
      scriptSrc: ["'self'", "'unsafe-inline'"],
      connectSrc: ["'self'", "http://127.0.0.1:8080", "http://localhost:8080", "https://dreamhack.io"]
    }
  }
}));

let sessionid = "";

app.use(express.urlencoded({ extended: true }));
app.use(express.json());

app.use(session({
    name:process.env.SESSION_NAME || 'sid',
    store: new SQLiteStore({
      db:'sessions.sqlite',
      dir: path.join(__dirname, '..')
    }),
    secret:process.env.SESSION_SECRET || 'default',
    resave:false,
    saveUninitialized:false,
    cookie:{
      maxAge:24*60*60*1000,
      sameSite:'lax',
      secure: false,
      httpOnly: true
    },
    rolling:false,
}));

app.use(rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 500,
  message: '너무 많은 요청을 보냈습니다. 10분 후에 다시 시도해주세요.',
  standardHeaders: true,
  legacyHeaders: false,
}));
// Serve static files
app.use('/frags', express.static(path.join(__dirname, '../src/html/fragments')));
app.use('/assets', express.static(path.join(__dirname, '../src')));
app.use('/images', express.static(path.join(__dirname, '../images')));

// Database connection
const db = new sqlite3.Database(path.join(__dirname, '../users.db'));

// Create users table if it doesn't exist
db.serialize(() => {
    db.run(`CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE,
        password TEXT,
        name TEXT
    )`);
    
    // Create dreamhack access tracking log table
    db.run(`CREATE TABLE IF NOT EXISTS dreamhack_access_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER,
        username TEXT,
        ip_address TEXT,
        timestamp TEXT
    )`);

    // Create dreamhack challenge solve logs table
    db.run(`CREATE TABLE IF NOT EXISTS dreamhack_solves (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT,
        challenge_id TEXT,
        challenge_name TEXT,
        timestamp TEXT
    )`);

    // Create shared session table if it doesn't exist
    db.run(`CREATE TABLE IF NOT EXISTS shared_session (
        id INTEGER PRIMARY KEY,
        sessionid TEXT,
        csrftoken TEXT,
        updated_at TEXT
    )`);

    // Seed default developer account dynamically from environment variables
    const adminUser = process.env.ADMIN_USERNAME || 'developer';
    const adminPass = process.env.ADMIN_PASSWORD;
    
    if (adminPass) {
        const hashedPassword = bcrypt.hashSync(adminPass, 10);
        db.run(`INSERT OR IGNORE INTO users (username, password, name) 
                VALUES (?, ?, 'Developer')`, [adminUser, hashedPassword], (err) => {
            if (err) {
                console.error('[Database Seed Error] Failed to seed admin user:', err.message);
            }
        });
    } else {
        console.warn('WARNING: ADMIN_PASSWORD environment variable is not set. Default admin seeding skipped.');
    }

    // Only seed test account if NOT in production
    if (process.env.NODE_ENV !== 'production') {
        db.run(`INSERT OR IGNORE INTO users (username, password, name) 
                VALUES ('123', '$2a$10$eTZ.B/MOrL.i7qceTaDnM.fLD627Xp/yFhTqQZaeFbgNGPBhWyXay', 'TestUser123')`);
    }
});

function sendJson(res, {
  status = 200,
  ok = true,
  action = 'read', 
  resource = 'users',
  message = '',
  data = null,
  code = 'OK',
} = {}) {
 res.status(status).json({ ok, action, resource, message, data, code });
};

function sanitizeString(str) {
  if (typeof str !== 'string') return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;')
    .replace(/\//g, '&#x2F;');
}


function validateLogin(req, res, next) {
  const { username, password } = req.body;
  if (!username || !password) {
    return sendJson(res, {
      status: 400, ok: false, action: 'auth', resource: 'users',
      message: 'username과 password가 필요합니다.',
      code: 'VALIDATION_ERROR'
    });
  }
  next();
}

async function loginDreamhack(force = false){
  // Bypasses ReCAPTCHA by returning pre-configured session cookies if they exist in .env
  if (!force && process.env.DREAMHACK_CSRF && process.env.DREAMHACK_SESSIONID) {
    console.log('[Dreamhack Connect] Using pre-configured session cookies.');
    return {
      'csrf_token': process.env.DREAMHACK_CSRF,
      'sessionid': process.env.DREAMHACK_SESSIONID
    };
  }

  try {
    const loginRes = await fetch('https://dreamhack.io/api/v1/auth/login/', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      },
      body: JSON.stringify({
        email: process.env.DREAMHACKEMAIL,
        password: process.env.DREAMHACKPASSWORD,
        loginSave: false
      })
    });

    if (loginRes.ok) {
      const cookies = loginRes.headers.getSetCookie();
      let csrfToken = '';
      let sessId = '';
      
      cookies.forEach(cookie => {
        if (cookie.startsWith('csrftoken=') || cookie.startsWith('csrf_token=')) {
          csrfToken = cookie.split(';')[0].split('=')[1];
        } else if (cookie.startsWith('sessionid=')) {
          sessId = cookie.split(';')[0].split('=')[1];
        }
      });

      if (sessId) {
        sessionid = sessId;
        process.env.DREAMHACK_SESSIONID = sessId;
        if (csrfToken) {
          process.env.DREAMHACK_CSRF = csrfToken;
        }
        return { 'csrf_token': csrfToken, 'sessionid': sessId };
      }
    } else {
      const errText = await loginRes.text();
      console.error('[Dreamhack Server Login] Login failed with status:', loginRes.status, errText);
    }
  } catch (err) {
    console.error('[Dreamhack Server Login] Error during fetch:', err.message);
  }
  return null;
}

app.get('/', (req, res) => {
  res.redirect('/homepage');
});

// /homepage 경로로 접근 시 index.html 파일을 제공합니다.
app.get('/homepage', (req, res) => {
  res.redirect('/homepage/main');
});

app.get('/homepage/main', (req, res) => {
    res.sendFile(path.join(__dirname, '../src/html/index.html'), (err) => {
        if (err) {
            res.status(404).send('<h1>404 Not Found</h1>');
        }
    });
});
app.get('/homepage/:url', (req, res) => {
  let fileName = req.params.url || 'index';
  if (fileName.endsWith('.html')) {
    fileName = fileName.substring(0, fileName.length - 5);
  }
  
  // Guard: Redirect unauthenticated requests to Dreamhack to login page
  if (fileName === 'dreamhack' && !req.session.user) {
    return res.redirect('/homepage/login');
  }
  
  res.sendFile(path.join(__dirname, `../src/html/${fileName}.html`), (err) => {
    if (err) {
      if (err.code === 'ENOENT') {
        res.status(404).send('<h1>404 Not Found</h1><p>요청하신 페이지를 찾을 수 없습니다.</p>');
      } else {
        res.status(500).send('<h1>500 Internal Server Error</h1>');
      }
    }
  });
});

// Login route
app.post('/login', validateLogin, (req, res) => {
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

            req.session.user = { id: row.id, username: row.username, name: row.name };
            sendJson(res, {
                status: 200, ok: true, action: 'auth', resource: 'users',
                message: 'Login Success!.',
                code: 'LOGIN_SUCCESS'
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

app.get('/me', (req, res) => {
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

app.get('/dreamhack/credentials', (req, res) => {
  if (!req.session.user || req.session.user.username !== 'developer') {
    return sendJson(res, {
      status: 403, ok: false, action: 'read', resource: 'dreamhack',
      message: 'Only the administrator can access credentials', code: 'FORBIDDEN'
    });
  }
  
  const { id, username } = req.session.user;
  const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || req.ip;
  const timestamp = new Date().toISOString();
  
  // 1. Log to SQLite database
  db.run(`INSERT INTO dreamhack_access_logs (user_id, username, ip_address, timestamp) VALUES (?, ?, ?, ?)`, 
    [id, username, ip, timestamp], (err) => {
      if (err) {
        console.error('[Database Log Error] Failed to log dreamhack credential fetch:', err.message);
      }
    }
  );
  
  // 2. Log to log file
  const logMessage = `[${timestamp}] User '${username}' (ID: ${id}) requested Dreamhack credentials from IP: ${ip}\n`;
  const logFilePath = path.join(__dirname, '../log/dreamhack_sync.log');
  fs.appendFileSync(logFilePath, logMessage);

  sendJson(res, {
    status: 200, ok: true, action: 'read', resource: 'dreamhack',
    data: {
      email: process.env.DREAMHACKEMAIL,
      password: process.env.DREAMHACKPASSWORD
    },
    code: 'SUCCESS'
  });
});

app.get('/dreamhack/logs', async (req, res) => {
  if (!req.session.user) {
    return sendJson(res, {
      status: 401, ok: false, action: 'read', resource: 'dreamhack_logs',
      message: 'Unauthorized access', code: 'UNAUTHORIZED'
    });
  }

  const { username } = req.session.user;
  const isAdmin = (username === 'developer');

  let queryAccess = `SELECT username, ip_address, timestamp FROM dreamhack_access_logs ORDER BY timestamp DESC LIMIT 50`;
  let querySolves = `SELECT username, challenge_id, challenge_name, timestamp FROM dreamhack_solves ORDER BY timestamp DESC LIMIT 50`;
  let queryParams = [];

  if (!isAdmin) {
    queryAccess = `SELECT username, ip_address, timestamp FROM dreamhack_access_logs WHERE username = ? ORDER BY timestamp DESC LIMIT 50`;
    querySolves = `SELECT username, challenge_id, challenge_name, timestamp FROM dreamhack_solves WHERE username = ? ORDER BY timestamp DESC LIMIT 50`;
    queryParams = [username];
  }

  const queryPromise = (sql, params) => new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) reject(err);
      else resolve(rows);
    });
  });

  try {
    const [accessLogs, solveLogs] = await Promise.all([
      queryPromise(queryAccess, queryParams),
      queryPromise(querySolves, queryParams)
    ]);

    sendJson(res, {
      status: 200, ok: true, action: 'read', resource: 'dreamhack_logs',
      data: {
        accessLogs,
        solveLogs
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

app.post('/logout', (req, res) => {
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

app.post('/dreamhack/login', async (req, res) => {
    const { id, username } = req.session.user;
    if (username !== 'developer') {
      return sendJson(res, {
        status: 403, ok: false, action: 'auth', resource: 'dreamhack',
        message: 'Only the administrator can synchronize the shared session',
        code: 'UNAUTHORIZED'
      });
    }

    const { sessionid: clientSessionid, csrftoken: clientCsrftoken } = req.body;
    if (!clientSessionid) {
      return sendJson(res, {
        status: 400, ok: false, action: 'auth', resource: 'dreamhack',
        message: 'Dreamhack sessionid is required', code: 'LOGIN_FAILED'
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

    // Save session to shared_session table
    db.run(`INSERT OR REPLACE INTO shared_session (id, sessionid, csrftoken, updated_at) 
            VALUES (1, ?, ?, ?)`, [clientSessionid, clientCsrftoken, timestamp], (err) => {
      if (err) {
        console.error('[Database Log Error] Failed to save shared session:', err.message);
      }
    });

    const logMessage = `[${timestamp}] Cookie sync for user: ${username} from IP: ${ip}\n`;
    const logFilePath = path.join(__dirname, '../log/login_attempts.log');

    fs.appendFileSync(logFilePath, logMessage);

    try {
      // Synchronize client session tokens to server global variables
      sessionid = clientSessionid;
      
      process.env.DREAMHACK_SESSIONID = clientSessionid;
      if (clientCsrftoken) {
        process.env.DREAMHACK_CSRF = clientCsrftoken;
      }

      console.log(`[Dreamhack Sync] Successfully synchronized session cookies for user: ${username}`);

      sendJson(res, {
          status: 200, ok: true, action: 'auth', resource: 'dreamhack',
          message: 'Dreamhack login successful',
          data: { sessionid, csrf_token: clientCsrftoken },
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

app.get('/dreamhack/shared-session', (req, res) => {
  if (!req.session || !req.session.user) {
    return sendJson(res, {
      status: 401, ok: false, action: 'read', resource: 'dreamhack',
      message: 'Unauthorized', code: 'UNAUTHORIZED'
    });
  }

  db.get(`SELECT sessionid, csrftoken, updated_at FROM shared_session WHERE id = 1`, [], (err, row) => {
    if (err) {
      console.error('[Database Read Error] Failed to read shared session:', err.message);
      return sendJson(res, {
        status: 500, ok: false, action: 'read', resource: 'dreamhack',
        message: 'Database error', code: 'DATABASE_ERROR'
      });
    }
    if (!row) {
      return sendJson(res, {
        status: 404, ok: false, action: 'read', resource: 'dreamhack',
        message: 'Shared session not found', code: 'NOT_FOUND'
      });
    }

    sendJson(res, {
      status: 200, ok: true, action: 'read', resource: 'dreamhack',
      data: {
        sessionid: row.sessionid,
        csrftoken: row.csrftoken,
        updated_at: row.updated_at
      },
      code: 'SUCCESS'
    });
  });
});

app.post('/dreamhack/clear-shared-session', (req, res) => {
  if (!req.session.user || req.session.user.username !== 'developer') {
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
    sessionid = "";
    process.env.DREAMHACK_SESSIONID = "";
    process.env.DREAMHACK_CSRF = "";

    console.log('[Dreamhack Sync] Shared session cleared by admin.');
    sendJson(res, {
      status: 200, ok: true, action: 'delete', resource: 'dreamhack',
      message: 'Shared session cleared successfully', code: 'SUCCESS'
    });
  });
});

app.post('/dreamhack/solve-log', (req, res) => {
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
      const logFilePath = path.join(__dirname, '../log/dreamhack_solves.log');
      fs.appendFileSync(logFilePath, logMessage);
      
      console.log(`[INHACK Tracker] Solve recorded: User '${username}' solved '${challengeName}' (${challengeId})`);

      sendJson(res, {
        status: 200, ok: true, action: 'create', resource: 'dreamhack_solves',
        message: 'Solve successfully logged', code: 'SUCCESS'
      });
    }
  );
});

app.get('/:url', (req, res) => {
    res.redirect(`/homepage/${req.params.url}`);
});

const PORT = process.env.PORT || 8080;
app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});