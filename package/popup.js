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
let autoCloseTimer = null;
let userActive = false;

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

    if (!tab.id || isRestrictedPage(tab.url)) {
      throw new Error('Cannot send from browser internal pages.');
    }

    const config = await getStorageConfig();
    if (!config.haHost || !config.webhookId) {
      updateStatus('Please set your Home Assistant hostname and webhook ID in the extension options.');
      showButton();
      chrome.runtime.openOptionsPage();
      return;
    }

    const webhookUrl = createWebhookUrl(config.haHost, config.ssl, config.webhookId);
    const pageInfo = await getPageInfo(tab.id, config);
    
    await sendToWebhook(webhookUrl, pageInfo);
    
    // Success - show preview and setup auto-close
    updateStatus('Link sent to Home Assistant!');
    showPreview(pageInfo);
    setupAutoClose();
    showButton();

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

/**
 * Check if the page is restricted (chrome:// or edge:// pages)
 * @param {string} url - The page URL
 * @returns {boolean} True if restricted
 */
function isRestrictedPage(url) {
  return url.startsWith('chrome://') || url.startsWith('edge://');
}

/**
 * Get configuration from storage
 * @returns {Promise<object>} Configuration object
 */
function getStorageConfig() {
  return new Promise((resolve) => {
    chrome.storage.sync.get(['haHost', 'ssl', 'webhookId', 'userName', 'deviceName'], (result) => {
      resolve({
        haHost: result.haHost,
        ssl: typeof result.ssl === 'boolean' ? result.ssl : true,
        webhookId: result.webhookId,
        userName: result.userName,
        deviceName: result.deviceName,
      });
    });
  });
}

/**
 * Create webhook URL from configuration
 * @param {string} host - The host
 * @param {boolean} ssl - Whether to use SSL
 * @param {string} webhookId - The webhook ID
 * @returns {string} Complete webhook URL
 */
function createWebhookUrl(host, ssl, webhookId) {
  return `${ssl ? 'https' : 'http'}://${host}/api/webhook/${webhookId}`;
}
/**
 * Get page information from the active tab
 * @param {number} tabId - The tab ID
 * @param {object} config - Configuration object
 * @returns {Promise<object>} Page information object
 */
async function getPageInfo(tabId, config) {
  const results = await chrome.scripting.executeScript({
    target: { tabId },
    func: () => {
      // Define format priorities for Android compatibility (lower number = higher priority)
      const formatPriority = {
        'png': 1,   // PNG is best supported format for Android notifications
        'jpg': 2,   // JPEG is well supported 
        'jpeg': 2,  // JPEG alternate extension
        'webp': 3,  // WEBP is modern and well supported
        'ico': 4,   // ICO is widely supported but often smaller
        'svg': 10,  // SVG not supported by Android companion app notifications
      };
      
      const links = document.getElementsByTagName('link');
      const candidates = [];
      
      for (let i = 0; i < links.length; i++) {
        const rel = links[i].rel;
        const href = links[i].href;
        
        // Look for favicon-specific rel attributes (exclude apple-touch-icon and other device-specific icons)
        if (rel && rel.toLowerCase().includes('icon') && href && !rel.toLowerCase().includes('apple')) {
          // Extract format from URL or type attribute
          let format = '';
          const typeAttr = links[i].type;
          if (typeAttr) {
            const match = typeAttr.match(/image\/([a-zA-Z0-9-]+)/);
            if (match) {
              format = match[1].toLowerCase();
            }
          } else {
            // Try to extract format from URL extension
            const urlMatch = href.match(/\.(\w+)(\?.*)?$/);
            if (urlMatch) {
              format = urlMatch[1].toLowerCase();
            }
          }
          
          // Normalize x-icon to ico
          if (format === 'x-icon') {
            format = 'ico';
          }
          
          // Get size information
          let size = 0;
          if (links[i].sizes && links[i].sizes.value) {
            const sizes = links[i].sizes.value.split(' ');
            for (const s of sizes) {
              if (s === 'any') {continue;} // Skip 'any' size
              const parts = s.split('x');
              if (parts.length === 2) {
                const n = parseInt(parts[0], 10);
                if (n > size) {
                  size = n;
                }
              }
            }
          }
          
          // If no sizes, guess 16
          if (!size) {
            size = 16;
          }
          
function addCopyButton(pageInfo) {
  let copyBtn = document.getElementById('copyJsonBtn');
  if (copyBtn) return;

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

  copyBtn.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(JSON.stringify(pageInfo, null, 2));
      copyBtn.textContent = 'Copied!';
      setTimeout(() => (copyBtn.textContent = 'Copy JSON'), 1500);
    } catch (error) {
      console.error('Clipboard failed:', error);
    }
  });
}
function setupAutoClose() {
  let autoCloseTimer = null;
  let userActive = false;

  function resetAutoCloseTimer() {
    userActive = true;
    if (autoCloseTimer) clearTimeout(autoCloseTimer);
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
    window.addEventListener(evt, resetAutoCloseTimer, { passive: true })
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

/**
 * Escape HTML to prevent XSS/code injection
 * @param {string} str - String to escape
 * @returns {string} Escaped string
 */
function escapeHTML(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Format timestamp for display
 * @param {string} timestamp - ISO timestamp
 * @returns {string} Formatted timestamp
 */
function formatTimestamp(timestamp) {
  return timestamp.replace('T', ' ').replace('Z', '');
}

// --- Event Listeners ---

// Initialize popup when page loads
sendToHA();

// OK button closes the popup
okBtn.addEventListener('click', () => {
  window.close();
});