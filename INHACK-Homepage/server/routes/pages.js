const express = require('express');
const router = express.Router();
const path = require('path');
const db = require('../config/db');
const { sendJson } = require('../helpers/response');

// / serves index.html (the SPA) directly
router.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '../../src/html/index.html'), (err) => {
    if (err) {
      res.status(404).send('<h1>404 Not Found</h1>');
    }
  });
});

// Redirect legacy /homepage requests to root /
router.get('/homepage', (req, res) => {
  res.redirect('/');
});

// Redirect legacy /homepage/main requests to root /
router.get('/homepage/main', (req, res) => {
  res.redirect('/');
});

// Block unauthorized access to admin fragment
router.get('/frags/admin.html', (req, res, next) => {
  if (!req.session.user || !req.session.user.isAdmin) {
    return res.status(403).send('Forbidden');
  }
  next();
});

// Serve fragments dynamically from database
router.get('/frags/:id.html', (req, res, next) => {
  const fragmentID = req.params.id;
  const validSections = ['home', 'curriculum', 'seminar', 'ctf', 'navigation'];
  
  if (validSections.includes(fragmentID)) {
    db.get(`SELECT content_html FROM site_contents WHERE section_id = ?`, [fragmentID], (err, row) => {
      if (err || !row) {
        // Fallback to static file if DB has error or is missing
        return next();
      }
      res.set('Content-Type', 'text/html');
      return res.send(row.content_html);
    });
  } else {
    next();
  }
});

// /homepage/:url redirects to /:url (e.g. /homepage/login -> /login)
router.get('/homepage/:url', (req, res) => {
  res.redirect(`/${req.params.url}`);
});

// Serve actual pages directly under /:url
router.get('/:url', (req, res) => {
  let fileName = req.params.url || 'index';
  if (fileName.endsWith('.html')) {
    fileName = fileName.substring(0, fileName.length - 5);
  }
  
  // Guard: Redirect unauthenticated requests to Dreamhack to login page
  if (fileName === 'dreamhack' && !req.session.user) {
    return res.redirect('/login');
  }
  
  res.sendFile(path.join(__dirname, `../../src/html/${fileName}.html`), (err) => {
    if (err) {
      if (err.code === 'ENOENT') {
        res.status(404).send('<h1>404 Not Found</h1><p>요청하신 페이지를 찾을 수 없습니다.</p>');
      } else {
        res.status(500).send('<h1>500 Internal Server Error</h1>');
      }
    }
  });
});

module.exports = router;
