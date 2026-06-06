const env = require('../config/env');
const { sendJson } = require('../helpers/response');

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

function passwordEnforceMiddleware(req, res, next) {
  const isAuthOrStatic = req.path === '/' ||
                         req.path.startsWith('/login') || 
                         req.path.startsWith('/logout') || 
                         req.path.startsWith('/me') || 
                         req.path.startsWith('/change-password') || 
                         req.path.startsWith('/mypage') ||
                         req.path.startsWith('/assets') || 
                         req.path.startsWith('/images') ||
                         req.path === '/frags/home.html';

  if (req.session && req.session.user) {
    const user = req.session.user;
    const isEnforced = (!user.isAdmin) || (user.isAdmin && !user.isSuperAdmin && user.createdAsAdmin === 1);

    if (isEnforced && user.passwordChanged === 0 && !isAuthOrStatic) {
      if (req.headers.accept && req.headers.accept.includes('text/html')) {
        if (req.path.startsWith('/frags/') && req.path !== '/frags/home.html') {
          return res.status(403).send('<div style="color:#ff4b4b;text-align:center;padding:20px;font-family:sans-serif;font-weight:bold;">비밀번호 변경이 필요합니다.</div>');
        }
        return res.redirect(env.BASE_PATH || '/homepage');
      }
      return sendJson(res, {
        status: 403,
        ok: false,
        message: '최초 로그인 후 비밀번호 변경이 필요합니다.',
        code: 'PASSWORD_CHANGE_REQUIRED'
      });
    }
  }
  next();
}

module.exports = {
  validateLogin,
  passwordEnforceMiddleware
};
