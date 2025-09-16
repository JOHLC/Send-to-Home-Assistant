/**
 * Send to Home Assistant - In-page Alert Script
 * 
 * This script is injected into web pages to show user feedback alerts
 * when the extension performs actions. Serves as a fallback to browser notifications.
 */

/**
 * Show an in-page alert with the given message
 * @param {string} message - Alert message to display
 */
function showInPageAlert(message) {
  // Use a more user-friendly alert if possible
  if (window.confirm) {
    // Use confirm dialog which is less intrusive than alert
    const result = window.confirm(`${message}\n\nClick OK to close this message.`);
    return result;
  } else if (window.alert) {
    // Fallback to standard alert
    window.alert(message);
    return true;
  }
  
  // Last resort: console log (shouldn't happen in normal browsers)
  console.info('Send to Home Assistant:', message);
  return false;
}

/**
 * Message listener for extension communication
 */
if (chrome && chrome.runtime && chrome.runtime.onMessage) {
  chrome.runtime.onMessage.addListener((msg, _sender, _sendResponse) => {
    if (msg && msg.type === 'show-ha-alert') {
      const message = msg.text || 'Link sent to Home Assistant!';
      showInPageAlert(message);
    }
  });
} else {
  // Fallback for environments where chrome.runtime is not available
  console.warn('Send to Home Assistant: Chrome runtime not available for in-page alerts');
}
