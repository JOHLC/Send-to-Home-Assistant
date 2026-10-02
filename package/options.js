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
const connectionState = document.getElementById('connectionState');
const webhookVisibilityBtn = document.getElementById('toggleWebhookId');
const identitySettings = document.getElementById('identitySettings');
const resetConfirmation = document.getElementById('resetConfirmation');
const confirmResetBtn = document.getElementById('confirmClearConfig');
const cancelResetBtn = document.getElementById('cancelClearConfig');
let connectionDirty = false;

function setConnectionState(message, state = '') {
  if (!connectionState) {
    return;
  }
  connectionState.textContent = message;
  connectionState.dataset.state = state;
}


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
      versionDiv.textContent = `Version: v${manifest.version_name || manifest.version}`;
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
    connectionDirty = false;
    setConnectionState(result.haHost && result.webhookId ? 'Saved · not tested' : 'Not configured',
      result.haHost && result.webhookId ? 'saved' : '');
    if (identitySettings && (result.userName || result.deviceName)) {
      identitySettings.open = true;
    }
  }).catch((error) => {
    setConnectionState('Could not load settings', 'unsaved');
    showStatus(error.message, 'error');
  });
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
  
  // Display unsaved state for connection fields only. Profiles and preferences
  // save independently and display their own feedback.
  for (const field of [hostInput, sslToggle, webhookIdInput, userInput, deviceInput]) {
    if (!field) {
      continue;
    }
    field.addEventListener('input', () => {
      connectionDirty = true;
      setConnectionState('Unsaved changes', 'unsaved');
      clearStatus();
    });
    field.addEventListener('change', () => {
      connectionDirty = true;
      setConnectionState('Unsaved changes', 'unsaved');
      clearStatus();
    });
  }

  if (webhookVisibilityBtn) {
    webhookVisibilityBtn.addEventListener('click', () => {
      const show = webhookIdInput.type === 'password';
      webhookIdInput.type = show ? 'text' : 'password';
      webhookVisibilityBtn.textContent = show ? 'Hide' : 'Show';
      webhookVisibilityBtn.setAttribute('aria-label', (show ? 'Hide' : 'Show') + ' webhook ID');
      webhookVisibilityBtn.setAttribute('aria-pressed', String(show));
    });
  }

  if (clearBtn && resetConfirmation) {
    clearBtn.addEventListener('click', () => {
      resetConfirmation.classList.remove('hidden');
      clearBtn.disabled = true;
    });
    cancelResetBtn.addEventListener('click', () => {
      resetConfirmation.classList.add('hidden');
      clearBtn.disabled = false;
    });
    confirmResetBtn.addEventListener('click', async() => {
      await handleClearConfig();
      resetConfirmation.classList.add('hidden');
      clearBtn.disabled = false;
    });
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
  let requestedOrigin = null;
  let previousOrigin = null;
  let saved = false;
  try {
    // Chrome requires permissions.request to run from the Save click's user gesture.
    requestedOrigin = await requestWebhookPermission(config);
    const previous = await ExtensionUtils.getStorageConfig();
    previousOrigin = configuredWebhookOrigin(previous);

    await saveConfiguration(config);
    saved = true;
    // Remove all stale optional host grants, including ones left by older builds.
    await revokeUnusedWebhookPermissions(requestedOrigin);
    connectionDirty = false;
    setConnectionState('Saved · not tested', 'saved');
    showStatus('Connection settings saved. Send a test to verify your Home Assistant automation.', 'success');
  } catch (error) {
    if (!saved && requestedOrigin && requestedOrigin !== previousOrigin) {
      try {
        // Never leave a newly requested grant behind after a failed save.
        await revokeUnusedWebhookPermissions(previousOrigin);
      } catch (cleanupError) {
        showStatus('Save failed: ' + error.message + '. Could not revoke temporary access: ' +
          cleanupError.message, 'error');
        saveBtn.disabled = false;
        return;
      }
    }
    setConnectionState(saved ? 'Saved · permissions need attention' : 'Unsaved changes', 'unsaved');
    showStatus(saved ? 'Settings saved, but old permissions could not be removed: ' + error.message :
      'Save failed: ' + error.message, 'error');
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
  let requestedOrigin = null;
  let savedOrigin = null;
  try {
    // Request immediately in the click handler to preserve user activation.
    requestedOrigin = await requestWebhookPermission(config);
    const previous = await ExtensionUtils.getStorageConfig();
    savedOrigin = configuredWebhookOrigin(previous);

    showStatus('Sending test payload...', '');
    await performWebhookTest(config);
    if (!connectionDirty) {
      setConnectionState('Test accepted', 'saved');
    }
    showStatus('Test POST accepted. Check your Home Assistant automation trace; HTTP success does not confirm it ran.',
      'success');
  } catch (error) {
    showStatus('Test failed: ' + error.message, 'error');
  } finally {
    if (requestedOrigin) {
      try {
        // A test with unsaved settings must not retain its temporary site grant.
        await revokeUnusedWebhookPermissions(savedOrigin);
      } catch (error) {
        showStatus('Test finished, but temporary site access could not be removed: ' + error.message, 'error');
      }
    }
    testBtn.disabled = false;
  }
}

/**
 * Handle clear config button click
 */
async function handleClearConfig() {
  clearBtn.disabled = true;
  try {
    await Promise.all([
      new Promise((resolve, reject) => chrome.storage.sync.remove(
        ['haHost', 'ssl', 'webhookId', 'userName', 'deviceName', 'sendProfiles', 'defaultProfileId', 'quickSendDefault'],
        () => chrome.runtime.lastError ? reject(new Error(chrome.runtime.lastError.message)) : resolve(),
      )),
      new Promise((resolve, reject) => chrome.storage.local.remove(
        ['webhookId', 'updateCheckEnabled', 'updateInfo', 'lastUpdateCheck'],
        () => chrome.runtime.lastError ? reject(new Error(chrome.runtime.lastError.message)) : resolve(),
      )),
    ]);
    // Also clean old grants that are not associated with the currently saved host.
    await revokeUnusedWebhookPermissions(null);
    hostInput.value = '';
    sslToggle.checked = true;
    webhookIdInput.value = '';
    userInput.value = '';
    if (deviceInput) {
      deviceInput.value = '';
    }
    updateSslWarning();
    const updateToggle = document.getElementById('updateCheckToggle');
    if (updateToggle) {
      updateToggle.checked = false;
    }
    const updateStatus = document.getElementById('updateStatus');
    if (updateStatus) {
      updateStatus.replaceChildren();
      updateStatus.classList.add('hidden');
    }
    connectionDirty = false;
    setConnectionState('Not configured');
    showStatus('Connection, profiles and update preferences cleared; webhook access revoked.', 'success');
  } catch (error) {
    showStatus('Could not clear all settings or site access: ' + error.message, 'error');
  } finally {
    clearBtn.disabled = false;
  }
}

// --- SSL Warning Management ---

/**
 * Update SSL warning display based on SSL toggle state
 */
function updateSslWarning() {
  const warn = document.getElementById('sslWarn');
  if (warn) {
    warn.classList.toggle('hidden', sslToggle.checked);
  }
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
function configuredWebhookOrigin(config) {
  if (!config || !config.haHost) {
    return null;
  }
  try {
    const endpoint = new URL(ExtensionUtils.createWebhookUrl(
      config.haHost, config.ssl, config.webhookId || 'placeholder'));
    return endpoint.protocol + '//' + endpoint.hostname + '/*';
  } catch (_) {
    return null;
  }
}

async function revokeUnusedWebhookPermissions(keepOrigin) {
  const granted = await chrome.permissions.getAll();
  const required = new Set(chrome.runtime.getManifest().host_permissions || []);
  const stale = (granted.origins || []).filter((origin) =>
    (origin === '<all_urls>' || origin.startsWith('https://') || origin.startsWith('http://')) &&
    !required.has(origin) && origin !== keepOrigin);
  if (stale.length) {
    const removed = await chrome.permissions.remove({ origins: stale });
    if (!removed) {
      throw new Error('The browser declined to remove obsolete host permissions.');
    }
  }
}

async function requestWebhookPermission(config) {
  const origin = configuredWebhookOrigin({
    haHost: config.host, ssl: config.ssl, webhookId: config.webhookId,
  });
  if (!origin) {
    throw new Error('Invalid Home Assistant host.');
  }
  const granted = await chrome.permissions.request({ origins: [origin] });
  if (!granted) {
    throw new Error('Site access declined. Grant access to your Home Assistant host to send data.');
  }
  return origin;
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
  statusDiv.className = 'status hidden';
}

