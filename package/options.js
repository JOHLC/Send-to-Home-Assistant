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
const portInput = document.getElementById('haPort');
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
const resetStatus = document.getElementById('resetStatus');
let connectionDirty = false;
let saveInProgress = false;
let testInProgress = false;
let resetInProgress = false;
// Invalidates any asynchronous initial read when a newer form action occurs.
let formRevision = 0;
let savedUpdateCheckEnabled = false;

/**
 * Retain legacy hostname:port settings without changing the stored format used
 * by the popup and background worker. Unspecified ports use the protocol default.
 */
function splitStoredAddress(address, ssl) {
  const value = typeof address === 'string' ? address.trim() : '';
  const match = /^(.*):([0-9]{1,5})$/.exec(value);
  return match ?
    { hostname: match[1], port: match[2] } :
    { hostname: value, port: ssl ? '443' : '80' };
}

function defaultPort(ssl) {
  return ssl ? '443' : '80';
}

function onSslChanged() {
  const previousDefault = defaultPort(!sslToggle.checked);
  if (portInput.value.trim() === previousDefault) {
    portInput.value = defaultPort(sslToggle.checked);
  }
  updateSslWarning();
}


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
function showUpdatePreferenceMessage(message, type) {
  const feedback = document.getElementById('updatePreferenceStatus');
  if (!feedback) {
    return;
  }
  feedback.textContent = message;
  feedback.className = type ? 'status ' + type : 'status';
}

function initializeUpdateChecking() {
  const updateDiv = document.getElementById('updateStatus');
  const updateCheckToggle = document.getElementById('updateCheckToggle');

  if (!updateCheckToggle || !chrome.storage?.local) {
    return;
  }
  updateCheckToggle.disabled = true;
  chrome.storage.local.get('updateCheckEnabled', (data) => {
    if (chrome.runtime.lastError) {
      showUpdatePreferenceMessage('Could not load update preference: ' +
        chrome.runtime.lastError.message, 'error');
      return;
    }
    savedUpdateCheckEnabled = data.updateCheckEnabled === true;
    updateCheckToggle.checked = savedUpdateCheckEnabled;
    updateCheckToggle.disabled = false;
    displayUpdateStatus(updateDiv);
  });

  updateCheckToggle.addEventListener('change', () => {
    const enabled = updateCheckToggle.checked;
    updateCheckToggle.disabled = true;
    chrome.storage.local.set({ updateCheckEnabled: enabled }, () => {
      const storageError = chrome.runtime.lastError?.message;
      updateCheckToggle.disabled = false;
      if (storageError) {
        updateCheckToggle.checked = savedUpdateCheckEnabled;
        showUpdatePreferenceMessage('Could not save update preference: ' + storageError, 'error');
        if (updateDiv) {
          updateDiv.classList.toggle('hidden', !savedUpdateCheckEnabled);
        }
        return;
      }

      savedUpdateCheckEnabled = enabled;
      showUpdatePreferenceMessage(enabled ? 'Automatic update checks enabled.' :
        'Automatic update checks disabled.', 'success');
      displayUpdateStatus(updateDiv);
      // Storage is authoritative. A temporarily unavailable background worker
      // should not make a successfully saved preference appear to have failed.
      try {
        Promise.resolve(chrome.runtime.sendMessage({ type: 'update-preference-changed' }))
          .catch((error) => console.warn('Update schedule will refresh on startup:', error));
      } catch (error) {
        console.warn('Update schedule will refresh on startup:', error);
      }
    });
  });
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
  const loadRevision = formRevision;
  ExtensionUtils.getStorageConfig().then((result) => {
    // A Save, Test, Reset, or user edit can start and finish while this read is
    // outstanding. Never resurrect a stale credential or overwrite newer input.
    if (loadRevision !== formRevision || connectionDirty ||
        saveInProgress || testInProgress || resetInProgress) {
      return;
    }
    const address = splitStoredAddress(result.haHost, result.ssl);
    hostInput.value = address.hostname;
    sslToggle.checked = result.ssl;
    portInput.value = address.port;
    webhookIdInput.value = result.webhookId || '';
    userInput.value = result.userName || '';
    if (deviceInput) {
      deviceInput.value = result.deviceName || '';
    }
    updateSslWarning();
    connectionDirty = false;
    setConnectionState(result.haHost && result.webhookId ? 'Saved' : 'Not configured',
      result.haHost && result.webhookId ? 'saved' : '');
    if (identitySettings && (result.userName || result.deviceName)) {
      identitySettings.open = true;
    }
  }).catch((error) => {
    if (loadRevision === formRevision) {
      setConnectionState('Could not load settings', 'unsaved');
      showStatus(error.message, 'error');
    }
  });
}

/**
 * Setup event listeners for various UI elements
 */
function setupEventListeners() {
  // SSL toggle change handler
  sslToggle.addEventListener('change', onSslChanged);
  
  // Save button handler
  saveBtn.addEventListener('click', handleSave);
  
  // Test button handler
  testBtn.addEventListener('click', handleTest);
  
  // Display unsaved state for connection fields only. Profiles and preferences
  // save independently and display their own feedback.
  for (const field of [hostInput, portInput, sslToggle, webhookIdInput, userInput, deviceInput]) {
    if (!field) {
      continue;
    }
    field.addEventListener('input', () => {
      formRevision++;
      connectionDirty = true;
      setConnectionState('Unsaved changes', 'unsaved');
      clearStatus();
    });
    field.addEventListener('change', () => {
      formRevision++;
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
      resetStatus.textContent = '';
      resetStatus.className = 'status hidden';
      clearBtn.disabled = false;
    });
    confirmResetBtn.addEventListener('click', async() => {
      if (resetInProgress) {
        return;
      }
      confirmResetBtn.disabled = true;
      cancelResetBtn.disabled = true;
      resetStatus.textContent = '';
      resetStatus.className = 'status hidden';
      try {
        const resetSucceeded = await handleClearConfig();
        if (resetSucceeded) {
          resetConfirmation.classList.add('hidden');
          clearBtn.disabled = false;
        }
        // Keep confirmation visible after failure so the user can retry.
      } finally {
        confirmResetBtn.disabled = false;
        cancelResetBtn.disabled = false;
      }
    });
  }
}

// --- Configuration Management ---

/**
 * Handle save button click
 */
async function handleSave() {
  if (saveInProgress || testInProgress || resetInProgress) {
    return;
  }
  const config = getFormConfiguration();
  const validation = validateConfiguration(config);
  if (!validation.valid) {
    showStatus(validation.message, 'error');
    return;
  }

  saveInProgress = true;
  formRevision++;
  saveBtn.disabled = true;
  testBtn.disabled = true;
  clearBtn.disabled = true;
  let requestedOrigin = null;
  let previousOrigin = null;
  let saved = false;
  try {
    // Permission requests must remain in the click's user-activation path.
    requestedOrigin = await requestWebhookPermission(config);
    const previous = await ExtensionUtils.getStorageConfig();
    previousOrigin = configuredWebhookOrigin(previous);

    await saveConfiguration(config);
    saved = true;
    await revokeUnusedWebhookPermissions(requestedOrigin);

    // Users may edit the form during any of the awaited calls above. The saved
    // snapshot is authoritative; never mark newer, different values as saved.
    if (JSON.stringify(getFormConfiguration()) === JSON.stringify(config)) {
      connectionDirty = false;
      setConnectionState('Saved', 'saved');
      showStatus('Connection settings saved. Send a test to verify your Home Assistant automation.', 'success');
    } else {
      connectionDirty = true;
      setConnectionState('Unsaved changes', 'unsaved');
      showStatus('Previous connection saved, but newer changes are still unsaved. Save again.', 'error');
    }
  } catch (error) {
    if (!saved && requestedOrigin && requestedOrigin !== previousOrigin) {
      try {
        await revokeUnusedWebhookPermissions(previousOrigin);
      } catch (cleanupError) {
        setConnectionState('Unsaved changes', 'unsaved');
        showStatus('Save failed: ' + error.message + '. Could not revoke temporary access: ' +
          cleanupError.message, 'error');
        return;
      }
    }
    const newerEdits = JSON.stringify(getFormConfiguration()) !== JSON.stringify(config);
    setConnectionState(saved && !newerEdits ?
      'Saved · permissions need attention' : 'Unsaved changes', 'unsaved');
    const staleFieldsWarning = newerEdits ?
      ' Newer edits in the form are not saved.' : '';
    showStatus(saved ? 'Settings saved, but old permissions could not be removed: ' +
      error.message + '.' + staleFieldsWarning : 'Save failed: ' + error.message, 'error');
  } finally {
    saveInProgress = false;
    saveBtn.disabled = false;
    testBtn.disabled = false;
    // An already-open confirmation keeps Reset disabled until closed.
    clearBtn.disabled = !resetConfirmation.classList.contains('hidden');
  }
}

/**
 * Handle test button click
 */
async function handleTest() {
  if (saveInProgress || testInProgress || resetInProgress) {
    return;
  }
  const config = getFormConfiguration();
  const validation = validateConfiguration(config);
  if (!validation.valid) {
    showStatus(validation.message, 'error');
    return;
  }

  testInProgress = true;
  formRevision++;
  testBtn.disabled = true;
  saveBtn.disabled = true;
  clearBtn.disabled = true;
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
    testInProgress = false;
    testBtn.disabled = false;
    saveBtn.disabled = false;
    clearBtn.disabled = !resetConfirmation.classList.contains('hidden');
  }
}

/**
 * Handle clear config button click
 */
async function handleClearConfig() {
  if (resetInProgress || saveInProgress || testInProgress) {
    showStatus('Wait for the current operation before resetting settings.', 'error');
    return false;
  }
  resetInProgress = true;
  formRevision++;
  clearBtn.disabled = true;
  try {
    // Wait for BOTH storage areas, even when one removal fails. Promise.all
    // rejects early and could release the reset lock while the other removal
    // is still pending, deleting a later Save or retry.
    const removals = await Promise.allSettled([
      new Promise((resolve, reject) => chrome.storage.sync.remove(
        ['haHost', 'ssl', 'webhookId', 'userName', 'deviceName', 'sendProfiles', 'defaultProfileId', 'quickSendDefault'],
        () => chrome.runtime.lastError ? reject(new Error(chrome.runtime.lastError.message)) : resolve(),
      )),
      new Promise((resolve, reject) => chrome.storage.local.remove(
        ['webhookId', 'updateCheckEnabled', 'updateInfo', 'lastUpdateCheck'],
        () => chrome.runtime.lastError ? reject(new Error(chrome.runtime.lastError.message)) : resolve(),
      )),
    ]);
    const failedRemoval = removals.find((result) => result.status === 'rejected');
    if (failedRemoval) {
      throw failedRemoval.reason;
    }
    // Also clean old grants that are not associated with the currently saved host.
    await revokeUnusedWebhookPermissions(null);
    hostInput.value = '';
    sslToggle.checked = true;
    portInput.value = '443';
    webhookIdInput.value = '';
    // Never allow a replacement secret to inherit the revealed text field.
    webhookIdInput.type = 'password';
    webhookVisibilityBtn.textContent = 'Show';
    webhookVisibilityBtn.setAttribute('aria-label', 'Show webhook ID');
    webhookVisibilityBtn.setAttribute('aria-pressed', 'false');
    userInput.value = '';
    if (deviceInput) {
      deviceInput.value = '';
    }
    updateSslWarning();
    const updateToggle = document.getElementById('updateCheckToggle');
    savedUpdateCheckEnabled = false;
    if (updateToggle) {
      updateToggle.checked = false;
      updateToggle.disabled = false;
    }
    const updatePreferenceStatus = document.getElementById('updatePreferenceStatus');
    if (updatePreferenceStatus) {
      updatePreferenceStatus.textContent = '';
      updatePreferenceStatus.className = 'status hidden';
    }
    const updateStatus = document.getElementById('updateStatus');
    if (updateStatus) {
      updateStatus.replaceChildren();
      updateStatus.classList.add('hidden');
    }
    connectionDirty = false;
    setConnectionState('Not configured');
    // Prompt the profile editor to refresh immediately, independent of delayed
    // storage.onChanged notifications from other extension contexts.
    if (typeof window.dispatchEvent === 'function') {
      window.dispatchEvent(new Event('send-ha-settings-reset'));
    }
    resetStatus.textContent = '';
    resetStatus.className = 'status hidden';
    showStatus('Connection, profiles and update preferences cleared; webhook access revoked.', 'success');
    return true;
  } catch (error) {
    connectionDirty = true;
    setConnectionState('Reset incomplete', 'unsaved');
    const message = 'Reset incomplete: ' + error.message +
      '. Some settings may already be cleared. Retry or cancel and check your settings.';
    resetStatus.textContent = message;
    resetStatus.className = 'status error';
    showStatus(message, 'error');
    return false;
  } finally {
    resetInProgress = false;
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
  const hostname = hostInput.value.trim();
  const port = portInput.value.trim();
  const ssl = sslToggle.checked;
  const normalizedPort = /^[0-9]{1,5}$/.test(port) ? String(Number(port)) : port;
  return {
    hostname,
    port,
    host: hostname + (normalizedPort && normalizedPort !== defaultPort(ssl) ?
      ':' + normalizedPort : ''),
    ssl,
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
  if (!/^(?:[A-Za-z0-9.-]+|\[[A-Fa-f0-9:]+\])$/.test(config.hostname)) {
    return { valid: false, message: 'Enter a hostname or IP address without a port or URL path.' };
  }
  if (!/^[0-9]{1,5}$/.test(config.port) ||
      Number(config.port) < 1 || Number(config.port) > 65535) {
    return { valid: false, message: 'Port must be a number between 1 and 65535.' };
  }
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

