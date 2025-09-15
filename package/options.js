

// Show SSL warning if not checked
document.addEventListener('DOMContentLoaded', updateSslWarning);

// options.js
const hostInput = document.getElementById('haHost');
const sslToggle = document.getElementById('sslToggle');
const webhookIdInput = document.getElementById('webhookId');
const userInput = document.getElementById('userName');
const statusDiv = document.getElementById('status');
const saveBtn = document.getElementById('save');
const testBtn = document.getElementById('test');

function updateSslWarning() {
  let warn = document.getElementById('sslWarn');
  if (!sslToggle.checked) {
    if (!warn) {
      warn = document.createElement('div');
      warn.id = 'sslWarn';
      warn.style.color = '#ffb347';
      warn.style.background = 'rgba(255,180,71,0.08)';
      warn.style.border = '1px solid #ffb347';
      warn.style.borderRadius = '8px';
      warn.style.padding = '0.7em 1em';
      warn.style.margin = '0.7em 0 1em 0';
      warn.style.fontSize = '1em';
      warn.innerHTML =
        '<b>Warning:</b> You are not using SSL (https).<br>This is not secure!<br>' +
        '<br>Without SSL encryption, you are effectively broadcasting any data sent to this webhook to anyone who wants it.<br><br>' +
        'It is not that hard to set up and should REALLY be configured, especially if you are accessing your Home Assistant remotely. <br>See <a href="https://www.home-assistant.io/docs/configuration/securing/#remote-access" target="_blank" style="color:#ffb347;text-decoration:underline;">Remote Access Security</a> and ' +
        '<a href="https://www.home-assistant.io/integrations/http/#ssl_certificate" target="_blank" style="color:#ffb347;text-decoration:underline;">SSL Certificate Setup</a> for help on setting that up.';
      sslToggle.parentNode.parentNode.insertBefore(warn, sslToggle.parentNode.nextSibling);
    }
  } else if (warn) {
    warn.remove();
  }
}
sslToggle.addEventListener('change', updateSslWarning);

function validateUrl(url) {
  return /^https?:\/\/.+\/api\/webhook\/.+/.test(url);
}

// Load saved host, ssl, webhookId, and user
chrome.storage.sync.get(['haHost', 'ssl', 'webhookId', 'userName'], (result) => {
  if (result.haHost) hostInput.value = result.haHost;
  if (typeof result.ssl === 'boolean') sslToggle.checked = result.ssl;
  if (result.webhookId) webhookIdInput.value = result.webhookId;
  if (result.userName) userInput.value = result.userName;
});

saveBtn.addEventListener('click', () => {
  const host = hostInput.value.trim();
  const ssl = sslToggle.checked;
  const webhookId = webhookIdInput.value.trim();
  const user = userInput.value.trim();
  if (!host) {
    statusDiv.textContent = 'Please enter your Home Assistant hostname or IP.';
    statusDiv.className = 'status error';
    return;
  }
  if (!webhookId) {
    statusDiv.textContent = 'Please enter your Home Assistant webhook ID.';
    statusDiv.className = 'status error';
    return;
  }
  const url = `${ssl ? 'https' : 'http'}://${host}/api/webhook/${webhookId}`;
  statusDiv.textContent = 'Validating webhook...';
  statusDiv.className = 'status';
  fetch(url, { method: 'HEAD', mode: 'cors' })
    .then(resp => {
      if (!resp.ok) {
        let msg = 'Webhook not reachable: HTTP ' + resp.status;
        if (resp.status === 404) msg += ' (Webhook not found. Check your ID and host.)';
        else if (resp.status === 401 || resp.status === 403) msg += ' (Unauthorized. Check your Home Assistant token or permissions.)';
        statusDiv.textContent = msg;
        statusDiv.className = 'status error';
        return;
      }
      // Only save if valid
      chrome.storage.sync.set({haHost: host, ssl, webhookId, userName: user}, () => {
        statusDiv.textContent = 'Saved!';
        statusDiv.className = 'status success';
        setTimeout(() => { statusDiv.textContent = ''; }, 2000);
      });
    })
    .catch(err => {
      let msg = 'Could not reach the webhook URL. Please check your network or URL.';
      if (err && err.message) msg += ' (' + err.message + ')';
      statusDiv.textContent = msg;
      statusDiv.className = 'status error';
    });
});

testBtn.addEventListener('click', () => {
  const host = hostInput.value.trim();
  const ssl = sslToggle.checked;
  const webhookId = webhookIdInput.value.trim();
  if (!host) {
    statusDiv.textContent = 'Please enter your Home Assistant hostname or IP.';
    statusDiv.className = 'status error';
    return;
  }
  if (!webhookId) {
    statusDiv.textContent = 'Please enter your Home Assistant webhook ID.';
    statusDiv.className = 'status error';
    return;
  }
  const url = `${ssl ? 'https' : 'http'}://${host}/api/webhook/${webhookId}`;
  statusDiv.textContent = 'Testing...';
  statusDiv.className = 'status';
  fetch(url, {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({title: 'Test from extension', url: window.location.origin})
  })
  .then(resp => {
    if (resp.ok) {
      statusDiv.textContent = 'Test sent! (Check Home Assistant logs to confirm the webhook was triggered. Home Assistant always returns 200 even for invalid webhooks.)';
      statusDiv.className = 'status success';
    } else {
      resp.text().then(text => {
        let msg = 'Test failed: HTTP ' + resp.status;
        if (text) msg += ': ' + text;
        else if (resp.status === 404) msg += ' (Webhook not found. Check your ID and host.)';
        else if (resp.status === 401 || resp.status === 403) msg += ' (Unauthorized. Check your Home Assistant token or permissions.)';
        statusDiv.textContent = msg;
        statusDiv.className = 'status error';
      });
    }
  })
  .catch(err => {
    let msg = 'Test failed: Could not reach the webhook URL. Please check your network or URL.';
    if (err && err.message) msg += ' (' + err.message + ')';
    statusDiv.textContent = msg;
    statusDiv.className = 'status error';
  });
});
