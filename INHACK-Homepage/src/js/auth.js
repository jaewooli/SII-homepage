import { apiRequest } from '/assets/js/api.js';
import { showToast } from '/assets/js/toast.js';

export async function fetchMe(){
  const r = await apiRequest('/me', 'GET');
  if (!r.ok) return null;
  return r.data;
}

document.addEventListener('DOMContentLoaded', () => {
  const loginForm = document.getElementById('login-form');
  const toast = document.getElementById('toast');

  const message = sessionStorage.getItem('toastMessage');
  const type = sessionStorage.getItem('toastType');

  if (message) {
    sessionStorage.removeItem('toastMessage');
    sessionStorage.removeItem('toastType');
    showToast(message, type || 'info');
  }
  



  if (loginForm) {
    const msgBox = document.getElementById('login-message');
    loginForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const body = {
        username: loginForm.username.value.trim(),
        password: loginForm.password.value.trim(),
      };

      const r = await apiRequest('/login', 'POST', body);
      const msg = r.message =='Success' ? 'Login Success': r.message;
      const type = r.ok ? 'success' : 'error';
      showToast(msg, type);

      sessionStorage.setItem('toastMessage', msg);
      sessionStorage.setItem('toastType', type);
      if (r.ok) {
        if (body.username === 'developer') {
          sessionStorage.setItem('adminJustLoggedIn', 'true');
        }
        location.href = '/';
      }
      else{
        location.reload();
      }
    });
  }
});