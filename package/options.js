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
const newMenuItemInput = document.getElementById('newMenuItemName');
const addMenuItemBtn = document.getElementById('addMenuItem');
const contextMenuItemsDiv = document.getElementById('contextMenuItems');

// --- Context Menu Items Management ---

let contextMenuItems = [{ id: 'default', name: 'Default' }]; // Default item always present

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
  loadContextMenuItems();
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
      : true; // default to enabled
  });

  // Handle toggle changes
  updateCheckToggle.addEventListener('change', () => {
    chrome.storage.local.set({ updateCheckEnabled: updateCheckToggle.checked });
    
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
  if (!updateDiv || !chrome.storage || !chrome.storage.local) {
    return;
  }

  chrome.storage.local.get(['updateInfo', 'updateCheckEnabled'], (data) => {
    const info = data.updateInfo;
    const enabled = typeof data.updateCheckEnabled === 'boolean' 
      ? data.updateCheckEnabled 
      : true;

    // Hide if disabled
    if (!enabled) {
      updateDiv.classList.add('hidden');
      return;
    }

    updateDiv.classList.remove('hidden');

    // Show update information
    if (info && info.isNewer && info.latest && info.html_url) {
      updateDiv.innerHTML = `
        <div class="update-available">
          New version available: 
          <a href="${escapeHTML(info.html_url)}" target="_blank" rel="noopener noreferrer" class="link-blue">
            v${escapeHTML(info.latest)}
          </a>
        </div>
      `;
    } else if (info && !info.isNewer) {
      updateDiv.innerHTML = '<div class="update-latest">You are using the latest version.</div>';
    } else {
      updateDiv.innerHTML = '';
    }
  });
}
/**
 * Load saved configuration from storage
 */
function loadSavedConfiguration() {
  chrome.storage.sync.get(['haHost', 'ssl', 'webhookId', 'userName', 'deviceName'], (result) => {
    if (result.haHost) {
      hostInput.value = result.haHost;
    }
    if (typeof result.ssl === 'boolean') {
      sslToggle.checked = result.ssl;
    }
    if (result.webhookId) {
      webhookIdInput.value = result.webhookId;
    }
    if (result.userName) {
      userInput.value = result.userName;
    }
    if (result.deviceName && deviceInput) {
      deviceInput.value = result.deviceName;
    }
  });
}

/**
 * Load context menu items from storage
 */
function loadContextMenuItems() {
  chrome.storage.sync.get(['contextMenuItems'], (result) => {
    if (result.contextMenuItems && Array.isArray(result.contextMenuItems)) {
      contextMenuItems = result.contextMenuItems;
    }
    renderContextMenuItems();
  });
}

/**
 * Render context menu items in the UI
 */
function renderContextMenuItems() {
  contextMenuItemsDiv.innerHTML = '';
  
  contextMenuItems.forEach((item, index) => {
    const itemDiv = document.createElement('div');
    itemDiv.className = 'menu-item';
    
    const nameSpan = document.createElement('span');
    nameSpan.className = 'menu-item-name';
    nameSpan.textContent = item.name;
    
    // Add "Default" indicator for the default item
    if (item.id === 'default') {
      const defaultSpan = document.createElement('span');
      defaultSpan.className = 'menu-item-default';
      defaultSpan.textContent = '(Default)';
      nameSpan.appendChild(defaultSpan);
    }
    
    itemDiv.appendChild(nameSpan);
    
    // Only allow removing non-default items
    if (item.id !== 'default') {
      const removeBtn = document.createElement('button');
      removeBtn.className = 'menu-item-remove';
      removeBtn.textContent = 'Remove';
      removeBtn.addEventListener('click', () => removeContextMenuItem(index));
      itemDiv.appendChild(removeBtn);
    }
    
    contextMenuItemsDiv.appendChild(itemDiv);
  });
}

/**
 * Add a new context menu item
 */
function addContextMenuItem() {
  const name = newMenuItemInput.value.trim();
  
  if (!name) {
    showStatus('Please enter a menu item name.', 'error');
    return;
  }
  
  if (name.length > 32) {
    showStatus('Menu item name cannot exceed 32 characters.', 'error');
    return;
  }
  
  // Check for duplicate names
  if (contextMenuItems.some(item => item.name.toLowerCase() === name.toLowerCase())) {
    showStatus('A menu item with this name already exists.', 'error');
    return;
  }
  
  // Generate unique ID
  const id = name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');

  // Validate ID is not empty
  if (!id) {
    showStatus('Menu item name must contain at least one letter or number.', 'error');
    return;
  }

  // Check for duplicate IDs
  if (contextMenuItems.some(item => item.id === id)) {
    showStatus('A menu item with a conflicting ID already exists. Please choose a different name.', 'error');
    return;
  }
  contextMenuItems.push({ id, name });
  
  // Save to storage
  chrome.storage.sync.set({ contextMenuItems }, () => {
    renderContextMenuItems();
    newMenuItemInput.value = '';
    showStatus('Menu item added! Click "Save" to apply changes.', 'success');
    setTimeout(clearStatus, 2000);
  });
}

/**
 * Remove a context menu item
 * @param {number} index - Index of the item to remove
 */
function removeContextMenuItem(index) {
  if (index < 0 || index >= contextMenuItems.length) {
    return;
  }
  
  // Don't allow removing the default item
  if (contextMenuItems[index].id === 'default') {
    showStatus('Cannot remove the default menu item.', 'error');
    return;
  }
  
  contextMenuItems.splice(index, 1);
  
  // Save to storage
  chrome.storage.sync.set({ contextMenuItems }, () => {
    renderContextMenuItems();
    showStatus('Menu item removed! Changes will be reflected immediately.', 'success');
    setTimeout(clearStatus, 2000);
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
  
  // Clear config button handler
  if (clearBtn) {
    clearBtn.addEventListener('click', handleClearConfig);
  }
  
  // Add menu item button handler
  if (addMenuItemBtn) {
    addMenuItemBtn.addEventListener('click', addContextMenuItem);
  }
  
  // Allow adding menu item by pressing Enter
  if (newMenuItemInput) {
    newMenuItemInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        addContextMenuItem();
      }
    });
  }
}

// --- Configuration Management ---

/**
 * Handle save button click
 */
function handleSave() {
  const config = getFormConfiguration();
  
  // Validate configuration
  const validation = validateConfiguration(config);
  if (!validation.valid) {
    showStatus(validation.message, 'error');
    return;
  }

  // Show validating status
  showStatus('Validating webhook...', '');

  // Test webhook accessibility before saving
  testWebhookAccessibility(config)
    .then(() => {
      // Save configuration
      return saveConfiguration(config);
    })
    .then(() => {
      showStatus('Saved!', 'success');
      setTimeout(clearStatus, 2000);
    })
    .catch((error) => {
      console.error('Save failed:', error);
      showStatus(escapeHTML(error.message), 'error');
    });
}

/**
 * Handle test button click
 */
function handleTest() {
  const config = getFormConfiguration();
  
  // Validate configuration
  const validation = validateConfiguration(config);
  if (!validation.valid) {
    showStatus(validation.message, 'error');
    return;
  }

  showStatus('Testing...', '');

  // Perform test
  performWebhookTest(config)
    .then(() => {
      showStatus('Test sent! (Check Home Assistant logs to confirm the webhook was triggered. Home Assistant always returns 200 even for invalid webhooks.)', 'success');
    })
    .catch((error) => {
      console.error('Test failed:', error);
      showStatus(escapeHTML(error.message), 'error');
    });
}

/**
 * Handle clear config button click
 */
function handleClearConfig() {
  chrome.storage.sync.remove(['haHost', 'ssl', 'webhookId', 'userName', 'deviceName', 'contextMenuItems'], () => {
    // Clear form fields
    hostInput.value = '';
    sslToggle.checked = true;
    webhookIdInput.value = '';
    userInput.value = '';
    if (deviceInput) {
      deviceInput.value = '';
    }
    
    // Reset context menu items to default
    contextMenuItems = [{ id: 'default', name: 'Default' }];
    renderContextMenuItems();
    
    showStatus('Config cleared!', 'success');
    setTimeout(clearStatus, 2000);
  });
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
  warn.style.cssText = `
    color: #ffb347;
    background: rgba(255,180,71,0.08);
    border: 1px solid #ffb347;
    border-radius: 8px;
    padding: 0.7em 1em;
    margin: 0.7em 0 1em 0;
    font-size: 1em;
  `;
  
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
  if (!config.host) {
    return {
      valid: false,
      message: 'Please enter your Home Assistant hostname or IP.',
    };
  }

  if (!config.webhookId) {
    return {
      valid: false,
      message: 'Please enter your Home Assistant webhook ID.',
    };
  }

  if (config.device && !/^[\w\s-]{1,32}$/.test(config.device)) {
    return {
      valid: false,
      message: 'Device name can only contain letters, numbers, spaces, dashes, and underscores (max 32 chars).',
    };
  }

  if (config.user && config.user.length > 32) {
    return {
      valid: false,
      message: 'User name cannot exceed 32 characters.',
    };
  }

  return { valid: true };
}

/**
 * Save configuration to storage
 * @param {object} config - Configuration to save
 * @returns {Promise} Storage save promise
 */
function saveConfiguration(config) {
  return new Promise((resolve) => {
    chrome.storage.sync.set({
      haHost: config.host,
      ssl: config.ssl,
      webhookId: config.webhookId,
      userName: config.user,
      deviceName: config.device,
    }, resolve);
  });
}

// --- Webhook Testing ---

/**
 * Test webhook accessibility (HEAD request)
 * @param {object} config - Configuration object
 * @returns {Promise} Test result promise
 */
function testWebhookAccessibility(config) {
  const url = `${config.ssl ? 'https' : 'http'}://${config.host}/api/webhook/${config.webhookId}`;
  
  return fetch(url, { method: 'HEAD', mode: 'cors' })
    .then((response) => {
      if (!response.ok) {
        let message = `Webhook not reachable: HTTP ${response.status}`;
        
        if (response.status === 404) {
          message += ' (Webhook not found. Check your ID and host.)';
        } else if (response.status === 401 || response.status === 403) {
          message += ' (Unauthorized. Check your Home Assistant token or permissions.)';
        }
        
        throw new Error(message);
      }
      return response;
    })
    .catch((error) => {
      if (error.message.includes('HTTP')) {
        throw error; // Re-throw HTTP errors as-is
      }
      
      let message = 'Could not reach the webhook URL. Please check your network or URL.';
      if (error.message) {
        message += ` (${escapeHTML(error.message)})`;
      }
      throw new Error(message);
    });
}

/**
 * Perform webhook test with actual payload
 * @param {object} config - Configuration object
 * @returns {Promise} Test result promise
 */
function performWebhookTest(config) {
  const url = `${config.ssl ? 'https' : 'http'}://${config.host}/api/webhook/${config.webhookId}`;
  
  const payload = createTestPayload(config);
  
  return fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
    .then((response) => {
      if (!response.ok) {
        return response.text().then((text) => {
          let message = `Test failed: HTTP ${response.status}`;
        
          if (text) {
            message += `: ${escapeHTML(text)}`;
          } else if (response.status === 404) {
            message += ' (Webhook not found. Check your ID and host.)';
          } else if (response.status === 401 || response.status === 403) {
            message += ' (Unauthorized. Check your Home Assistant token or permissions.)';
          }
        
          throw new Error(message);
        });
      }
      return response;
    })
    .catch((error) => {
      if (error.message.includes('HTTP')) {
        throw error; // Re-throw HTTP errors as-is
      }
    
      let message = 'Test failed: Could not reach the webhook URL. Please check your network or URL.';
      if (error.message) {
        message += ` (${escapeHTML(error.message)})`;
      }
      throw new Error(message);
    });
}

/**
 * Create test payload for webhook testing
 * @param {object} config - Configuration object
 * @returns {object} Test payload
 */
function createTestPayload(config) {
  const payload = {
    title: 'Test from extension',
    url: window.location.origin,
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

/**
 * Escape HTML to prevent XSS
 * @param {string} str - String to escape
 * @returns {string} Escaped string
 */
function escapeHTML(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
