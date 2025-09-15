// This script is injected into the active tab to show an alert after sending
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg && msg.type === 'show-ha-alert') {
    alert(msg.text || 'Link sent to Home Assistant!');
  }
});
