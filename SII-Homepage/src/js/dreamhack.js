import { showToast } from "/assets/js/toast.js";
import { apiRequest } from "/assets/js/api.js";

async function isLoggedIn() {
  const r = await apiRequest('/me', 'GET');
  if (!r.ok) return null;
  
  return r.data;
}

function showLoginRequiredToast() {
  showToast('You need to Login first', 'error');
}

function checkExtensionInstalled() {
  return document.documentElement.dataset.siiExtensionInstalled === "true";
}

function updateExtensionStatus() {
  const statusBadge = document.getElementById('ext-status');
  if (!statusBadge) return;

  if (checkExtensionInstalled()) {
    statusBadge.className = 'status-badge status-connected';
    statusBadge.innerHTML = '<span class="status-dot"></span>Extension: Connected';
  } else {
    statusBadge.className = 'status-badge status-disconnected';
    statusBadge.innerHTML = '<span class="status-dot"></span>Extension: Not Detected';
  }
}

async function executeSpecificFeature(userdata) {
  const isExtensionInstalled = checkExtensionInstalled();
  if (!isExtensionInstalled) {
    showToast('Chrome Extension not detected. Please install it first.', 'error');
    return;
  }

  showToast('Fetching Dreamhack credentials...', 'info');

  const credentialsRes = await apiRequest('/dreamhack/credentials', 'GET');

  try {
    if (credentialsRes.ok && credentialsRes.data) {
      const { email, password } = credentialsRes.data;
      showToast('Logging in to Dreamhack via Extension...', 'success');

      // Dispatch event to the Chrome Extension content script to trigger browser-side login
      window.dispatchEvent(new CustomEvent('SII_DREAMHACK_LOGIN_TRIGGER', {
        detail: { email, password }
      }));
    } else {
      showToast(`Failed to retrieve credentials: ${credentialsRes.message || 'Server error'}`, 'error');
    }
  } catch (error) {
    console.error('Error fetching Dreamhack credentials:', error);
    showToast('An error occurred while fetching credentials.', 'error');
  }
}

document.addEventListener('DOMContentLoaded', () => {
  updateExtensionStatus();
  // Brief timeout check to avoid injection race conditions
  setTimeout(updateExtensionStatus, 300);

  const confirmbtn = document.getElementById('dreamhack-confirm');

  if (confirmbtn) {
    confirmbtn.addEventListener('click', async () => {
      const userdata = await isLoggedIn();
      if (userdata) {
        executeSpecificFeature(userdata);
      } else {
        showLoginRequiredToast();
      }
    });
  } else {
    console.warn("Cannot find the button with id 'dreamhack-confirm'.");
  }
});