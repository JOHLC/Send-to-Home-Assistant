// Add event listener for settings button (moved from popup.html for CSP compliance)
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
// popup.js
// Triggers send to Home Assistant and updates UI
const msgDiv = document.getElementById('popupMsg');
const okBtn = document.getElementById('okBtn');

async function sendToHA() {
  msgDiv.textContent = 'Sending...';
  okBtn.style.display = 'none';
  // Get active tab
  chrome.tabs.query({active: true, currentWindow: true}, (tabs) => {
    const tab = tabs[0];
    if (!tab || !tab.id || tab.url.startsWith('chrome://') || tab.url.startsWith('edge://')) {
      msgDiv.textContent = 'Cannot send from browser internal pages.';
      okBtn.style.display = '';
      return;
    }
    // Get host, ssl, webhookId, and user from storage
    chrome.storage.sync.get(['haHost', 'ssl', 'webhookId', 'userName'], (result) => {
      const haHost = result.haHost;
      const ssl = typeof result.ssl === 'boolean' ? result.ssl : true;
      const webhookId = result.webhookId;
      const userName = result.userName;
      if (!haHost || !webhookId) {
        msgDiv.textContent = 'Please set your Home Assistant hostname and webhook ID in the extension options.';
        okBtn.style.display = '';
        chrome.runtime.openOptionsPage();
        return;
      }
      const webhookUrl = `${ssl ? 'https' : 'http'}://${haHost}/api/webhook/${webhookId}`;
      // Collect page info from tab
      chrome.scripting.executeScript({
        target: {tabId: tab.id},
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
                    if (n > size) size = n;
                  }
                }
              }
              // If no sizes, guess 16, else use parsed size
              if (!size) size = 16;
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
            user_agent: navigator.userAgent
          };
        }
      }, (results) => {
        if (!results || !results[0] || !results[0].result) {
          msgDiv.textContent = 'Could not get page info.';
          okBtn.style.display = '';
          return;
        }
        const pageInfo = results[0].result;
        if (userName) {
          pageInfo.user = userName;
        }
        fetch(webhookUrl, {
          method: 'POST',
          headers: {'Content-Type': 'application/json'},
          body: JSON.stringify(pageInfo)
        })
        .then(resp => {
          if (resp.ok) {
            msgDiv.textContent = 'Link sent to Home Assistant!';
            // Show preview of what was sent (friendly, not JSON, separated)
            let preview = document.getElementById('preview');
            if (!preview) {
              preview = document.createElement('div');
              preview.id = 'preview';
              preview.className = 'preview';
              msgDiv.parentNode.insertBefore(preview, okBtn);
            }
            preview.innerHTML =
              '<div>' +
              (pageInfo.favicon ? `<div class="preview-row" style="justify-content:center;"><img src="${pageInfo.favicon}" alt="favicon" style="width:38px;height:38px;vertical-align:middle;margin-bottom:0.5em;border-radius:8px;box-shadow:0 1px 4px #00b4fc44;"></div>` : '') +
              `<div class="preview-row"><span class="preview-label">Title:</span><span class="preview-value">${pageInfo.title}</span></div>` +
              `<div class="preview-row"><span class="preview-label">URL:</span><span class="preview-value preview-url" title="${pageInfo.url}"><a href="${pageInfo.url}" target="_blank" rel="noopener noreferrer" style="color:#7fd0ff;text-decoration:underline;">${pageInfo.url}</a></span></div>` +
              (pageInfo.selected ? `<div class="preview-row"><span class="preview-label">Selected:</span><span class="preview-value">${pageInfo.selected}</span></div>` : '') +
              `<div class="preview-row"><span class="preview-label">Timestamp:</span><span class="preview-value">${pageInfo.timestamp.replace('T',' ').replace('Z','')}</span></div>` +
              '</div>';
            // Add copy to clipboard button for JSON
            let copyBtn = document.getElementById('copyJsonBtn');
            if (!copyBtn) {
              copyBtn = document.createElement('button');
              copyBtn.id = 'copyJsonBtn';
              copyBtn.className = 'copy-btn';
              copyBtn.textContent = 'Copy JSON';
              // Create a wrapper div for centering
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
              copyBtn.addEventListener('click', () => {
                navigator.clipboard.writeText(JSON.stringify(pageInfo, null, 2)).then(() => {
                  copyBtn.textContent = 'Copied!';
                  setTimeout(() => { copyBtn.textContent = 'Copy JSON'; }, 1500);
                });
              });
            }
            // --- Auto-close popup after 15 seconds unless user is active ---
let autoCloseTimer = null;
let userActive = false;
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
  }, 15000);
}
['mousemove', 'keydown', 'mousedown', 'touchstart'].forEach(evt => {
  window.addEventListener(evt, resetAutoCloseTimer, {passive: true});
});
resetAutoCloseTimer();
            okBtn.style.display = '';
          } else {
            resp.text().then(text => {
              let msg = 'HTTP ' + resp.status;
              if (text) {
                msg += ': ' + text;
              } else if (resp.status === 404) {
                msg += ' (Webhook not found. Check your URL.)';
              } else if (resp.status === 401 || resp.status === 403) {
                msg += ' (Unauthorized. Check your Home Assistant token or permissions.)';
              }
              msgDiv.textContent = 'Error: ' + msg;
              okBtn.style.display = '';
            });
          }
        })
        .catch((err) => {
          let msg = 'Unknown error.';
          if (err && err.message && err.message.includes('Failed to fetch')) {
            msg = 'Could not reach the webhook URL. Please check your network or URL.';
          } else if (err && err.message) {
            msg = err.message;
          } else if (typeof err === 'string') {
            msg = err;
          }
          msgDiv.textContent = 'Error: ' + msg;
          okBtn.style.display = '';
          // chrome.scripting.executeScript({
          //   target: {tabId: tab.id},
          //   files: ['inpage-alert.js']
          // }, () => {
          //   chrome.tabs.sendMessage(tab.id, {type: 'show-ha-alert', text: 'Error sending to Home Assistant: ' + msg});
          // });
        });
      });
    });
  });
}

sendToHA();

okBtn.addEventListener('click', () => {
  window.close();
});