const dreamhackState = require('./dreamhackState');

async function loginDreamhack(force = false) {
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
        dreamhackState.sessionid = sessId;
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

module.exports = {
  loginDreamhack
};
