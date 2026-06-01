const path = require('path');
const fs = require('fs');
const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcryptjs');
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

    // Create site contents table for dynamic content editing
    db.run(`CREATE TABLE IF NOT EXISTS site_contents (
        section_id TEXT PRIMARY KEY,
        content_html TEXT,
        updated_at TEXT
    )`);

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

    // Seed default site contents from static files
    const sections = ['home', 'curriculum', 'seminar', 'ctf'];
    sections.forEach(sec => {
        db.get(`SELECT 1 FROM site_contents WHERE section_id = ?`, [sec], (err, row) => {
            if (!row) {
                try {
                    const filePath = path.join(__dirname, `../../src/html/fragments/${sec}.html`);
                    if (fs.existsSync(filePath)) {
                        const content = fs.readFileSync(filePath, 'utf8');
                        const timestamp = new Date().toISOString();
                        db.run(`INSERT INTO site_contents (section_id, content_html, updated_at) VALUES (?, ?, ?)`,
                            [sec, content, timestamp]);
                    }
                } catch (e) {
                    console.error(`[Seed Error] Failed to seed site content for ${sec}:`, e.message);
                }
            }
        });
    });
});

module.exports = db;
