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
  if (!host || !webhookId) {
    throw new Error('Host and webhook ID are required');
  }
  return `${ssl ? 'https' : 'http'}://${host}/api/webhook/${webhookId}`;
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
 * Validates a favicon URL by attempting to fetch it with a HEAD request
 * Note: This performs a network request and may take up to the timeout duration
 * @param {string} faviconUrl - The favicon URL to validate
 * @param {number} timeout - Timeout in milliseconds (default: 1000)
 * @returns {Promise<string>} The validated URL or fallback to extension icon
 */
async function validateFaviconUrl(faviconUrl, timeout = 1000) {
  // Return extension icon for empty or invalid URLs
  if (!faviconUrl) {
    return chrome.runtime.getURL('icon-256.png');
  }

  // Basic URL validation
  try {
    const url = new URL(faviconUrl);
    
    // Skip problematic protocols
    if (url.protocol === 'file:' || 
        url.protocol === 'chrome:' || 
        url.protocol === 'chrome-extension:' ||
        url.protocol === 'edge:' ||
        url.protocol === 'about:') {
      return chrome.runtime.getURL('icon-256.png');
    }

    // Skip localhost and .local domains as they may not be accessible from Home Assistant
    if (url.hostname === '' || 
        url.hostname === 'localhost' ||
        url.hostname.endsWith('.local')) {
      return chrome.runtime.getURL('icon-256.png');
    }
  } catch (error) {
    // Invalid URL format
    return chrome.runtime.getURL('icon-256.png');
  }

  // Attempt to fetch the favicon with timeout
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);
    try {
      const response = await fetch(faviconUrl, {
        method: 'HEAD', // Use HEAD to avoid downloading the entire image
        signal: controller.signal,
        cache: 'no-cache', // Always revalidate to avoid stale favicon validation
      });

      // Check if the response is successful and is an image
      if (response.ok) {
        const contentType = response.headers.get('content-type');
        if (contentType && contentType.startsWith('image/')) {
          return faviconUrl;
        }
      }

      // If not successful or not an image, fall back to extension icon
      return chrome.runtime.getURL('icon-256.png');
    } finally {
      clearTimeout(timeoutId);
    }
  } catch (error) {
    // Network error, timeout, or other fetch failure - fall back to extension icon
    return chrome.runtime.getURL('icon-256.png');
  }
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
function createPageInfo(options = {}) {
  return {
    title: document.title,
    url: window.location.href,
    favicon: getFavicon(),
    selected: getSelectedText(),
    timestamp: new Date().toISOString(),
    user_agent: navigator.userAgent,
    ...options,
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
  if (!url) {
    return true;
  }
  return url.startsWith('chrome://') ||
         url.startsWith('edge://') ||
         url.startsWith('extension://') ||
         url.startsWith('moz-extension://') ||
         url.startsWith('chrome-extension://') ||
         url.startsWith('about:');
}
/**
 * Debounce function to limit function calls
 * @param {Function} func - Function to debounce
 * @param {number} wait - Wait time in milliseconds
 * @returns {Function} Debounced function
 */
function debounce(func, wait) {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}

/**
 * Gets configuration from storage with defaults
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
 * Sends data to webhook with proper error handling
 * @param {string} webhookUrl - The webhook URL
 * @param {object} data - Data to send
 * @returns {Promise<Response>}
 */
async function sendToWebhook(webhookUrl, data) {
  const response = await fetch(webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }

  return response;
}

/**
 * Unified function to send page information to Home Assistant
 * Handles both context menu and direct sending scenarios
 * @param {object} options - Configuration options
 * @param {object} options.tab - Tab information
 * @param {object} [options.contextInfo] - Context menu info (for right-click)
 * @param {string} [options.context] - Context menu name (e.g., "Default", "Automation")
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
    context,
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

    // Create webhook URL
    const webhookUrl = createWebhookUrl(config.haHost, config.ssl, config.webhookId);

    // Show progress
    if (onProgress) {onProgress('Sending to Home Assistant...');}
    if (showNotifications) {
      createNotification('Sending to Home Assistant...', notificationId, 'icon-256.png');
    }

    let pageInfo;

    if (contextInfo) {
      // Context menu scenario - manually build payload
      // Validate favicon URL by attempting to fetch it
      const validatedFavicon = await validateFaviconUrl(tab.favIconUrl);
      
      pageInfo = {
        title: tab.title,
        url: contextInfo.linkUrl || contextInfo.pageUrl || tab.url,
        favicon: validatedFavicon,
        selected: contextInfo.selectionText || '',
        timestamp: new Date().toISOString(),
        user_agent: navigator.userAgent,
      };
    } else {
      // Direct send scenario - get page info via scripting
      // We need to inject a self-contained function since chrome.scripting.executeScript
      // serializes the function and external dependencies won't be available
      const results = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: () => {
          // Self-contained getFavicon implementation
          function getFavicon() {
            const links = document.getElementsByTagName('link');
            
            const formatPriority = {
              'png': 1,
              'jpg': 2,
              'jpeg': 2,
              'webp': 3,
              'ico': 4,
              'svg': 10,
            };
            
            const candidates = [];
            
            for (let i = 0; i < links.length; i++) {
              const rel = links[i].rel;
              const href = links[i].href;
              
              if (rel && rel.toLowerCase().includes('icon') && href && !rel.toLowerCase().includes('apple')) {
                if (href.startsWith('file://')) {
                  continue;
                }
                
                let format = '';
                const typeAttr = links[i].type;
                if (typeAttr) {
                  const match = typeAttr.match(/image\/([a-zA-Z0-9-]+)/);
                  if (match) {
                    format = match[1].toLowerCase();
                  }
                } else {
                  const urlMatch = href.match(/\.(\w+)(\?.*)?$/);
                  if (urlMatch) {
                    format = urlMatch[1].toLowerCase();
                  }
                }
                
                if (format === 'x-icon') {
                  format = 'ico';
                }
                
                let size = 0;
                if (links[i].sizes && links[i].sizes.value) {
                  const sizes = links[i].sizes.value.split(' ');
                  for (const s of sizes) {
                    if (s === 'any') {continue;}
                    const parts = s.split('x');
                    if (parts.length === 2) {
                      const n = parseInt(parts[0], 10);
                      if (n > size) {
                        size = n;
                      }
                    }
                  }
                }
                
                if (!size) {
                  size = 16;
                }
                
                const formatScore = formatPriority[format] || 10;
                const sizeScore = Math.max(0, 100 - size / 10);
                const totalScore = formatScore * 1000 + sizeScore;
                
                candidates.push({
                  href,
                  format,
                  size,
                  score: totalScore,
                });
              }
            }
            
            if (candidates.length > 0) {
              candidates.sort((a, b) => a.score - b.score);
              return candidates[0].href;
            }
            
            if (location.origin && !location.protocol.startsWith('file')) {
              return location.origin + '/favicon.ico';
            }
            
            return '';
          }
          
          // Self-contained getSelectedText implementation
          function getSelectedText() {
            if (window.getSelection) {
              return window.getSelection().toString();
            }
            return '';
          }
          
          // Create and return page info
          return {
            title: document.title,
            url: window.location.href,
            favicon: getFavicon(),
            selected: getSelectedText(),
            timestamp: new Date().toISOString(),
            user_agent: navigator.userAgent,
          };
        },
      });

      if (!results || !results[0] || !results[0].result) {
        throw new Error('Could not get page info.');
      }

      pageInfo = results[0].result;
      
      // Use extension icon as fallback if favicon is empty
      if (!pageInfo.favicon) {
        pageInfo.favicon = chrome.runtime.getURL('icon-256.png');
      }
      
      // Favicon has already been validated earlier; skip redundant validation here
      // pageInfo.favicon = await validateFaviconUrl(pageInfo.favicon);
    }

    // Add user and device information
    if (config.userName) {
      pageInfo.user = config.userName;
    }
    if (config.deviceName) {
      pageInfo.device = config.deviceName;
    }
    
    // Add context information if provided (from context menu)
    if (context) {
      pageInfo.context = context;
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
    validateFaviconUrl,
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
    validateFaviconUrl,
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