/**
 * Send to Home Assistant - Background Script
 * 
 * Service worker that handles:
 * - Context menu integration
 * - Extension updates checking
 * - Communication with popup
 * - Direct sending via extension icon
 */

// Import utilities
importScripts('utils.js');

// --- Context Menu Integration ---

/**
 * Initialize context menus when extension is installed or updated
 */
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.removeAll(() => {
    // Parent menu
    chrome.contextMenus.create({
      id: 'send-to-ha-parent',
      title: 'Send to Home Assistant',
      contexts: ['page', 'selection', 'link'],
    });
    // Default sub-option
    chrome.contextMenus.create({
      id: 'send-to-ha-default',
      parentId: 'send-to-ha-parent',
      title: 'Default',
      contexts: ['page', 'selection', 'link'],
    });
    // Future sub-options can be added here
  });
});

/**
 * Handle context menu clicks
 */
chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (!tab || !tab.id) {
    return;
  }
  
  if (info.menuItemId === 'send-to-ha-default') {
    handleContextMenuSend(info, tab);
  }
  // Future sub-options can be handled here
});

/**
 * Handle sending from context menu
 * @param {object} info - Context menu info
 * @param {object} tab - Tab information
 */
function handleContextMenuSend(info, tab) {
  // Prepare message payload
  const payload = {
    title: tab.title,
    url: info.linkUrl || info.pageUrl || tab.url,
    favicon: tab.favIconUrl || chrome.runtime.getURL('icon.png'),
    selected: info.selectionText || '',
    timestamp: new Date().toISOString(),
    user_agent: navigator.userAgent,
  };

  chrome.storage.sync.get(['haHost', 'ssl', 'webhookId', 'userName', 'deviceName'], (result) => {
    const { haHost, ssl = true, webhookId, userName, deviceName } = result;
    
    if (!haHost || !webhookId) {
      chrome.runtime.openOptionsPage();
      ExtensionUtils.createNotification(
        'Please set your Home Assistant hostname and webhook ID in the extension options.',
      );
      return;
    }

    try {
      const webhookUrl = ExtensionUtils.createWebhookUrl(haHost, ssl, webhookId);
      
      // Compose data with optional user fields
      const data = {
        ...payload,
        user: userName || '',
        device: deviceName || '',
      };

      sendToWebhook(webhookUrl, data)
        .then(() => {
          ExtensionUtils.createNotification('Sent successfully!');
        })
        .catch((error) => {
          console.error('Context menu send failed:', error);
          ExtensionUtils.createNotification('Failed to send.');
        });
    } catch (error) {
      console.error('Invalid webhook configuration:', error);
      ExtensionUtils.createNotification('Invalid configuration. Please check your settings.');
    }
  });
}
// --- Extension update check (GitHub releases) ---

/**
 * Check for extension updates from GitHub releases
 * Respects user preference for update checking
 */
function checkForUpdate() {
  const now = Date.now();
  const { UPDATE_CHECK_KEY, UPDATE_INFO_KEY, UPDATE_CHECK_INTERVAL } = 
    ExtensionUtils.EXTENSION_CONFIG;
  
  chrome.storage.local.get(['updateCheckEnabled', UPDATE_CHECK_KEY, UPDATE_INFO_KEY], (data) => {
    if (data.updateCheckEnabled === false) {
      // User disabled update checks - clean up stored data
      chrome.storage.local.remove([UPDATE_INFO_KEY, UPDATE_CHECK_KEY]);
      return;
    }
    
    const lastCheck = data[UPDATE_CHECK_KEY] || 0;
    
    // Only check if 24 hours have passed and we don't have cached info
    if (now - lastCheck < UPDATE_CHECK_INTERVAL && data[UPDATE_INFO_KEY]) {
      return;
    }
    
    fetchLatestRelease()
      .then((info) => {
        chrome.storage.local.set({
          [UPDATE_CHECK_KEY]: now,
          [UPDATE_INFO_KEY]: info,
        });
      })
      .catch((error) => {
        console.error('Update check failed:', error);
        // On error, clear update info
        chrome.storage.local.remove([UPDATE_INFO_KEY]);
      });
  });
}

/**
 * Fetch the latest release information from GitHub
 * @returns {Promise<object>} Release information
 */
async function fetchLatestRelease() {
  const { GITHUB_RELEASES_API } = ExtensionUtils.EXTENSION_CONFIG;
  const response = await fetch(GITHUB_RELEASES_API);
  if (!response.ok) {
    throw new Error(`GitHub API returned ${response.status}`);
  }
  
  const release = await response.json();
  const currentVersion = chrome.runtime.getManifest().version;
  
  let latest = release.tag_name || release.name || '';
  if (latest.startsWith('v')) {
    latest = latest.slice(1);
  }
  
  const isNewer = ExtensionUtils.compareVersions(latest, currentVersion) > 0;
  
  return {
    isNewer,
    latest,
    html_url: release.html_url,
    body: release.body || '',
    checkedAt: Date.now(),
  };
}

// Initialize update check on startup
checkForUpdate();
if (chrome.runtime.onStartup) {
  chrome.runtime.onStartup.addListener(checkForUpdate);
}
// --- Popup Communication & Direct Sending ---

/**
 * Store the last send status for popup communication
 */
let lastSendStatus = null;

/**
 * Handle messages from popup
 */
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg && msg.popupOpened) {
    sendResponse(lastSendStatus || { status: 'pending' });
  }
});

/**
 * Handle extension icon clicks (direct sending)
 */
chrome.action.onClicked.addListener(async(tab) => {
  // Check for restricted pages
  if (!tab || !tab.id || ExtensionUtils.isRestrictedPage(tab.url)) {
    const errorMessage = 'Cannot send from browser internal pages.';
    ExtensionUtils.createNotification(errorMessage);
    lastSendStatus = { status: 'error', error: errorMessage };
    return;
  }

  try {
    await handleDirectSend(tab);
  } catch (error) {
    console.error('Direct send failed:', error);
    const errorMessage = `Failed to send: ${ExtensionUtils.escapeHTML(error.message)}`;
    ExtensionUtils.createNotification(errorMessage);
    lastSendStatus = { status: 'error', error: error.message };
  }
});

/**
 * Handle direct sending from extension icon
 * @param {object} tab - The active tab
 */
async function handleDirectSend(tab) {
  const config = await getStorageConfig();
  
  if (!config.haHost || !config.webhookId) {
    const errorMessage = 'Please set your Home Assistant hostname and webhook ID in the extension options.';
    chrome.runtime.openOptionsPage();
    ExtensionUtils.createNotification(errorMessage);
    lastSendStatus = { status: 'error', error: 'No webhook host or ID set.' };
    return;
  }

  const webhookUrl = ExtensionUtils.createWebhookUrl(config.haHost, config.ssl, config.webhookId);
  
  // Get page information from the tab
  const results = await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    func: ExtensionUtils.createPageInfo,
  });

  if (!results || !results[0] || !results[0].result) {
    throw new Error('Could not get page info.');
  }

  const pageInfo = results[0].result;
  
  // Add user and device information
  if (config.userName) {
    pageInfo.user = config.userName;
  }
  if (config.deviceName) {
    pageInfo.device = config.deviceName;
  }

  const notifId = 'send-to-ha-status';
  ExtensionUtils.createNotification('Sending to Home Assistant...', notifId);

  try {
    await sendToWebhook(webhookUrl, pageInfo);
    
    ExtensionUtils.updateNotification(notifId, 'Sent to Home Assistant!');
    lastSendStatus = { status: 'sent' };
    
    // Inject in-page alert as fallback
    await injectPageAlert(tab.id, 'Link sent to Home Assistant!');
    
  } catch (error) {
    ExtensionUtils.updateNotification(notifId, `Error: ${ExtensionUtils.escapeHTML(error.message)}`);
    lastSendStatus = { status: 'error', error: error.message };
    
    // Inject in-page alert as fallback
    await injectPageAlert(tab.id, `Error sending to Home Assistant: ${ExtensionUtils.escapeHTML(error.message)}`);
  }
}

/**
 * Get configuration from storage with defaults
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
 * Send data to webhook with proper error handling
 * @param {string} webhookUrl - The webhook URL
 * @param {object} data - Data to send
 * @returns {Promise} Fetch promise
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
 * Inject in-page alert for user feedback
 * @param {number} tabId - Tab ID
 * @param {string} message - Alert message
 */
async function injectPageAlert(tabId, message) {
  try {
    await chrome.scripting.executeScript({
      target: { tabId },
      files: ['inpage-alert.js'],
    });
    
    chrome.tabs.sendMessage(tabId, { 
      type: 'show-ha-alert', 
      text: message, 
    });
  } catch (error) {
    console.error('Failed to inject page alert:', error);
    // Silently fail - notification is primary feedback method
  }
}
