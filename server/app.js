const express = require('express');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();
const bodyParser = require('body-parser');
const session = require('express-session');
const SQLiteStore = require('connect-sqlite3')(session);

const helmet = require("helmet");
const cors = require("cors");


const app = express();

app.use(express.urlencoded({ extended: true }));
app.use(express.json());

app.use(helmet({
  contentSecurityPolicy:false,
}));

app.use(cors({
  origin:true,
  credentials:true,
}));

app.use(session({
    name:process.env.SESSION_NAME || 'sessionid',
    store: new SQLiteStore({
      db:'sessions.sqlite',
      dir:'./'
    }),
    secret:process.env.SESSION_SECRET || 'default',
    resave:false,
    saveUninitialized:false,
    cookie:{
      maxAge:24*60*60*1000,
      sameSite:'lax',
      // secure:process.env.NODE_ENV === 'production'
    },
    rolling:false,
}));

// Serve static files
app.use('/frags', express.static(path.join(__dirname, '../src/html/fragments')));
app.use('/assets', express.static(path.join(__dirname, '../src')));
app.use('/images', express.static(path.join(__dirname, '../images')));

// Database connection
const db = new sqlite3.Database('./users.db');

// Create users table if it doesn't exist
db.serialize(() => {
    db.run(`CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE,
        password TEXT,
        name TEXT
    )`);
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
}


app.get('/', (req, res) => {
  res.redirect('/homepage');
});

// /homepage 경로로 접근 시 index.html 파일을 제공합니다.
app.get('/homepage', (req, res) => {
  res.redirect('/homepage/main');
});

app.get('/homepage/main', (req, res) => {
    res.sendFile(path.join(__dirname, '../src/html/index.html'));
});

app.get('/homepage/:url', (req, res) => {
    res.sendFile(path.join(__dirname, `../src/html/${req.params.url || 'index.html'}`));
});


// Signup route
app.post('/signup', (req, res) => {
    const { username, password, name } = req.body;
    if (!username || !password || !name) {
    return sendJson(res, {
      
      status: 400, ok: false, action: 'create', resource: 'users',
      message: 'username과 password가 필요합니다.',
      code: 'VALIDATION_ERROR'
    });
  }
    const query = `INSERT INTO users (username, password, name) VALUES (?, ?, ?)`;

    db.run(query, [username, password, name], function (err) {
        if (err) {
            if (err.code === 'SQLITE_CONSTRAINT') {
                sendJson(res, {
          status: 400, ok: false, action: 'create', resource: 'users',
          message: 'Username already exists.',
          code: 'USER_EXISTS'
        });
        }else{
             sendJson(res, {
        status: 500, ok: false, action: 'create', resource: 'users',
        message: 'Database error',
        code: 'DB_ERROR'
        });
        }}else{
        sendJson(res, {
      status: 201, ok: true, action: 'create', resource: 'users',
      message: 'Signup Success!',
      data: { id: this.lastID, username },
      code: 'USER_CREATED'
    });
  }
    });
});

// Login route
app.post('/login', (req, res) => {
    const { username, password } = req.body;
     if (!username || !password) {
     return sendJson(res, {
      status: 400, ok: false, action: 'auth', resource: 'users',
      message: 'username과 password가 필요합니다.',
      code: 'VALIDATION_ERROR'
    });
    }
    const query = `SELECT * FROM users WHERE username = ? AND password = ?`;

    db.get(query, [username, password], (err, row) => {
        if (err) {
             sendJson(res, {
              status: 500, ok: false, action: 'auth', resource: 'users',
              message: 'Database error',
              code: 'DB_ERROR'
            });
        }
        if (!row) {
          sendJson(res, {
        status: 401, ok: false, action: 'auth', resource: 'users',
        message: 'Invalid username or password',
        code: 'INVALID_CREDENTIALS'
    });
        } else {
        req.session.user = { id: row.id, username:row.username, name:row.name };
        sendJson(res, {
      status: 200, ok: true, action: 'auth', resource: 'users',
      message: 'Login Success!.',
      data: { id: row.id, username: row.username },
      code: 'LOGIN_SUCCESS'
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

// Start server
const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});