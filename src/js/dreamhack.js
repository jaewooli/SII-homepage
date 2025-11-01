import { showToast } from "/assets/js/toast.js";
import {apiRequest} from "/assets/js/api.js";


async function isLoggedIn() {
  const r = await apiRequest('/me', 'GET');
  if (!r.ok) return null;
  
  return r.data;
}


function showLoginRequiredToast() {
  showToast('You need to Login first', 'error');
}

function executeSpecificFeature() {
  showToast("Special feqture!!", "success");
}

document.addEventListener('DOMContentLoaded', () => {
  const confirmbtn = document.getElementById('dreamhack-confirm');

  if (confirmbtn) {
    confirmbtn.addEventListener('click', async () => {
      if (await isLoggedIn()){
        executeSpecificFeature();
      } else{
        showLoginRequiredToast();
      }
    });
  } else {
    console.warn("Cannot find the button with id 'dreamhack-confirm'.");
  }
});