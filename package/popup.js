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
      // Get the largest favicon available
      let favicon = '';
      let maxSize = 0;
      const links = document.getElementsByTagName('link');
      
      for (let i = 0; i < links.length; i++) {
        const rel = links[i].rel;
        const href = links[i].href;
        
        // Look for any rel containing 'icon'
        if (rel && rel.toLowerCase().includes('icon') && href) {
          // Try to parse sizes attribute if present
          let size = 0;
          if (links[i].sizes && links[i].sizes.value) {
            const sizes = links[i].sizes.value.split(' ');
            for (const s of sizes) {
              const parts = s.split('x');
              if (parts.length === 2) {
                const n = parseInt(parts[0], 10);
                if (n > size) {
                  size = n;
                }
              }
            }
          }
          
          // If no sizes, guess 16, else use parsed size
          if (!size) {
            size = 16;
          }
          if (size > maxSize) {
            maxSize = size;
            favicon = href;
          }
        }
      }
      
      // Fallback to /favicon.ico if nothing found
      if (!favicon && location.origin) {
        favicon = location.origin + '/favicon.ico';
      }
      
      let selected = '';
      if (window.getSelection) {
        selected = window.getSelection().toString();
      }
      
      return {
        title: document.title,
        url: window.location.href,
        favicon,
        selected,
        timestamp: new Date().toISOString(),
        user_agent: navigator.userAgent,
      };
    },
  });

  if (!results || !results[0] || !results[0].result) {
    throw new Error('Could not get page info.');
  }

  const pageInfo = results[0].result;
  
  // Add user information if provided
  if (config.userName) {
    pageInfo.user = config.userName;
  }
  if (config.deviceName) {
    pageInfo.device = config.deviceName;
  }

  return pageInfo;
}

/**
 * Send data to the webhook
 * @param {string} webhookUrl - The webhook URL
 * @param {object} pageInfo - Page information to send
 * @returns {Promise} Fetch response
 */
async function sendToWebhook(webhookUrl, pageInfo) {
  const response = await fetch(webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(pageInfo),
  });

  if (!response.ok) {
    const text = await response.text();
    let errorMsg = `HTTP ${response.status}`;
    
    if (text) {
      errorMsg += `: ${text}`;
    } else if (response.status === 404) {
      errorMsg += ' (Webhook not found. Check your URL.)';
    } else if (response.status === 401 || response.status === 403) {
      errorMsg += ' (Unauthorized. Check your Home Assistant token or permissions.)';
    }
    
    throw new Error(errorMsg);
  }

  return response;
}

/**
 * Update the status message
 * @param {string} message - Status message to display
 */
function updateStatus(message) {
  msgDiv.textContent = message;
}

/**
 * Show the OK button
 */
function showButton() {
  okBtn.style.display = '';
}

/**
 * Hide the OK button
 */
function hideButton() {
  okBtn.style.display = 'none';
}
/**
 * Show preview of sent data
 * @param {object} pageInfo - The page information that was sent
 */
function showPreview(pageInfo) {
  let preview = document.getElementById('preview');
  if (!preview) {
    preview = document.createElement('div');
    preview.id = 'preview';
    preview.className = 'preview';
    msgDiv.parentNode.insertBefore(preview, okBtn);
  }

  // Build preview HTML with proper escaping
  const previewRows = [
    pageInfo.favicon ? `<div class="preview-row preview-row-center"><img src="${escapeHTML(pageInfo.favicon)}" alt="favicon" class="preview-favicon"></div>` : '',
    `<div class="preview-row"><span class="preview-label">Title:</span><span class="preview-value">${escapeHTML(pageInfo.title)}</span></div>`,
    `<div class="preview-row"><span class="preview-label">URL:</span><span class="preview-value preview-url" title="${escapeHTML(pageInfo.url)}"><a href="${escapeHTML(pageInfo.url)}" target="_blank" rel="noopener noreferrer" class="link-blue">${escapeHTML(pageInfo.url)}</a></span></div>`,
    pageInfo.selected ? `<div class="preview-row"><span class="preview-label">Selected:</span><span class="preview-value">${escapeHTML(pageInfo.selected)}</span></div>` : '',
    `<div class="preview-row"><span class="preview-label">Timestamp:</span><span class="preview-value">${escapeHTML(formatTimestamp(pageInfo.timestamp))}</span></div>`,
  ].filter(Boolean);

  preview.innerHTML = '<div>' + previewRows.join('') + '</div>';

  // Add copy JSON button
  addCopyButton(pageInfo);
}

/**
 * Add copy to clipboard button
 * @param {object} pageInfo - The page information to copy
 */
function addCopyButton(pageInfo) {
  let copyBtn = document.getElementById('copyJsonBtn');
  if (copyBtn) {
    return; // Button already exists
  }

  copyBtn = document.createElement('button');
  copyBtn.id = 'copyJsonBtn';
  copyBtn.className = 'copy-btn';
  copyBtn.textContent = 'Copy JSON';

  // Create wrapper for centering
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
      setTimeout(() => {
        copyBtn.textContent = 'Copy JSON';
      }, 1500);
    } catch (error) {
      console.error('Failed to copy to clipboard:', error);
      // Fallback: select text for manual copy
      const textArea = document.createElement('textarea');
      textArea.value = JSON.stringify(pageInfo, null, 2);
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand('copy');
      document.body.removeChild(textArea);
      copyBtn.textContent = 'Copied!';
    }
  });
}
/**
 * Setup auto-close functionality for the popup
 */
function setupAutoClose() {
  resetAutoCloseTimer();
  
  // Reset timer on user activity
  ['mousemove', 'keydown', 'mousedown', 'touchstart'].forEach(evt => {
    window.addEventListener(evt, resetAutoCloseTimer, { passive: true });
  });
}

/**
 * Reset the auto-close timer
 */
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
  }, 15000); // 15 seconds
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