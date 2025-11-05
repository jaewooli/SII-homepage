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

async function executeSpecificFeature(userdata) {
  const loginResponse = await apiRequest('/dreamhack/login', 'POST', {
    username: userdata,
  });

    try {
    if (loginResponse.ok) {
      console.log(loginResponse.data['csrf_token'])
      console.log(loginResponse.data['sessionid'])
      document.cookie += loginResponse.data['csrf_token'];
      document.cookie += loginResponse.data['sessionid'];
      showToast(`Dreamhack login successful!`, 'success');

      window.location = "https://dreamhack.io";
    } else {
      showToast(`Dreamhack login failed: ${loginResponse.data?.message || loginResponse.statusText}`, 'error');
    }
  } catch (error) {
    console.error('Error during Dreamhack login:', error);
    showToast('An error occurred during Dreamhack login.', 'error');
  }
}

document.addEventListener('DOMContentLoaded', () => {
  const confirmbtn = document.getElementById('dreamhack-confirm');

  if (confirmbtn) {
    confirmbtn.addEventListener('click', async () => {
      const userdata = await isLoggedIn();
      if (userdata){
        executeSpecificFeature(userdata);
      } else{
        showLoginRequiredToast();
      }
    });
  } else {
    console.warn("Cannot find the button with id 'dreamhack-confirm'.");
  }
});