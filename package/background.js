// --- Context Menu Integration ---

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
    // (Future sub-options can be added here)
  });
});


chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (!tab || !tab.id) return;
  if (info.menuItemId === 'send-to-ha-default') {
    // Prepare message payload
    let payload = {
      title: tab.title,
      url: info.linkUrl || info.pageUrl || tab.url,
      favicon: tab.favIconUrl || '',
      selected: info.selectionText || '',
      timestamp: new Date().toISOString()
    };
    chrome.storage.sync.get(['haHost', 'ssl', 'webhookId', 'userName', 'deviceName'], (result) => {
      const haHost = result.haHost;
      const ssl = typeof result.ssl === 'boolean' ? result.ssl : true;
      const webhookId = result.webhookId;
      const userName = result.userName;
      const deviceName = result.deviceName;
      if (!haHost || !webhookId) {
        chrome.runtime.openOptionsPage();
        chrome.notifications.create({
          type: 'basic',
          iconUrl: 'icon.png',
          title: 'Send to Home Assistant',
          message: 'Please set your Home Assistant hostname and webhook ID in the extension options.'
        });
        return;
      }
      const webhookUrl = `${ssl ? 'https' : 'http'}://${haHost}/api/webhook/${webhookId}`;
      // Compose data
      const data = {
        ...payload,
        user: userName || '',
        device: deviceName || ''
      };
      fetch(webhookUrl, {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify(data)
      })
      .then(() => {
        chrome.notifications.create({
          type: 'basic',
          iconUrl: 'icon.png',
          title: 'Send to Home Assistant',
          message: 'Sent successfully!'
        });
      })
      .catch(() => {
        chrome.notifications.create({
          type: 'basic',
          iconUrl: 'icon.png',
          title: 'Send to Home Assistant',
          message: 'Failed to send.'
        });
      });
    });
  }
  // (Future sub-options can be handled here)
});
// --- Extension update check (GitHub releases) ---
const UPDATE_CHECK_KEY = 'lastUpdateCheck';
const UPDATE_INFO_KEY = 'updateInfo';
const GITHUB_RELEASES_API = 'https://api.github.com/repos/JOHLC/Send-to-Home-Assistant/releases/latest';
const EXT_VERSION = chrome.runtime.getManifest().version;

function checkForUpdate() {
  const now = Date.now();
  chrome.storage.local.get(['updateCheckEnabled', UPDATE_CHECK_KEY, UPDATE_INFO_KEY], (data) => {
    if (data.updateCheckEnabled === false) {
      // User disabled update checks
      chrome.storage.local.remove([UPDATE_INFO_KEY, UPDATE_CHECK_KEY]);
      return;
    }
    const lastCheck = data[UPDATE_CHECK_KEY] || 0;
    // 24 hours = 86400000 ms
    if (now - lastCheck < 86400000 && data[UPDATE_INFO_KEY]) {
      // Already checked within 24h, do nothing
      return;
    }
    fetch(GITHUB_RELEASES_API)
      .then(resp => resp.json())
      .then(release => {
        let latest = release.tag_name || release.name || '';
        if (latest.startsWith('v')) latest = latest.slice(1);
        const isNewer = compareVersions(latest, EXT_VERSION) > 0;
        const info = {
          isNewer,
          latest,
          html_url: release.html_url,
          body: release.body || '',
          checkedAt: now
        };
        chrome.storage.local.set({[UPDATE_CHECK_KEY]: now, [UPDATE_INFO_KEY]: info});
      })
      .catch(() => {
        // On error, clear update info
        chrome.storage.local.remove([UPDATE_INFO_KEY]);
      });
  });
}

// Simple version comparison: returns 1 if a > b, -1 if a < b, 0 if equal
function compareVersions(a, b) {
  const pa = a.split('.').map(Number);
  const pb = b.split('.').map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const na = pa[i] || 0, nb = pb[i] || 0;
    if (na > nb) return 1;
    if (na < nb) return -1;
  }
  return 0;
}

// Run on startup
checkForUpdate();
chrome.runtime.onStartup && chrome.runtime.onStartup.addListener(checkForUpdate);
// background.js
// Listen for popup.js requesting status
let lastSendStatus = null;
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg && msg.popupOpened) {
    sendResponse(lastSendStatus || {status: 'pending'});
  }
});

chrome.action.onClicked.addListener(async (tab) => {
  // ...existing code...
  if (tab.url.startsWith('chrome://') || tab.url.startsWith('edge://')) {
    chrome.notifications?.create({
      type: 'basic',
      iconUrl: 'icon.png',
      title: 'Send to Home Assistant',
      message: 'Cannot send from chrome:// or edge:// pages.'
    });
    lastSendStatus = {status: 'error', error: 'Cannot send from browser internal pages.'};
    return;
  }
  chrome.storage.sync.get(['haHost', 'ssl', 'webhookId'], async (result) => {
    const haHost = result.haHost;
    const ssl = typeof result.ssl === 'boolean' ? result.ssl : true;
    const webhookId = result.webhookId;
    if (!haHost || !webhookId) {
      chrome.runtime.openOptionsPage();
      chrome.notifications?.create({
        type: 'basic',
        iconUrl: 'icon.png',
        title: 'Send to Home Assistant',
        message: 'Please set your Home Assistant hostname and webhook ID in the extension options.'
      });
      lastSendStatus = {status: 'error', error: 'No webhook host or ID set.'};
      return;
    }
    const webhookUrl = `${ssl ? 'https' : 'http'}://${haHost}/api/webhook/${webhookId}`;
    chrome.scripting.executeScript({
      target: {tabId: tab.id},
      func: () => {
        // ...existing code...
        let favicon = '';
        const links = document.getElementsByTagName('link');
        for (let i = 0; i < links.length; i++) {
          if ((links[i].rel === 'icon' || links[i].rel === 'shortcut icon') && links[i].href) {
            favicon = links[i].href;
            break;
          }
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
          timestamp: new Date().toISOString()
        };
      }
    }, (results) => {
      if (!results || !results[0] || !results[0].result) {
        chrome.notifications?.create({
          type: 'basic',
          iconUrl: 'icon.png',
          title: 'Send to Home Assistant',
          message: 'Could not get page info.'
        });
        lastSendStatus = {status: 'error', error: 'Could not get page info.'};
        return;
      }
      const pageInfo = results[0].result;
      pageInfo.user_agent = navigator.userAgent;
      const notifId = 'send-to-ha-status';
      chrome.notifications?.create(notifId, {
        type: 'basic',
        iconUrl: 'icon.png',
        title: 'Send to Home Assistant',
        message: 'Sending to Home Assistant...'
      });
      fetch(webhookUrl, {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify(pageInfo)
      })
      .then((resp) => {
        chrome.notifications?.update(notifId, {
          type: 'basic',
          iconUrl: 'icon.png',
          title: 'Send to Home Assistant',
          message: 'Sent to Home Assistant!'
        });
        lastSendStatus = {status: 'sent'};
        // Inject in-page alert as fallback
        chrome.scripting.executeScript({
          target: {tabId: tab.id},
          files: ['package/inpage-alert.js']
        }, () => {
          chrome.tabs.sendMessage(tab.id, {type: 'show-ha-alert', text: 'Link sent to Home Assistant!'});
        });
      })
      .catch((err) => {
        chrome.notifications?.update(notifId, {
          type: 'basic',
          iconUrl: 'icon.png',
          title: 'Send to Home Assistant',
          message: 'Error: ' + err
        });
        lastSendStatus = {status: 'error', error: err.toString()};
        // Inject in-page alert as fallback
        chrome.scripting.executeScript({
          target: {tabId: tab.id},
          files: ['package/inpage-alert.js']
        }, () => {
          chrome.tabs.sendMessage(tab.id, {type: 'show-ha-alert', text: 'Error sending to Home Assistant: ' + err});
        });
      });
    });
  });
});
