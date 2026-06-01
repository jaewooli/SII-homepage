const path = require('path');
const fs = require('fs');
const express = require('express');
const session = require('express-session');
const SQLiteStore = require('connect-sqlite3')(session);
const rateLimit = require('express-rate-limit');
const helmet = require("helmet");

// Load Environment Configuration First
const env = require('./config/env');

// Import DB Instance
const db = require('./config/db');

// Create Express App
const app = express();
app.set('trust proxy', 1);

// Ensure log directory exists
const logDir = path.join(__dirname, '../log');
if (!fs.existsSync(logDir)) {
    fs.mkdirSync(logDir, { recursive: true });
}

// Security headers with Helmet
app.use(helmet({
  crossOriginEmbedderPolicy: false,
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      fontSrc: ["'self'", "https://fonts.gstatic.com"],
      imgSrc: ["'self'", "data:", "http:", "https:"],
      scriptSrc: ["'self'", "'unsafe-inline'"],
      connectSrc: ["'self'", "http://127.0.0.1:8080", "http://localhost:8080", "https://dreamhack.io"]
    }
  }
}));

// Request Body Parsers
app.use(express.urlencoded({ limit: '10mb', extended: true }));
app.use(express.json({ limit: '10mb' }));

// Session Middleware
const sessionStore = new SQLiteStore({
  db: 'sessions.sqlite',
  dir: path.join(__dirname, '..')
});
sessionStore.on('error', (err) => {
  console.error('[Session Store Error] Failed to interact with SQLite session database:', err.message);
});

app.use(session({
    name: env.SESSION_NAME,
    store: sessionStore,
    secret: env.SESSION_SECRET || 'default',
    resave: false,
    saveUninitialized: false,
    cookie: {
      maxAge: 24 * 60 * 60 * 1000,
      sameSite: 'lax',
      secure: false,
      httpOnly: true
    },
    rolling: true,
}));

// Global Password Change Enforcer Middleware
const { passwordEnforceMiddleware } = require('./middlewares/auth');
app.use(passwordEnforceMiddleware);

// Rate Limiting
app.use(rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 500,
  message: '너무 많은 요청을 보냈습니다. 10분 후에 다시 시도해주세요.',
  standardHeaders: true,
  legacyHeaders: false,
}));

// Import Routers
const authRouter = require('./routes/auth');
const adminRouter = require('./routes/admin');
const dreamhackRouter = require('./routes/dreamhack');
const pagesRouter = require('./routes/pages');

// API Routers
app.use('/', authRouter);
app.use('/admin', adminRouter);
app.use('/dreamhack', dreamhackRouter);

// Pages & Fragment Router (Requires higher priority than static /frags)
app.use('/', pagesRouter);

// Static Directories
app.use('/frags', express.static(path.join(__dirname, '../src/html/fragments')));
app.use('/assets', express.static(path.join(__dirname, '../src')));
app.use('/images', express.static(path.join(__dirname, '../images')));

// Server Listen
const PORT = env.PORT;
app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});