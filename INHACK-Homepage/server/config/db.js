const path = require('path');
const fs = require('fs');
const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcryptjs');
const { marked } = require('marked');
const env = require('./env');

const dbPath = path.join(__dirname, '../../users.db');
const db = new sqlite3.Database(dbPath);

db.serialize(() => {
    // Create users table if it doesn't exist
    db.run(`CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE,
        password TEXT,
        name TEXT
    )`);
    
    // Add password_changed column for tracking initial login states (E2E Migration)
    db.run(`ALTER TABLE users ADD COLUMN password_changed INTEGER DEFAULT 0`, [], (err) => {
        if (err && !err.message.includes('duplicate column name')) {
            console.error('[Database Migration] Failed to add password_changed column:', err.message);
        }
    });
    
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

    // Create site contents table for dynamic content editing (with content_md)
    db.run(`CREATE TABLE IF NOT EXISTS site_contents (
        section_id TEXT PRIMARY KEY,
        content_md TEXT,
        content_html TEXT,
        updated_at TEXT
    )`);

    // Perform database migration to add content_md to site_contents if it doesn't exist
    db.run(`ALTER TABLE site_contents ADD COLUMN content_md TEXT`, [], (err) => {
        if (err && !err.message.includes('duplicate column name')) {
            console.error('[Database Migration] Failed to add content_md column:', err.message);
        }
    });

    // Seed default developer account dynamically from environment variables
    const adminUser = env.ADMIN_USERNAME;
    const adminPass = env.ADMIN_PASSWORD;
    
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
    if (env.NODE_ENV !== 'production') {
        db.run(`INSERT OR IGNORE INTO users (username, password, name) 
                VALUES ('123', '$2a$10$eTZ.B/MOrL.i7qceTaDnM.fLD627Xp/yFhTqQZaeFbgNGPBhWyXay', 'TestUser123')`);
    }

    // Compile physical markdown files to HTML and seed/update database on server startup
    const sections = ['home', 'curriculum', 'seminar', 'ctf'];
    sections.forEach(sec => {
        try {
            const mdPath = path.join(__dirname, `../../src/html/fragments/${sec}.md`);
            const htmlPath = path.join(__dirname, `../../src/html/fragments/${sec}.html`);
            
            let contentMd = '';
            
            // If the .md file doesn't exist, try initializing it from the static HTML content
            if (!fs.existsSync(mdPath)) {
                if (fs.existsSync(htmlPath)) {
                    const contentHtml = fs.readFileSync(htmlPath, 'utf8');
                    contentMd = contentHtml; // initial MD source fallback
                    fs.writeFileSync(mdPath, contentMd, 'utf8');
                } else {
                    contentMd = `# ${sec.toUpperCase()} Section\n\nDefault content for ${sec}.`;
                    fs.writeFileSync(mdPath, contentMd, 'utf8');
                }
            } else {
                contentMd = fs.readFileSync(mdPath, 'utf8');
            }
            
            // Convert .md to HTML on server startup
            const contentHtml = marked.parse(contentMd);
            
            // Apply HTML back to static html fragment
            fs.writeFileSync(htmlPath, contentHtml, 'utf8');
            
            // Store / update content in DB
            const timestamp = new Date().toISOString();
            db.run(`INSERT OR REPLACE INTO site_contents (section_id, content_md, content_html, updated_at) VALUES (?, ?, ?, ?)`,
                [sec, contentMd, contentHtml, timestamp]);
        } catch (e) {
            console.error(`[Startup Seed/Compile Error] Failed for section ${sec}:`, e.message);
        }
    });
});

module.exports = db;
