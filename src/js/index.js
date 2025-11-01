import { showToast } from '/assets/js/toast.js';
import { fetchMe } from '/assets/js/auth.js';

function renderUserUI(user){
  let loginbtn = document.getElementById('login-btn');
  let signupbtn = document.getElementById('signup-btn');
  let logoutbtn = document.getElementById('logout-btn');

  if (user) {
    loginbtn.hidden = true;
    signupbtn.hidden = true;

    logoutbtn = document.createElement('button');
    logoutbtn.id = 'logout-btn';
    logoutbtn.textContent = 'Logout';
    document.querySelector('nav').appendChild(logoutbtn);

    logoutbtn.addEventListener('click', async() => {
      const res = await fetch('/logout', {
        method: 'POST',
      });

      if (res.ok) {
        location.href = '/';
      } else {
        showToast('Logout failed', 'error');
      }
    });
  }
}

document.addEventListener('DOMContentLoaded', async() => {
  const me = await fetchMe();
  renderUserUI(me);

  const message = sessionStorage.getItem('toastMessage');
  const type = sessionStorage.getItem('toastType');

  if (message) {
    sessionStorage.removeItem('toastMessage');
    sessionStorage.removeItem('toastType');
    showToast(message, type || 'info');
  }
});