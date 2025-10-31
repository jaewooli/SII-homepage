const express = require('express');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();
const bodyParser = require('body-parser');
const app = express();

app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// Serve static files
app.use('/', express.static(path.join(__dirname, '../src/html')));
app.use('/assets', express.static(path.join(__dirname, '../src')));
app.use('/images', express.static(path.join(__dirname, '../images')));
// Serve index.html
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, '../src/html/index.html'));
});

// Database connection
const db = new sqlite3.Database('./users.db');

// Create users table if it doesn't exist
db.serialize(() => {
    db.run(`CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE,
        password TEXT
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

// Signup route
app.post('/signup', (req, res) => {
    const { username, password } = req.body;

    if (!username || !password) {
    sendJson(res, {
      status: 400, ok: false, action: 'create', resource: 'users',
      message: 'username과 password가 필요합니다.',
      code: 'VALIDATION_ERROR'
    });
  }
    const query = `INSERT INTO users (username, password) VALUES (?, ?)`;

    db.run(query, [username, password], function (err) {
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
     sendJson(res, {
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
        if (row) {
            sendJson(res, {
      status: 200, ok: true, action: 'auth', resource: 'users',
      message: 'Login Success!.',
      data: { id: row.id, username: row.username },
      code: 'LOGIN_SUCCESS'
    });
        } else {
            sendJson(res, {
        status: 401, ok: false, action: 'auth', resource: 'users',
        message: 'Invalid username or password',
        code: 'INVALID_CREDENTIALS'
      });
        }
    });
});

// Start server
const PORT = 8080;
app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});