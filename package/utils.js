/**
 * Shared utility functions for Send to Home Assistant extension
 * 
 * This module contains common functions used across different parts of the extension
 * to eliminate code duplication and improve maintainability.
 */

/**
 * Extension configuration and constants
 */
const EXTENSION_CONFIG = {
  UPDATE_CHECK_KEY: 'lastUpdateCheck',
  UPDATE_INFO_KEY: 'updateInfo',
  GITHUB_RELEASES_API: 'https://api.github.com/repos/JOHLC/Send-to-Home-Assistant/releases/latest',
  UPDATE_CHECK_INTERVAL: 86400000, // 24 hours in milliseconds
  POPUP_AUTO_CLOSE_DELAY: 15000, // 15 seconds
  COPY_FEEDBACK_DELAY: 1500, // 1.5 seconds
  STATUS_CLEAR_DELAY: 2000, // 2 seconds
};

/**
 * Notification configuration
 */
const NOTIFICATION_CONFIG = {
  type: 'basic',
  iconUrl: 'icon-256.png',
  title: 'Send to Home Assistant',
};

/**
 * Escapes HTML to prevent XSS/code injection
 * @param {string} str - The string to escape
 * @returns {string} The escaped HTML string
 */
function escapeHTML(str) {
  if (typeof str !== 'string') {
    return String(str);
  }
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Creates a webhook URL from host, SSL setting, and webhook ID
 * @param {string} host - The Home Assistant host
 * @param {boolean} ssl - Whether to use HTTPS
 * @param {string} webhookId - The webhook ID
 * @returns {string} The complete webhook URL
 */
function createWebhookUrl(host, ssl, webhookId) {
  if (typeof host !== 'string' || !host.trim() || typeof webhookId !== 'string' ||
      !/^[A-Za-z0-9_.~-]{1,256}$/.test(webhookId)) {
    throw new Error('Enter a hostname and a valid webhook ID (letters, numbers, underscores or hyphens).');
  }
  if (/[\\/?#@\\s]/.test(host) && !/^\\[[0-9a-fA-F:]+\\](?::\\d+)?$/.test(host)) {
    // A bare hostname, optional port or bracketed IPv6 address is expected.
    if (!/^[A-Za-z0-9.-]+(?::\\d+)?$/.test(host)) {
      throw new Error('Enter only a hostname or IP address, with an optional port.');
    }
  }
  let url;
  try {
    url = new URL((ssl ? 'https://' : 'http://') + host.trim());
  } catch (_) {
    throw new Error('Invalid Home Assistant hostname or port.');
  }
  if (!['http:', 'https:'].includes(url.protocol) || !url.hostname ||
      url.username || url.password || url.pathname !== '/' || url.search || url.hash) {
    throw new Error('Enter only a hostname or IP address, with an optional port.');
  }
  url.pathname = '/api/webhook/' + encodeURIComponent(webhookId);
  return url.href;
}
/**
 * Validates device name format
 * @param {string} deviceName - The device name to validate
 * @returns {boolean} True if valid, false otherwise
 */
function validateDeviceName(deviceName) {
  if (!deviceName) {
    return true; // Empty device name is allowed
  }
  return /^[\w\s-]{1,32}$/.test(deviceName);
}

/**
 * Validates user name format
 * @param {string} userName - The user name to validate
 * @returns {boolean} True if valid, false otherwise
 */
function validateUserName(userName) {
  if (!userName) {
    return true; // Empty user name is allowed
  }
  return userName.length <= 32;
}

/**
 * Simple version comparison function
 * @param {string} a - First version string
 * @param {string} b - Second version string
 * @returns {number} 1 if a > b, -1 if a < b, 0 if equal
 */
function compareVersions(a, b) {
  const pa = a.split('.').map(Number);
  const pb = b.split('.').map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const na = pa[i] || 0;
    const nb = pb[i] || 0;
    if (na > nb) {
      return 1;
    }
    if (na < nb) {
      return -1;
    }
  }
  return 0;
}

/**
 * Creates a notification with consistent configuration
 * @param {string} message - The notification message
 * @param {string} notificationId - Optional notification ID for updates
 * @returns {Promise} Chrome notification creation promise
 */
function createNotification(message, notificationId = null) {
  const config = {
    ...NOTIFICATION_CONFIG,
    message,
  };
  
  if (notificationId) {
    return chrome.notifications.create(notificationId, config);
  }
  return chrome.notifications.create(config);
}

/**
 * Updates an existing notification
 * @param {string} notificationId - The notification ID to update
 * @param {string} message - The new message
 * @returns {Promise} Chrome notification update promise
 */
function updateNotification(notificationId, message) {
  return chrome.notifications.update(notificationId, {
    ...NOTIFICATION_CONFIG,
    message,
  });
}

/**
 * Gets the favicon URL with prioritization for mobile-compatible formats
 * @returns {string} The favicon URL or empty string if not found
 */
function getFavicon() {
  const links = document.getElementsByTagName('link');
  
  // Define format priorities for Android compatibility (lower number = higher priority)
  const formatPriority = {
    'png': 1,   // PNG is best supported format for Android notifications
    'jpg': 2,   // JPEG is well supported 
    'jpeg': 2,  // JPEG alternate extension
    'webp': 3,  // WEBP is modern and well supported
    'ico': 4,   // ICO is widely supported but often smaller
    'svg': 10,  // SVG not supported by Android companion app notifications
  };
  
  // Store candidates with their priority scores
  const candidates = [];
  
  for (let i = 0; i < links.length; i++) {
    const rel = links[i].rel;
    const href = links[i].href;
    
    // Look for favicon-specific rel attributes (exclude apple-touch-icon and other device-specific icons)
    if (rel && rel.toLowerCase().includes('icon') && href && !rel.toLowerCase().includes('apple')) {
      // Skip file:// URLs as they're blocked by CSP
      if (href.startsWith('file://')) {
        continue;
      }
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
      
      // Calculate priority score (lower is better)
      // Format has more weight than size to prioritize mobile-compatible formats
      const formatScore = formatPriority[format] || 10; // Unknown formats get low priority
      const sizeScore = Math.max(0, 100 - size / 10); // Size has less impact on final score
      const totalScore = formatScore * 1000 + sizeScore;
      
      candidates.push({
        href,
        format,
        size,
        score: totalScore,
      });
    }
  }
  
  // Sort candidates by score (lower is better) and return the best one
  if (candidates.length > 0) {
    candidates.sort((a, b) => a.score - b.score);
    return candidates[0].href;
  }
  
  // Fallback for non-file:// URLs
  if (location.origin && !location.protocol.startsWith('file')) {
    return location.origin + '/favicon.ico';
  }
  
  // For file:// URLs or if nothing found, use extension icon fallback
  return chrome.runtime.getURL('icon-256.png');
}

/**
 * Gets selected text from the page
 * @returns {string} The selected text or empty string
 */
function getSelectedText() {
  if (window.getSelection) {
    return window.getSelection().toString();
  }
  return '';
}

/**
 * Creates page information object for sending to webhook
 * @param {object} options - Additional options (user, device, etc.)
 * @returns {object} Page information object
 */
function createPageInfo() {
  // executeScript serializes this function; do not reference helpers from utils.js.
  const fallback = 'https://raw.githubusercontent.com/JOHLC/Send-to-Home-Assistant/main/package/icon-256.png';
  const priority = { png: 1, jpg: 2, jpeg: 2, webp: 3, ico: 4 };
  const icons = Array.from(document.querySelectorAll('link[rel~="icon"]'))
    .map((link) => {
      try {
        const url = new URL(link.getAttribute('href'), document.baseURI);
        const type = (link.getAttribute('type') || '').toLowerCase();
        const match = url.pathname.match(/\\.([a-z0-9]+)$/i);
        const format = type.includes('png') ? 'png' :
          type.includes('jpeg') ? 'jpeg' :
            type.includes('webp') ? 'webp' :
              type.includes('icon') ? 'ico' : (match ? match[1].toLowerCase() : '');
        return { url: url.href, rank: priority[format] || 99 };
      } catch (_) {
        return { url: '', rank: 99 };
      }
    })
    .filter((candidate) => /^https?:\\/\\//.test(candidate.url) && candidate.rank < 99)
    .sort((a, b) => a.rank - b.rank);
  const defaultIcon = /^https?:$/.test(location.protocol) ?
    new URL('/favicon.ico', location.origin).href : fallback;
  return {
    title: document.title || '',
    url: window.location.href,
    favicon: icons.length ? icons[0].url : defaultIcon,
    selected: window.getSelection ? window.getSelection().toString() : '',
    timestamp: new Date().toISOString(),
    user_agent: navigator.userAgent,
  };
}
/**
 * Formats a timestamp for display
 * @param {string} timestamp - ISO timestamp string
 * @returns {string} Formatted timestamp
 */
function formatTimestamp(timestamp) {
  return timestamp.replace('T', ' ').replace('Z', '');
}

/**
 * Determines if the current tab is a restricted page
 * @param {string} url - The tab URL
 * @returns {boolean} True if restricted, false otherwise
 */
function isRestrictedPage(url) {
  if (typeof url !== 'string') {
    return true;
  }
  try {
    return !['http:', 'https:', 'file:'].includes(new URL(url).protocol);
  } catch (_) {
    return true;
  }
}
/**
 * Gets configuration from storage with defaults
 * @returns {Promise<object>} Configuration object
 */
async function getStorageConfig() {
  const read = (area, keys) => new Promise((resolve, reject) => {
    chrome.storage[area].get(keys, (result) => {
      if (chrome.runtime.lastError) {
        reject(new Error('Could not read extension settings: ' + chrome.runtime.lastError.message));
      } else {
        resolve(result);
      }
    });
  });
  const [synced, local] = await Promise.all([
    read('sync', ['haHost', 'ssl', 'webhookId', 'userName', 'deviceName']),
    read('local', ['webhookId']),
  ]);
  // One-time migration from the previous synchronized webhook ID.
  if (!local.webhookId && synced.webhookId) {
    await new Promise((resolve, reject) => {
      chrome.storage.local.set({ webhookId: synced.webhookId }, () => {
        if (chrome.runtime.lastError) {
          reject(new Error('Could not migrate webhook settings: ' + chrome.runtime.lastError.message));
        } else {
          resolve();
        }
      });
    });
    await new Promise((resolve, reject) => {
      chrome.storage.sync.remove('webhookId', () => {
        if (chrome.runtime.lastError) {
          reject(new Error('Could not remove old synchronized webhook ID: ' + chrome.runtime.lastError.message));
        } else {
          resolve();
        }
      });
    });
  }
  return {
    haHost: synced.haHost,
    ssl: typeof synced.ssl === 'boolean' ? synced.ssl : true,
    webhookId: local.webhookId || synced.webhookId,
    userName: synced.userName,
    deviceName: synced.deviceName,
  };
}
/**
 * Sends data to webhook with proper error handling
 * @param {string} webhookUrl - The webhook URL
 * @param {object} data - Data to send
 * @returns {Promise<Response>}
 */
async function sendToWebhook(webhookUrl, data) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  try {
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
      signal: controller.signal,
    });
    if (!response.ok) {
      throw new Error('Home Assistant returned HTTP ' + response.status + '.');
    }
    return response;
  } catch (error) {
    if (error.name === 'AbortError') {
      throw new Error('Webhook timed out after 15 seconds.');
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}
/**
 * Unified function to send page information to Home Assistant
 * Handles both context menu and direct sending scenarios
 * @param {object} options - Configuration options
 * @param {object} options.tab - Tab information
 * @param {object} [options.contextInfo] - Context menu info (for right-click)
 * @param {Function} [options.onProgress] - Progress callback (message) => void
 * @param {Function} [options.onSuccess] - Success callback (data) => void
 * @param {Function} [options.onError] - Error callback (error) => void
 * @param {boolean} [options.showNotifications=true] - Whether to show browser notifications
 * @param {string} [options.notificationId='send-to-ha-status'] - Notification ID
 * @returns {Promise<object>} Result object with status and data
 */
async function sendToHomeAssistant(options) {
  const {
    tab,
    contextInfo,
    onProgress,
    onSuccess,
    onError,
    showNotifications = true,
    notificationId = 'send-to-ha-status',
  } = options;

  // Validate inputs
  if (!tab || !tab.id) {
    const error = new Error('Invalid tab information');
    if (onError) {onError(error);}
    return { status: 'error', error: error.message };
  }

  if (isRestrictedPage(tab.url)) {
    const error = new Error('This extension cannot send data from browser internal pages (settings, extensions, etc.). Please navigate to a regular website and try again.');
    if (onError) {onError(error);}
    if (showNotifications) {
      createNotification(error.message, notificationId, 'icon-256.png');
    }
    return { status: 'error', error: error.message };
  }

  try {
    // Get configuration
    const config = await getStorageConfig();

    if (!config.haHost || !config.webhookId) {
      const errorMessage = 'Please set your Home Assistant hostname and webhook ID in the extension options.';
      chrome.runtime.openOptionsPage();
      if (showNotifications) {
        createNotification(errorMessage, notificationId, 'icon-256.png');
      }
      if (onError) {onError(new Error(errorMessage));}
      return { status: 'error', error: 'No webhook host or ID set.' };
    }

    // The user grants access to the configured Home Assistant origin in Options.
    const webhookUrl = createWebhookUrl(config.haHost, config.ssl, config.webhookId);
    const origin = new URL(webhookUrl).origin + '/*';
    const allowed = await chrome.permissions.contains({ origins: [origin] });
    if (!allowed) {
      throw new Error('Home Assistant site access is missing. Open extension settings and save again to grant access.');
    }

    // Show progress
    if (onProgress) {onProgress('Sending to Home Assistant...');}
    if (showNotifications) {
      createNotification('Sending to Home Assistant...', notificationId, 'icon-256.png');
    }

    let pageInfo;

    if (contextInfo) {
      // Context menu scenario - manually build payload
      pageInfo = {
        title: tab.title,
        url: contextInfo.linkUrl || contextInfo.pageUrl || tab.url,
        favicon: tab.favIconUrl || chrome.runtime.getURL('icon-256.png'),
        selected: contextInfo.selectionText || '',
        timestamp: new Date().toISOString(),
        user_agent: navigator.userAgent,
      };
    } else {
      // Direct send scenario - get page info via scripting
      try {
        const results = await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          func: createPageInfo,
        });
        if (!results || !results[0] || !results[0].result) {
          throw new Error('Page extraction returned no data.');
        }
        pageInfo = results[0].result;
      } catch (error) {
        // Permissions, navigation races and browser-restricted documents can
        // prevent injection. Still allow manual sending of tab metadata.
        console.warn('Using tab metadata instead of page extraction:', error.message);
        pageInfo = {
          title: tab.title || '',
          url: tab.url,
          favicon: /^https?:\\/\\//.test(tab.favIconUrl || '') ?
            tab.favIconUrl : 'https://raw.githubusercontent.com/JOHLC/Send-to-Home-Assistant/main/package/icon-256.png',
          selected: '',
          timestamp: new Date().toISOString(),
          user_agent: navigator.userAgent,
        };
      }
    }

    // Add user and device information
    if (config.userName) {
      pageInfo.user = config.userName;
    }
    if (config.deviceName) {
      pageInfo.device = config.deviceName;
    }

    // Send to webhook
    await sendToWebhook(webhookUrl, pageInfo);

    // Success handling
    const successMessage = 'Sent to Home Assistant!';
    if (onProgress) {onProgress(successMessage);}
    if (showNotifications) {
      updateNotification(notificationId, successMessage, 'icon-256.png');
    }
    if (onSuccess) {onSuccess(pageInfo);}

    return { status: 'sent', data: pageInfo };

  } catch (error) {
    console.error('Send to Home Assistant failed:', error);
    
    const errorMessage = `Error: ${escapeHTML(error.message)}`;
    if (onProgress) {onProgress(errorMessage);}
    if (showNotifications) {
      updateNotification(notificationId, errorMessage, 'icon-256.png');
    }
    if (onError) {onError(error);}

    return { status: 'error', error: error.message };
  }
}

// Export functions for use in other modules
// Note: In manifest v3, we'll need to use different export patterns
// This is designed to work with the current script loading approach
if (typeof window !== 'undefined') {
  // Browser environment - attach to window
  window.ExtensionUtils = {
    EXTENSION_CONFIG,
    NOTIFICATION_CONFIG,
    escapeHTML,
    createWebhookUrl,
    validateDeviceName,
    validateUserName,
    compareVersions,
    createNotification,
    updateNotification,
    getFavicon,
    getSelectedText,
    createPageInfo,
    formatTimestamp,
    isRestrictedPage,
    debounce,
    getStorageConfig,
    sendToWebhook,
    sendToHomeAssistant,
  };
} else if (typeof self !== 'undefined') {
  // Service worker environment - attach to self
  self.ExtensionUtils = {
    EXTENSION_CONFIG,
    NOTIFICATION_CONFIG,
    escapeHTML,
    createWebhookUrl,
    validateDeviceName,
    validateUserName,
    compareVersions,
    createNotification,
    updateNotification,
    getFavicon,
    getSelectedText,
    createPageInfo,
    formatTimestamp,
    isRestrictedPage,
    debounce,
    getStorageConfig,
    sendToWebhook,
    sendToHomeAssistant,
  };
}