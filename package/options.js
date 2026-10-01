/**
 * Send to Home Assistant - Options Script
 * 
 * Handles the extension options/settings page functionality including:
 * - Configuration management (host, SSL, webhook ID, user settings)
 * - Version display and update checking
 * - Webhook testing and validation
 * - SSL security warnings
 */

// Import utilities (will be available globally)
// Note: In extension context, we need to include utils.js in the HTML

// --- DOM Elements ---
const hostInput = document.getElementById('haHost');
const sslToggle = document.getElementById('sslToggle');
const webhookIdInput = document.getElementById('webhookId');
const userInput = document.getElementById('userName');
const deviceInput = document.getElementById('deviceName');
const statusDiv = document.getElementById('status');
const saveBtn = document.getElementById('save');
const testBtn = document.getElementById('test');
const clearBtn = document.getElementById('clearConfig');

// --- Initialization ---

/**
 * Initialize options page when DOM is loaded
 */
document.addEventListener('DOMContentLoaded', function() {
  initializeVersionDisplay();
  initializeUpdateChecking();
  loadSavedConfiguration();
  setupEventListeners();
  updateSslWarning();
});

/**
 * Initialize version display in options page
 */
function initializeVersionDisplay() {
  const versionDiv = document.getElementById('extVersion');
  if (versionDiv && chrome.runtime && chrome.runtime.getManifest) {
    const manifest = chrome.runtime.getManifest();
    if (manifest && manifest.version) {
      versionDiv.textContent = `Version: v${manifest.version}`;
    }
  }
}

/**
 * Initialize update checking functionality
 */
function initializeUpdateChecking() {
  const updateDiv = document.getElementById('updateStatus');
  const updateCheckToggle = document.getElementById('updateCheckToggle');
  
  if (!updateCheckToggle || !chrome.storage || !chrome.storage.local) {
    return;
  }

  // Load update check preference
  chrome.storage.local.get('updateCheckEnabled', (data) => {
    updateCheckToggle.checked = typeof data.updateCheckEnabled === 'boolean' 
      ? data.updateCheckEnabled 
      : false; // opt-in
  });

  // Handle toggle changes
  updateCheckToggle.addEventListener('change', () => {
    chrome.storage.local.set({ updateCheckEnabled: updateCheckToggle.checked }, () => {
      chrome.runtime.sendMessage({ type: 'update-preference-changed' }).catch(console.warn);
    });
    
    // Show/hide update status based on toggle
    if (updateDiv) {
      updateDiv.classList.toggle('hidden', !updateCheckToggle.checked);
    }
  });

  // Display current update status
  displayUpdateStatus(updateDiv);
}

/**
 * Display update status information
 * @param {HTMLElement} updateDiv - Update status container element
 */
function displayUpdateStatus(updateDiv) {
  if (!updateDiv || !chrome.storage?.local) {
    return;
  }
  chrome.storage.local.get(['updateInfo', 'updateCheckEnabled'], (data) => {
    const info = data.updateInfo;
    const enabled = data.updateCheckEnabled === true;
    updateDiv.classList.toggle('hidden', !enabled);
    updateDiv.replaceChildren();
    if (!enabled || !info) {
      return;
    }
    const message = document.createElement('div');
    if (info.isNewer && info.latest && info.html_url) {
      try {
        const url = new URL(info.html_url);
        if (url.protocol !== 'https:' || url.hostname !== 'github.com' ||
            !url.pathname.startsWith('/JOHLC/Send-to-Home-Assistant/releases/')) {
          throw new Error('Unexpected release URL');
        }
        const link = document.createElement('a');
        link.href = url.href;
        link.textContent = 'v' + info.latest;
        link.target = '_blank';
        link.rel = 'noopener noreferrer';
        link.className = 'link-blue';
        message.className = 'update-available';
        message.append('New version available: ', link);
      } catch (_) {
        message.textContent = 'Update available. Visit the project releases page.';
      }
    } else if (!info.isNewer) {
      message.className = 'update-latest';
      message.textContent = 'You are using the latest published release.';
    }
    updateDiv.appendChild(message);
  });
}
/**
 * Load saved configuration from storage
 */
function loadSavedConfiguration() {
  ExtensionUtils.getStorageConfig().then((result) => {
    hostInput.value = result.haHost || '';
    sslToggle.checked = result.ssl;
    webhookIdInput.value = result.webhookId || '';
    userInput.value = result.userName || '';
    if (deviceInput) {
      deviceInput.value = result.deviceName || '';
    }
    updateSslWarning();
  }).catch((error) => showStatus(error.message, 'error'));
}

/**
 * Setup event listeners for various UI elements
 */
function setupEventListeners() {
  // SSL toggle change handler
  sslToggle.addEventListener('change', updateSslWarning);
  
  // Save button handler
  saveBtn.addEventListener('click', handleSave);
  
  // Test button handler
  testBtn.addEventListener('click', handleTest);
  
  // Clear config button handler
  if (clearBtn) {
    clearBtn.addEventListener('click', handleClearConfig);
  }
}

// --- Configuration Management ---

/**
 * Handle save button click
 */
async function handleSave() {
  const config = getFormConfiguration();
  const validation = validateConfiguration(config);
  if (!validation.valid) {
    showStatus(validation.message, 'error');
    return;
  }
  saveBtn.disabled = true;
  try {
    // Request permission directly from the Save click's user gesture.
    await requestWebhookPermission(config);
    await saveConfiguration(config);
    showStatus('Saved. Use Test to verify your Home Assistant automation fires.', 'success');
    setTimeout(clearStatus, 3500);
  } catch (error) {
    showStatus(error.message, 'error');
  } finally {
    saveBtn.disabled = false;
  }
}

/**
 * Handle test button click
 */
async function handleTest() {
  const config = getFormConfiguration();
  const validation = validateConfiguration(config);
  if (!validation.valid) {
    showStatus(validation.message, 'error');
    return;
  }
  testBtn.disabled = true;
  try {
    await requestWebhookPermission(config);
    showStatus('Sending test payload...', '');
    await performWebhookTest(config);
    showStatus('POST accepted. Confirm the automation triggered in Home Assistant; HTTP success alone is insufficient.', 'success');
  } catch (error) {
    showStatus(error.message, 'error');
  } finally {
    testBtn.disabled = false;
  }
}

/**
 * Handle clear config button click
 */
async function handleClearConfig() {
  try {
    const old = await ExtensionUtils.getStorageConfig();
    await Promise.all([
      new Promise((resolve, reject) => chrome.storage.sync.remove(
        ['haHost', 'ssl', 'webhookId', 'userName', 'deviceName'],
        () => chrome.runtime.lastError ? reject(new Error(chrome.runtime.lastError.message)) : resolve(),
      )),
      new Promise((resolve, reject) => chrome.storage.local.remove('webhookId',
        () => chrome.runtime.lastError ? reject(new Error(chrome.runtime.lastError.message)) : resolve(),
      )),
    ]);
    if (old.haHost && old.webhookId) {
      const endpoint = new URL(ExtensionUtils.createWebhookUrl(old.haHost, old.ssl, old.webhookId));
      await chrome.permissions.remove({ origins: [endpoint.protocol + '//' + endpoint.hostname + '/*'] });
    }
    hostInput.value = '';
    sslToggle.checked = true;
    webhookIdInput.value = '';
    userInput.value = '';
    if (deviceInput) {
      deviceInput.value = '';
    }
    updateSslWarning();
    showStatus('Settings cleared and webhook site access removed.', 'success');
  } catch (error) {
    showStatus('Could not clear all settings: ' + error.message, 'error');
  }
}

// --- SSL Warning Management ---

/**
 * Update SSL warning display based on SSL toggle state
 */
function updateSslWarning() {
  let warn = document.getElementById('sslWarn');
  
  if (!sslToggle.checked) {
    // Show warning if SSL is disabled
    if (!warn) {
      warn = createSslWarningElement();
      sslToggle.parentNode.parentNode.insertBefore(warn, sslToggle.parentNode.nextSibling);
    }
  } else if (warn) {
    // Remove warning if SSL is enabled
    warn.remove();
  }
}

/**
 * Create SSL warning element
 * @returns {HTMLElement} Warning element
 */
function createSslWarningElement() {
  const warn = document.createElement('div');
  warn.id = 'sslWarn';
  warn.className = 'ssl-warning';
  
  warn.innerHTML = `
    <b>Warning:</b> You are not using SSL (https).<br>This is not secure!<br>
    <br>Without SSL encryption, you are effectively broadcasting any data sent to this webhook to anyone who wants it.<br><br>
    It is not that hard to set up and should REALLY be configured, especially if you are accessing your Home Assistant remotely. <br>
    See <a href="https://www.home-assistant.io/docs/configuration/securing/#remote-access" target="_blank" class="link-warn">Remote Access Security</a> and 
    <a href="https://www.home-assistant.io/integrations/http/#ssl_certificate" target="_blank" class="link-warn">SSL Certificate Setup</a> for help on setting that up.
  `;
  
  return warn;
}

// --- Form and Configuration Management ---

/**
 * Get configuration from form inputs
 * @returns {object} Configuration object
 */
function getFormConfiguration() {
  return {
    host: hostInput.value.trim(),
    ssl: sslToggle.checked,
    webhookId: webhookIdInput.value.trim(),
    user: userInput.value.trim(),
    device: deviceInput ? deviceInput.value.trim() : '',
  };
}

/**
 * Validate configuration object
 * @param {object} config - Configuration to validate
 * @returns {object} Validation result
 */
function validateConfiguration(config) {
  try {
    ExtensionUtils.createWebhookUrl(config.host, config.ssl, config.webhookId);
  } catch (error) {
    return { valid: false, message: error.message };
  }
  if (config.device && !ExtensionUtils.validateDeviceName(config.device)) {
    return { valid: false, message: 'Device name must contain up to 32 letters, numbers, spaces, dashes or underscores.' };
  }
  if (!ExtensionUtils.validateUserName(config.user)) {
    return { valid: false, message: 'User name must not exceed 32 characters.' };
  }
  return { valid: true };
}

/**
 * Save configuration to storage
 * @param {object} config - Configuration to save
 * @returns {Promise} Storage save promise
 */
async function saveConfiguration(config) {
  const syncData = { haHost: config.host, ssl: config.ssl, userName: config.user, deviceName: config.device };
  await new Promise((resolve, reject) => chrome.storage.local.set({ webhookId: config.webhookId },
    () => chrome.runtime.lastError ? reject(new Error(chrome.runtime.lastError.message)) : resolve()));
  await new Promise((resolve, reject) => chrome.storage.sync.set(syncData,
    () => chrome.runtime.lastError ? reject(new Error(chrome.runtime.lastError.message)) : resolve()));
  await new Promise((resolve, reject) => chrome.storage.sync.remove('webhookId',
    () => chrome.runtime.lastError ? reject(new Error(chrome.runtime.lastError.message)) : resolve()));
}

// --- Webhook Testing ---

/**
 * Request site access for the configured Home Assistant origin
 * @param {object} config - Configuration object
 * @returns {Promise} Test result promise
 */
async function requestWebhookPermission(config) {
  const endpoint = new URL(ExtensionUtils.createWebhookUrl(config.host, config.ssl, config.webhookId));
  const origin = endpoint.protocol + '//' + endpoint.hostname + '/*';
  const granted = await chrome.permissions.request({ origins: [origin] });
  if (!granted) {
    throw new Error('Site access declined. Grant access to your Home Assistant host to send data.');
  }
}

/**
 * Perform webhook test with actual payload
 * @param {object} config - Configuration object
 * @returns {Promise} Test result promise
 */
async function performWebhookTest(config) {
  const url = ExtensionUtils.createWebhookUrl(config.host, config.ssl, config.webhookId);
  return ExtensionUtils.sendToWebhook(url, createTestPayload(config));
}

/**
 * Create test payload for webhook testing
 * @param {object} config - Configuration object
 * @returns {object} Test payload
 */
function createTestPayload(config) {
  const payload = {
    title: 'Test from extension',
    url: 'https://example.com/',
    favicon: 'https://raw.githubusercontent.com/JOHLC/Send-to-Home-Assistant/refs/heads/main/package/icon-256.png',
    selected: 'Sample selected text',
    timestamp: new Date().toISOString(),
    user_agent: navigator.userAgent,
  };

  if (config.user) {
    payload.user = config.user;
  }
  if (config.device) {
    payload.device = config.device;
  }

  return payload;
}

// --- UI Status Management ---

/**
 * Show status message with appropriate styling
 * @param {string} message - Status message
 * @param {string} type - Status type ('error', 'success', or empty for default)
 */
function showStatus(message, type) {
  statusDiv.textContent = message;
  statusDiv.className = type ? `status ${type}` : 'status';
}

/**
 * Clear status message
 */
function clearStatus() {
  statusDiv.textContent = '';
  statusDiv.className = 'status';
}

