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
const puppeteer = require('puppeteer');

// Headless Chrome Login to Dreamhack
async function loginDreamhackWithPuppeteer() {
  console.log('[Headless Chrome] Launching browser...');
  const browser = await puppeteer.launch({
    headless: 'new',
    executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
      '--disable-blink-features=AutomationControlled',
      '--window-size=1920,1080'
    ]
  });

  let page = null;
  try {
    page = await browser.newPage();
    
    // Bypass webdriver detection
    await page.evaluateOnNewDocument(() => {
      Object.defineProperty(navigator, 'webdriver', {
        get: () => false,
      });
    });

    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
    
    console.log('[Headless Chrome] Navigating to Dreamhack login page...');
    await page.goto('https://dreamhack.io/login/', { waitUntil: 'networkidle2', timeout: 30000 });

    await page.waitForSelector('input[type="email"]', { timeout: 10000 });

    console.log('[Headless Chrome] Submitting credentials...');
    await page.type('input[type="email"]', process.env.DREAMHACKEMAIL, { delay: 50 });
    await page.type('input[type="password"]', process.env.DREAMHACKPASSWORD, { delay: 50 });

    const submitBtn = await page.waitForSelector('button[type="submit"]');
    await Promise.all([
      submitBtn.click(),
      page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 30000 })
    ]);

    console.log('[Headless Chrome] Login submitted. Extracting cookies...');
    const cookies = await page.cookies();
    const sessionidCookie = cookies.find(c => c.name === 'sessionid');
    const csrfCookie = cookies.find(c => c.name === 'csrf_token' || c.name === 'csrftoken');

    if (sessionidCookie && sessionidCookie.value) {
      console.log('[Headless Chrome] Login success. Cookies captured.');
      return {
        sessionid: sessionidCookie.value,
        csrftoken: csrfCookie ? csrfCookie.value : ''
      };
    } else {
      console.error('[Headless Chrome] Failed to find sessionid cookie in login page response.');
    }
  } catch (err) {
    console.error('[Headless Chrome] Login routine error:', err.message);
    if (page) {
      try {
        const html = await page.content();
        console.log('[Headless Chrome] Error page HTML snippet:', html.substring(0, 1500));
        const screenshotPath = path.join(__dirname, '../log/error_screenshot.png');
        await page.screenshot({ path: screenshotPath });
        console.log(`[Headless Chrome] Error screenshot saved to: ${screenshotPath}`);
      } catch (e) {
        console.error('[Headless Chrome] Failed to record error state:', e.message);
      }
    }
  } finally {
    await browser.close();
  }
  return null;
}

const app = express();
app.set('trust proxy', 1);

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
      imgSrc: ["'self'", "data:", "http://127.0.0.1:8080", "http://localhost:8080", "https://dreamhack.io"],
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
    rolling:true,
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

    // Create dreamhack logout interception logs table
    db.run(`CREATE TABLE IF NOT EXISTS dreamhack_intercept_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT,
        ip_address TEXT,
        timestamp TEXT
    )`);

    // Create admin encrypted credentials table for E2E security
    db.run(`CREATE TABLE IF NOT EXISTS admin_credentials (
        id INTEGER PRIMARY KEY,
        email TEXT,
        encrypted_password TEXT,
        iv TEXT,
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
      let cookies = [];
      if (typeof loginRes.headers.getSetCookie === 'function') {
        cookies = loginRes.headers.getSetCookie();
      } else {
        const rawCookie = loginRes.headers.get('set-cookie');
        if (rawCookie) {
          cookies = [rawCookie];
        }
      }
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

            const adminUser = process.env.ADMIN_USERNAME || 'developer';
            const isAdmin = (row.username === adminUser);
            req.session.user = { id: row.id, username: row.username, name: row.name, isAdmin };
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

// Get encrypted credentials for E2E decryption in chrome extension
app.get('/dreamhack/encrypted-credentials', (req, res) => {
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
      return sendJson(res, {
        status: 404, ok: false, action: 'read', resource: 'dreamhack_credentials',
        message: 'No encrypted credentials found', code: 'NOT_FOUND'
      });
    }

    sendJson(res, {
      status: 200, ok: true, action: 'read', resource: 'dreamhack_credentials',
      data: {
        email: process.env.DREAMHACKEMAIL || '',
        encryptedPassword: row.encrypted_password,
        iv: row.iv
      },
      code: 'SUCCESS'
    });
  });
});

// Update encrypted credentials from client side (E2E Encrypted)
app.post('/dreamhack/encrypted-credentials', (req, res) => {
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

app.post('/dreamhack/regenerate', async (req, res) => {
  const adminUser = process.env.ADMIN_USERNAME || 'developer';
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
  fs.appendFileSync(path.join(__dirname, '../log/login_attempts.log'), logMessage);

  // Sync server-side global variables (using first session as primary)
  const primarySession = sessions[0];
  sessionid = primarySession.sessionid;
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

app.get('/dreamhack/logs', async (req, res) => {
  if (!req.session.user) {
    return sendJson(res, {
      status: 401, ok: false, action: 'read', resource: 'dreamhack_logs',
      message: 'Unauthorized access', code: 'UNAUTHORIZED'
    });
  }

  const { username, isAdmin: sessionIsAdmin } = req.session.user;
  const adminUser = process.env.ADMIN_USERNAME || 'developer';
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
    const { id, username, isAdmin: sessionIsAdmin } = req.session.user;
    const adminUser = process.env.ADMIN_USERNAME || 'developer';
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
    const logFilePath = path.join(__dirname, '../log/login_attempts.log');

    fs.appendFileSync(logFilePath, logMessage);

    try {
      // Synchronize client session tokens to server global variables (use first one as default)
      const primarySession = sessions[0];
      sessionid = primarySession.sessionid;
      
      process.env.DREAMHACK_SESSIONID = primarySession.sessionid;
      if (primarySession.csrftoken) {
        process.env.DREAMHACK_CSRF = primarySession.csrftoken;
      }



      console.log(`[Dreamhack Sync] Successfully synchronized ${sessions.length} session cookies for user: ${username}`);

      sendJson(res, {
          status: 200, ok: true, action: 'auth', resource: 'dreamhack',
          message: 'Dreamhack login successful',
          data: { sessionid, csrf_token: primarySession.csrftoken },
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
        valid_sessions: rows.length
      },
      code: 'SUCCESS'
    });
  });
});

app.post('/dreamhack/invalidate-session', (req, res) => {
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

app.post('/dreamhack/clear-shared-session', (req, res) => {
  const adminUser = process.env.ADMIN_USERNAME || 'developer';
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

app.post('/dreamhack/intercept-logout', (req, res) => {
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
      fs.appendFileSync(path.join(__dirname, '../log/logout_intercepts.log'), logMessage);
      
      console.log(`[INHACK Intercept] Recorded logout intercept for student user: ${username}`);
      sendJson(res, { status: 200, ok: true, action: 'create', resource: 'dreamhack_intercept_logs', message: 'Logout interception logged' });
    }
  );
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