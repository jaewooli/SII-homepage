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
    
    // Seed default developer account (password: 'developer_password')
    db.run(`INSERT OR IGNORE INTO users (username, password, name) 
            VALUES ('developer', '$2a$10$1MqylMlV2ta6UBokSD5e7OsadhRAq9Puecv3Z3VX606Ts4OYoTe6S', 'Developer')`);
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

async function loginDreamhack(){
  // Bypasses ReCAPTCHA by returning pre-configured session cookies if they exist in .env
  if (process.env.DREAMHACK_CSRF && process.env.DREAMHACK_SESSIONID) {
    console.log('[Dreamhack Connect] Using pre-configured session cookies.');
    return {
      'csrf_token': process.env.DREAMHACK_CSRF,
      'sessionid': process.env.DREAMHACK_SESSIONID
    };
  }

  const form = JSON.stringify({
    email: process.env.DREAMHACKEMAIL,
    password: process.env.DREAMHACKPASSWORD,
    loginSave: false,
  });

  const res = await axios.post('https://dreamhack.io/api/v1/auth/login/', form, {
//    httpsAgent: agent,
//    proxy:false,
    headers: {'Content-Type': 'application/json'},
  })
  if (res.status == 200){
    const csrfToken = res.headers['set-cookie'][0];
    sessionid = res.headers['set-cookie'][1];
    return {'csrf_token':csrfToken, 'sessionid':sessionid}
  }else{
    return null;
  }
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
    const { username } = req.session.user;
    if (!username) {
      return sendJson(res, {
      status: 400, ok: false, action: 'auth', resource: 'session',
      message: 'Username needed', code: 'LOGIN_FAILED'
    });
    }

    const logMessage = `[${new Date().toISOString()}] Login attempt for user: ${username}\n`;
    const logFilePath = path.join(__dirname, '../log/login_attempts.log');

    fs.appendFileSync(logFilePath, logMessage);

    try {
      const response = await loginDreamhack();

      sendJson(res, {
          status: 200, ok: true, action: 'auth', resource: 'dreamhack',
          message: 'Dreamhack login successful',
          data: response,
          code: 'LOGIN_SUCCESS'
        });
      
    } catch (error) {
        console.error('Dreamhack login API error:', error.response ? error.response.data : error.message);
        const detailMsg = error.response && error.response.data
          ? (typeof error.response.data === 'object' ? JSON.stringify(error.response.data) : error.response.data)
          : error.message;
        sendJson(res, {
            status: 500, ok: false, action: 'auth', resource: 'dreamhack',
            message: `Dreamhack API Error: ${detailMsg}`,
            code: 'SERVER_ERROR'
        });
    }
});

app.get('/:url', (req, res) => {
    res.redirect(`/homepage/${req.params.url}`);
});

const PORT = process.env.PORT || 8080;
app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});