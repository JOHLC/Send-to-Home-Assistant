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

/**
 * Main function to send page data to Home Assistant
 */
async function sendToHA() {
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
  
  // Title row
  const titleRow = document.createElement('div');
  titleRow.className = 'preview-row';
  titleRow.innerHTML = `
    <span class="preview-label">Title:</span>
    <span class="preview-value">${ExtensionUtils.escapeHTML(pageInfo.title)}</span>
  `;
  previewDiv.appendChild(titleRow);
  
  // URL row
  const urlRow = document.createElement('div');
  urlRow.className = 'preview-row';
  urlRow.innerHTML = `
    <span class="preview-label">URL:</span>
    <span class="preview-value">
      <a href="${ExtensionUtils.escapeHTML(pageInfo.url)}" target="_blank" class="preview-url link-blue">${ExtensionUtils.escapeHTML(pageInfo.url)}</a>
    </span>
  `;
  previewDiv.appendChild(urlRow);
  
  // Favicon row
  const faviconRow = document.createElement('div');
  faviconRow.className = 'preview-row preview-row-center';
  faviconRow.innerHTML = `
    <span class="preview-label">Favicon:</span>
    <img src="${ExtensionUtils.escapeHTML(pageInfo.favicon)}" 
         alt="favicon" 
         class="preview-favicon"
         onerror="this.src='${chrome.runtime.getURL('icon-256.png')}'; this.classList.add('preview-favicon-placeholder');">
  `;
  previewDiv.appendChild(faviconRow);
  
  // Selected text row (if any)
  if (pageInfo.selected) {
    const selectedRow = document.createElement('div');
    selectedRow.className = 'preview-row';
    selectedRow.innerHTML = `
      <span class="preview-label">Selected:</span>
      <span class="preview-value">${ExtensionUtils.escapeHTML(pageInfo.selected)}</span>
    `;
    previewDiv.appendChild(selectedRow);
  }
  
  // Timestamp row
  const timestampRow = document.createElement('div');
  timestampRow.className = 'preview-row';
  timestampRow.innerHTML = `
    <span class="preview-label">Time:</span>
    <span class="preview-value">${ExtensionUtils.formatTimestamp(pageInfo.timestamp)}</span>
  `;
  previewDiv.appendChild(timestampRow);
  
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

// Initialize popup when page loads
sendToHA();

// OK button closes the popup
okBtn.addEventListener('click', () => {
  window.close();
});