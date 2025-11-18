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
  createContextMenus();
});

/**
 * Create context menus from stored configuration
 */
function createContextMenus() {
  chrome.contextMenus.removeAll(() => {
    // Get stored context menu items
    chrome.storage.sync.get(['contextMenuItems'], (result) => {
      let menuItems = [{ id: 'default', name: 'Default' }]; // Default fallback
      
      if (result.contextMenuItems && Array.isArray(result.contextMenuItems)) {
        menuItems = result.contextMenuItems;
      }
      
      // Parent menu
      chrome.contextMenus.create({
        id: 'send-to-ha-parent',
        title: 'Send to Home Assistant',
        contexts: ['page', 'selection', 'link'],
      });
      
      // Create sub-menu for each item
      menuItems.forEach((item) => {
        chrome.contextMenus.create({
          id: `send-to-ha-${item.id}`,
          parentId: 'send-to-ha-parent',
          title: item.name,
          contexts: ['page', 'selection', 'link'],
        });
      });
    });
  });
}

// Also recreate menus when storage changes (options page updates)
chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName === 'sync' && changes.contextMenuItems) {
    createContextMenus();
  }
});

/**
 * Format a context ID into a user-friendly display name.
 * Handles special cases like 'default' and formats kebab-case IDs into Title Case.
 * @param {string} contextId - The context ID to format (e.g., 'default', 'work-item')
 * @returns {string} The formatted display name (e.g., 'Default', 'Work Item')
 */
function formatContextIdForDisplay(contextId) {
  // Special case: 'default' should always be 'Default'
  if (contextId === 'default') {
    return 'Default';
  }
  
  // Convert kebab-case to Title Case
  // e.g., 'work-item' -> 'Work Item', 'my-custom-context' -> 'My Custom Context'
  return contextId
    .split('-')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

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

  // Extract context from menu item ID (e.g., 'send-to-ha-default' -> 'default')
  const menuItemId = info.menuItemId;
  if (typeof menuItemId === 'string' && menuItemId.startsWith('send-to-ha-')) {
    const contextId = menuItemId.replace('send-to-ha-', '');
    
    // Get the menu item name from storage
    chrome.storage.sync.get(['contextMenuItems'], async(result) => {
      let contextName;
      
      if (result.contextMenuItems && Array.isArray(result.contextMenuItems)) {
        const menuItem = result.contextMenuItems.find(item => item.id === contextId);
        if (menuItem) {
          contextName = menuItem.name;
        }
      }
      
      // If not found, use a formatted version of the ID as fallback
      if (!contextName) {
        contextName = formatContextIdForDisplay(contextId);
      }
      
      await handleContextMenuSend(info, tab, contextName);
    });
  }
});

/**
 * Handle sending from context menu
 * @param {object} info - Context menu info
 * @param {object} tab - Tab information
 * @param {string} contextName - Name of the context menu item used
 */
async function handleContextMenuSend(info, tab, contextName) {
  await ExtensionUtils.sendToHomeAssistant({
    tab,
    contextInfo: info,
    context: contextName,
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
 * Handle direct sending from extension icon
 * @param {object} tab - The active tab
 */
async function handleDirectSend(tab) {
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
