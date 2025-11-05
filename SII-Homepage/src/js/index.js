import { showToast } from '/assets/js/toast.js';
import { fetchMe } from '/assets/js/auth.js';

const contentArea = document.getElementById('view');

async function loadContent(fragmentID){
  let url = '';
  if (fragmentID){
    url = `/frags/${fragmentID}.html`;
  }else{
    url = `/frags/home.html`;
  }
  try{
    const response = await fetch(url);
    if (!response.ok){
      throw new Error('Network response was not ok');
  }
  const htmlContent = await response.text();
  contentArea.innerHTML = htmlContent;
  }catch(err){
    console.error('Failed to load content:', err);
    contentArea.innerHTML = '<p>Failed to load content. Please try again later.</p>';
  }
}

window.addEventListener('DOMContentLoaded', () => {
  const initialFragment = window.location.hash.substring(1);
  loadContent(initialFragment);
});

window.addEventListener('hashchange', () => {
  const fragmentID = window.location.hash.substring(1);
  loadContent(fragmentID);
});

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