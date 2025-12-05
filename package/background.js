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
chrome.contextMenus.onClicked.addListener(async(info, tab) => {
  if (!tab || !tab.id) {
    return;
  }

  // Check for restricted pages first
  if (ExtensionUtils.isRestrictedPage(tab.url)) {
    const errorMessage = 'This extension cannot send data from browser internal pages (settings, extensions, etc.). Please navigate to a regular website and try again.';
    ExtensionUtils.createNotification(errorMessage, 'send-to-ha-status', 'icon-256.png');
    return;
  }

  if (info.menuItemId === 'send-to-ha-default') {
    await handleContextMenuSend(info, tab);
  }
  // Future sub-options can be handled here
});

/**
 * Handle sending from context menu
 * @param {object} info - Context menu info
 * @param {object} tab - Tab information
 */
async function handleContextMenuSend(info, tab) {
  await ExtensionUtils.sendToHomeAssistant({
    tab,
    contextInfo: info,
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
 * Handle messages from popup and options page
 */
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg && msg.popupOpened) {
    sendResponse(lastSendStatus || { status: 'pending' });
    return false;
  }
  
  if (msg && msg.type === 'settings-changed') {
    console.log('Settings changed, updating auto-update alarm...');
    setupAutoUpdateAlarm(msg.autoUpdate, msg.updateInterval).then(() => {
      sendResponse({ success: true });
    }).catch((error) => {
      console.error('Failed to setup alarm:', error);
      sendResponse({ success: false, error: error.message });
    });
    return true; // Will respond asynchronously
  }
  
  return false;
});

/**
 * Handle extension icon clicks (direct sending)
 */
chrome.action.onClicked.addListener(async(tab) => {
  // Check for restricted pages
  if (!tab || !tab.id || ExtensionUtils.isRestrictedPage(tab.url)) {
    const errorMessage = 'This extension cannot send data from browser internal pages (settings, extensions, etc.). Please navigate to a regular website and try again.';
    ExtensionUtils.createNotification(errorMessage, 'send-to-ha-status', 'icon-256.png');
    lastSendStatus = { status: 'error', error: errorMessage };
    return;
  }

  try {
    await handleDirectSend(tab);
  } catch (error) {
    console.error('Direct send failed:', error);
    const errorMessage = `Failed to send: ${ExtensionUtils.escapeHTML(error.message)}`;
    ExtensionUtils.createNotification(errorMessage, 'send-to-ha-status', 'icon-256.png');
    lastSendStatus = { status: 'error', error: error.message };
  }
});

/**
 * Send active tab to Home Assistant (reusable function)
 * @param {object} [options] - Optional configuration
 * @param {boolean} [options.showPageAlert=true] - Whether to show in-page alert
 * @param {boolean} [options.showNotifications=true] - Whether to show notifications
 * @returns {Promise<object>} Result object
 */
async function sendActiveTabToHomeAssistant(options = {}) {
  const { showPageAlert = true, showNotifications = true } = options;
  
  // Get the active tab
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  
  console.log('Active tab for send:', tab ? {id: tab.id, url: tab.url, title: tab.title} : 'NONE');
  
  if (!tab || !tab.id) {
    const error = new Error('No active tab found');
    console.error('No active tab:', error);
    lastSendStatus = { status: 'error', error: error.message };
    return { status: 'error', error: error.message };
  }

  // Check for restricted pages
  if (ExtensionUtils.isRestrictedPage(tab.url)) {
    const errorMessage = 'This extension cannot send data from browser internal pages (settings, extensions, etc.). Please navigate to a regular website and try again.';
    console.warn('Restricted page:', tab.url);
    if (showNotifications) {
      ExtensionUtils.createNotification(errorMessage, 'send-to-ha-status', 'icon-256.png');
    }
    lastSendStatus = { status: 'error', error: errorMessage };
    return { status: 'error', error: errorMessage };
  }

  try {
    const result = await ExtensionUtils.sendToHomeAssistant({
      tab,
      showNotifications,
      onSuccess: async(_pageInfo) => {
        lastSendStatus = { status: 'sent' };
        // Inject in-page alert as fallback (only if enabled)
        if (showPageAlert) {
          await injectPageAlert(tab.id, 'Link sent to Home Assistant!');
        }
      },
      onError: async(error) => {
        lastSendStatus = { status: 'error', error: error.message };
        // Inject in-page alert as fallback (only if enabled)
        if (showPageAlert) {
          await injectPageAlert(
            tab.id,
            `Error sending to Home Assistant: ${ExtensionUtils.escapeHTML(error.message)}`,
          );
        }
      },
    });

    return result;
  } catch (error) {
    console.error('Send failed:', error);
    const errorMessage = `Failed to send: ${ExtensionUtils.escapeHTML(error.message)}`;
    if (showNotifications) {
      ExtensionUtils.createNotification(errorMessage, 'send-to-ha-status', 'icon-256.png');
    }
    lastSendStatus = { status: 'error', error: error.message };
    return { status: 'error', error: error.message };
  }
}

/**
 * Handle direct sending from extension icon
 * @param {object} tab - The active tab
 */
async function handleDirectSend(tab) {
  // Use the reusable function, passing the tab explicitly
  const result = await ExtensionUtils.sendToHomeAssistant({
    tab,
    onSuccess: async(_pageInfo) => {
      lastSendStatus = { status: 'sent' };
      // Inject in-page alert as fallback
      await injectPageAlert(tab.id, 'Link sent to Home Assistant!');
    },
    onError: async(error) => {
      lastSendStatus = { status: 'error', error: error.message };
      // Inject in-page alert as fallback
      await injectPageAlert(
        tab.id,
        `Error sending to Home Assistant: ${ExtensionUtils.escapeHTML(error.message)}`,
      );
    },
  });

  return result;
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

// --- Auto-Update Mechanism ---

const AUTO_UPDATE_ALARM_NAME = 'ha-auto-update';

/**
 * Track the last sent base URL for the active tab (in-memory only)
 * Resets when service worker restarts
 */
let lastSentBaseUrl = null;

/**
 * Track the current active tab ID to detect tab switches
 */
let currentActiveTabId = null;

/**
 * Extract base URL from a full URL (protocol + hostname + pathname)
 * Removes query parameters and hash fragments
 * @param {string} url - The full URL
 * @returns {string|null} The base URL or null if extraction fails
 */
function getBaseUrl(url) {
  if (!url) {
    return null;
  }
  
  try {
    const urlObj = new URL(url);
    // Return protocol + hostname + pathname (no query params or hash)
    return urlObj.origin + urlObj.pathname;
  } catch (error) {
    // If URL parsing fails, return null
    // This can happen with invalid URLs or special protocols
    console.warn('Failed to extract base URL from:', url, error);
    return null;
  }
}

/**
 * Setup or clear the auto-update alarm based on settings
 * @param {boolean} enabled - Whether auto-update is enabled
 * @param {number} intervalSeconds - Update interval in seconds
 */
async function setupAutoUpdateAlarm(enabled, intervalSeconds) {
  // Clear existing alarm first
  await chrome.alarms.clear(AUTO_UPDATE_ALARM_NAME);
  
  if (enabled && intervalSeconds >= 5) {
    // Chrome alarms API requires intervals in minutes, but we can use periodInMinutes
    // For intervals < 1 minute, we need to use a workaround
    // Chrome alarms have a minimum of 1 minute for periodic alarms in production
    // For development/testing, we can set shorter intervals
    const intervalMinutes = intervalSeconds / 60;
    
    console.log(`Setting up auto-update alarm with interval: ${intervalSeconds} seconds (${intervalMinutes} minutes)`);
    
    // Create alarm with the specified interval
    await chrome.alarms.create(AUTO_UPDATE_ALARM_NAME, {
      delayInMinutes: intervalMinutes,
      periodInMinutes: intervalMinutes,
    });
    
    console.log('Auto-update alarm created successfully');
  } else {
    console.log('Auto-update alarm cleared');
  }
}

/**
 * Handle auto-update alarm trigger
 * @param {object} alarm - Alarm information
 */
async function handleAutoUpdateAlarm(alarm) {
  if (alarm.name !== AUTO_UPDATE_ALARM_NAME) {
    return;
  }
  
  console.log('Auto-update alarm triggered at', new Date().toISOString());
  
  try {
    // Get the active tab first to check for changes
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    
    if (!tab || !tab.id) {
      console.log('Auto-update: No active tab found, skipping');
      return;
    }
    
    // Check for restricted pages
    if (ExtensionUtils.isRestrictedPage(tab.url)) {
      console.log('Auto-update: Restricted page, skipping');
      return;
    }
    
    // Extract base URL from current tab
    const currentBaseUrl = getBaseUrl(tab.url);
    
    // If base URL extraction failed, fall back to sending (better to send than miss updates)
    if (currentBaseUrl === null) {
      console.log('Auto-update: Base URL extraction failed, sending anyway');
    } else if (currentBaseUrl === lastSentBaseUrl && lastSentBaseUrl !== null) {
      // Base URL hasn't changed, skip sending
      console.log('Auto-update: Skipping webhook - base URL unchanged:', currentBaseUrl);
      return;
    } else {
      // Base URL has changed or this is the first time
      console.log('Auto-update: Sending webhook - base URL changed:', {
        previous: lastSentBaseUrl,
        current: currentBaseUrl,
      });
    }
    
    // Send active tab without showing page alert or notifications
    // (to avoid spamming the user with notifications every interval)
    const result = await sendActiveTabToHomeAssistant({
      showPageAlert: false,
      showNotifications: false,
    });
    
    // Update last sent base URL only if send was successful
    if (result.status === 'sent' && currentBaseUrl !== null) {
      lastSentBaseUrl = currentBaseUrl;
      currentActiveTabId = tab.id;
    }
    
    console.log('Auto-update result:', result.status);
  } catch (error) {
    console.error('Auto-update failed:', error);
  }
}

/**
 * Initialize auto-update based on stored settings
 */
async function initializeAutoUpdate() {
  chrome.storage.sync.get(['autoUpdate', 'updateInterval'], async(data) => {
    const autoUpdate = typeof data.autoUpdate === 'boolean' ? data.autoUpdate : false;
    const updateInterval = typeof data.updateInterval === 'number' ? data.updateInterval : 60;
    
    console.log(`Initializing auto-update: enabled=${autoUpdate}, interval=${updateInterval}s`);
    
    await setupAutoUpdateAlarm(autoUpdate, updateInterval);
  });
}

// Listen for alarm triggers
chrome.alarms.onAlarm.addListener(handleAutoUpdateAlarm);

/**
 * Handle tab activation (when user switches to a different tab)
 * Reset tracking so the new tab always sends an update
 */
chrome.tabs.onActivated.addListener(async(activeInfo) => {
  // Check if auto-update is enabled before resetting
  chrome.storage.sync.get(['autoUpdate'], (data) => {
    if (data.autoUpdate === true) {
      // Tab switched - reset tracking so new tab sends update
      if (currentActiveTabId !== activeInfo.tabId) {
        console.log('Auto-update: Tab switched, resetting base URL tracking');
        lastSentBaseUrl = null;
        currentActiveTabId = activeInfo.tabId;
      }
    }
  });
});

/**
 * Handle tab URL updates (when user navigates within the same tab)
 * Reset tracking so navigation triggers an update
 */
chrome.tabs.onUpdated.addListener(async(tabId, changeInfo, tab) => {
  // Only process if this is the active tab and URL has changed
  if (changeInfo.url && tab.active) {
    // Check if auto-update is enabled before resetting
    chrome.storage.sync.get(['autoUpdate'], (data) => {
      if (data.autoUpdate === true) {
        // URL changed in active tab - reset tracking so navigation sends update
        console.log('Auto-update: URL changed in active tab, resetting base URL tracking');
        lastSentBaseUrl = null;
        currentActiveTabId = tabId;
      }
    });
  }
});

// Initialize auto-update on startup
initializeAutoUpdate();
if (chrome.runtime.onStartup) {
  chrome.runtime.onStartup.addListener(initializeAutoUpdate);
}
