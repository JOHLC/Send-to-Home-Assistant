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
  chrome.storage.sync.get(['webhookUrl'], async (result) => {
    const webhookUrl = result.webhookUrl;
    if (!webhookUrl) {
      chrome.runtime.openOptionsPage();
      chrome.notifications?.create({
        type: 'basic',
        iconUrl: 'icon.png',
        title: 'Send to Home Assistant',
        message: 'Please set your Home Assistant webhook URL in the extension options.'
      });
      lastSendStatus = {status: 'error', error: 'No webhook URL set.'};
      return;
    }
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
