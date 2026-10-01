/**
 * Send to Home Assistant - Popup Script
 * 
 * Handles the extension popup UI and sending functionality.
 * Provides real-time status updates, payload preview, and user feedback.
 */

// --- Settings Button Handler ---

/**
 * Initialize settings button event listener for CSP compliance
 */
document.addEventListener('DOMContentLoaded', function() {
  const settingsBtn = document.getElementById('settingsBtn');
  if (settingsBtn) {
    settingsBtn.addEventListener('click', () => {
      if (chrome && chrome.runtime && chrome.runtime.openOptionsPage) {
        chrome.runtime.openOptionsPage();
      } else {
        window.open('options.html');
      }
    });
  }
});

// --- Main Popup Logic ---

const msgDiv = document.getElementById('popupMsg');
const okBtn = document.getElementById('okBtn');
const profileSelect = document.getElementById('profileSelect');
const sendBtn = document.getElementById('sendBtn');
let sending = false;

/**
 * Main function to send page data to Home Assistant
 */
async function sendToHA() {
  if (sending) {
    return;
  }
  sending = true;
  sendBtn.disabled = true;
  profileSelect.disabled = true;
  updateStatus('Sending...');
  hideButton();

  try {
    const tab = await getActiveTab();
    if (!tab) {
      throw new Error('No active tab found');
    }

    // Use unified sendToHomeAssistant function with popup-specific callbacks
    await ExtensionUtils.sendToHomeAssistant({
      tab,
      profileId: profileSelect.value,
      onProgress: (message) => {
        updateStatus(message);
      },
      onSuccess: (pageInfo) => {
        updateStatus('Link sent to Home Assistant!');
        showPreview(pageInfo);
        setupAutoClose();
        showButton();
      },
      onError: (error) => {
        console.error('Send to HA failed:', error);
        handleError(error);
        showButton();
      },
      showNotifications: true,
      notificationId: 'send-to-ha-status',
    });

  } catch (error) {
    console.error('Send to HA failed:', error);
    handleError(error);
    showButton();
  } finally {
    sending = false;
    sendBtn.disabled = false;
    profileSelect.disabled = false;
  }
}

/**
 * Get the active tab
 * @returns {Promise<object>} Active tab object
 */
function getActiveTab() {
  return new Promise((resolve) => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      resolve(tabs[0] || null);
    });
  });
}

// Removed duplicate functions - using ExtensionUtils versions instead:
// - isRestrictedPage() -> ExtensionUtils.isRestrictedPage()  
// - getStorageConfig() -> ExtensionUtils.getStorageConfig()
// - createWebhookUrl() -> ExtensionUtils.createWebhookUrl()
// - getPageInfo() -> ExtensionUtils.createPageInfo() (via sendToHomeAssistant)
// - sendToWebhook() -> ExtensionUtils.sendToWebhook() (via sendToHomeAssistant)

/**
 * Update status message in popup
 * @param {string} message - Status message
 */
function updateStatus(message) {
  msgDiv.textContent = message;
}

/**
 * Hide the OK button
 */
function hideButton() {
  okBtn.classList.add('hidden');
}

/**
 * Show the OK button
 */
function showButton() {
  okBtn.classList.remove('hidden');
}

/**
 * Show preview of sent data
 * @param {object} pageInfo - Page information object
 */
function showPreview(pageInfo) {
  const previewDiv = document.createElement('div');
  previewDiv.className = 'preview';
  function addRow(label, value) {
    const row = document.createElement('div');
    row.className = 'preview-row';
    const name = document.createElement('span');
    name.className = 'preview-label';
    name.textContent = label;
    const field = document.createElement('span');
    field.className = 'preview-value';
    if (value instanceof Node) {
      field.appendChild(value);
    } else {
      field.textContent = String(value || '');
    }
    row.append(name, field);
    previewDiv.appendChild(row);
    return row;
  }
  addRow('Title:', pageInfo.title);
  const link = document.createElement('a');
  const url = String(pageInfo.url || '');
  if (url.startsWith('https://') || url.startsWith('http://')) {
    link.href = url;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
  }
  link.className = 'preview-url link-blue';
  link.textContent = url;
  addRow('URL:', link);
  const img = document.createElement('img');
  img.className = 'preview-favicon';
  img.alt = 'Page favicon';
  img.addEventListener('error', () => {
    if (img.src !== chrome.runtime.getURL('icon-256.png')) {
      img.src = chrome.runtime.getURL('icon-256.png');
      img.classList.add('preview-favicon-placeholder');
    }
  });
  img.src = (String(pageInfo.favicon || '').startsWith('https://') ||
    String(pageInfo.favicon || '').startsWith('http://')) ?
    pageInfo.favicon : chrome.runtime.getURL('icon-256.png');
  addRow('Favicon:', img).classList.add('preview-row-center');
  if (pageInfo.selected) {
    addRow('Selected:', pageInfo.selected);
  }
  addRow('Time:', ExtensionUtils.formatTimestamp(pageInfo.timestamp));
  msgDiv.appendChild(previewDiv);
  addCopyButton(pageInfo);
}
function addCopyButton(pageInfo) {
  let copyBtn = document.getElementById('copyJsonBtn');
  if (copyBtn) {
    return;
  }

  copyBtn = document.createElement('button');
  copyBtn.id = 'copyJsonBtn';
  copyBtn.className = 'copy-btn';
  copyBtn.textContent = 'Copy JSON';

  let copyWrapper = document.getElementById('copyBtnWrapper');
  if (!copyWrapper) {
    copyWrapper = document.createElement('div');
    copyWrapper.id = 'copyBtnWrapper';
    copyWrapper.style.display = 'flex';
    copyWrapper.style.justifyContent = 'center';
    copyWrapper.style.width = '100%';
    okBtn.parentNode.insertBefore(copyWrapper, okBtn.nextSibling);
  }

  copyWrapper.appendChild(copyBtn);

  copyBtn.addEventListener('click', async() => {
    try {
      await navigator.clipboard.writeText(JSON.stringify(pageInfo, null, 2));
      copyBtn.textContent = 'Copied!';
      setTimeout(() => (copyBtn.textContent = 'Copy JSON'), 1500);
    } catch (error) {
      console.error('Failed to copy to clipboard:', error);
    }
  });
}

function setupAutoClose() {
  let autoCloseTimer = null;
  let userActive = false;

  function resetAutoCloseTimer() {
    userActive = true;
    if (autoCloseTimer) {
      clearTimeout(autoCloseTimer);
    }
    autoCloseTimer = setTimeout(() => {
      if (!userActive) {
        window.close();
      } else {
        userActive = false;
        resetAutoCloseTimer();
      }
    }, 15000);
  }

  resetAutoCloseTimer();
  ['mousemove', 'keydown', 'mousedown', 'touchstart'].forEach(evt =>
    window.addEventListener(evt, resetAutoCloseTimer, { passive: true }),
  );
}


/**
 * Handle errors during the send process
 * @param {Error} error - The error object
 */
function handleError(error) {
  let message = 'Unknown error.';
  
  if (error.message) {
    if (error.message.includes('Failed to fetch')) {
      message = 'Could not reach the webhook URL. Please check your network or URL.';
    } else {
      message = error.message;
    }
  }
  
  updateStatus(`Error: ${message}`);
}

// --- Event Listeners ---

// Load the configured default. Explicit Send prevents an unintended first send
// when the user wants to choose an alternative context.
async function initializePopup() {
  try {
    const settings = await ExtensionProfiles.getProfileSettings();
    profileSelect.replaceChildren();
    for (const profile of ExtensionProfiles.listProfiles(settings)) {
      const option = document.createElement('option');
      option.value = profile.id;
      option.textContent = profile.name + (profile.id === settings.defaultProfileId ? ' (default)' : '');
      profileSelect.appendChild(option);
    }
    profileSelect.value = settings.defaultProfileId;
    if (settings.quickSendDefault) {
      await sendToHA();
    }
  } catch (error) {
    handleError(error);
    sendBtn.disabled = true;
  }
}

sendBtn.addEventListener('click', sendToHA);
initializePopup().catch(handleError);

// OK button closes the popup
okBtn.addEventListener('click', () => {
  window.close();
});