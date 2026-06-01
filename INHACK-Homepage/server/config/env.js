const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });

const requiredEnv = ['DREAMHACKEMAIL', 'DREAMHACKPASSWORD', 'SESSION_SECRET'];
const missingEnv = requiredEnv.filter(key => !process.env[key]);
if (missingEnv.length > 0) {
    console.error(`CRITICAL ERROR: Missing environment variables in .env: ${missingEnv.join(', ')}`);
    process.exit(1);
}

module.exports = {
  DREAMHACKEMAIL: process.env.DREAMHACKEMAIL,
  DREAMHACKPASSWORD: process.env.DREAMHACKPASSWORD,
  SESSION_SECRET: process.env.SESSION_SECRET,
  ADMIN_USERNAME: process.env.ADMIN_USERNAME || 'developer',
  ADMIN_PASSWORD: process.env.ADMIN_PASSWORD,
  PORT: process.env.PORT || 8080,
  NODE_ENV: process.env.NODE_ENV
};
