#!/usr/bin/env node
'use strict';

// Render real Options and Popup pages in headless Chrome. This catches
// intrinsic-width/overflow regressions that static CSS tests cannot see.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn, spawnSync } = require('node:child_process');
const { pathToFileURL } = require('node:url');

const root = path.resolve(__dirname, '..');
const output = path.join(root, 'dist', 'ui-preview');
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function findBrowser() {
  const candidates = [process.env.CHROME_BIN, 'google-chrome', 'google-chrome-stable',
    'chromium', 'chromium-browser'].filter(Boolean);
  for (const binary of candidates) {
    const result = spawnSync(binary, ['--version'], { encoding: 'utf8' });
    if (result.status === 0) {
      return binary;
    }
  }
  throw new Error('Chrome/Chromium is required for the rendered UI smoke check.');
}

async function launchChrome(binary, userDataDir) {
  const browser = spawn(binary, [
    '--headless=new', '--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu',
    '--no-first-run', '--no-default-browser-check', '--remote-debugging-port=0',
    '--user-data-dir=' + userDataDir, 'about:blank',
  ], { stdio: 'ignore' });
  const portFile = path.join(userDataDir, 'DevToolsActivePort');
  for (let attempt = 0; attempt < 200; attempt++) {
    if (fs.existsSync(portFile)) {
      const port = Number(fs.readFileSync(portFile, 'utf8').split('\n')[0]);
      if (Number.isInteger(port) && port > 0) {
        return { browser, port };
      }
    }
    if (browser.exitCode !== null) {
      throw new Error('Chrome exited before opening its debugging port.');
    }
    await sleep(100);
  }
  browser.kill();
  throw new Error('Timed out waiting for Chrome DevTools.');
}

async function openDevTools(port) {
  let pages;
  for (let attempt = 0; attempt < 50; attempt++) {
    try {
      pages = await (await fetch('http://127.0.0.1:' + port + '/json/list')).json();
      if (pages.some((entry) => entry.type === 'page')) {
        break;
      }
    } catch (_) {
      // The browser sometimes advertises its port before its HTTP endpoint is ready.
    }
    await sleep(100);
  }
  const page = pages?.find((entry) => entry.type === 'page');
  if (!page) {
    throw new Error('Could not find a browser page target.');
  }
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    ws.addEventListener('open', resolve, { once: true });
    ws.addEventListener('error', reject, { once: true });
  });
  let id = 0;
  const pending = new Map();
  ws.addEventListener('message', (event) => {
    const response = JSON.parse(event.data);
    if (!pending.has(response.id)) {
      return;
    }
    const request = pending.get(response.id);
    pending.delete(response.id);
    clearTimeout(request.timeout);
    if (response.error) {
      request.reject(new Error(response.error.message));
    } else {
      request.resolve(response.result);
    }
  });
  function send(method, params = {}) {
    return new Promise((resolve, reject) => {
      const nextId = ++id;
      const timeout = setTimeout(() => {
        pending.delete(nextId);
        reject(new Error('DevTools timed out: ' + method));
      }, 10000);
      pending.set(nextId, { resolve, reject, timeout });
      ws.send(JSON.stringify({ id: nextId, method, params }));
    });
  }
  return { send, close: () => ws.close() };
}

// This is a local visual test fixture, not a real user configuration.
function stubExtension() {
  // Load the action popup with quick-send enabled to catch missing extension
  // APIs that a dimensions-only screenshot would silently miss.
  const isPopup = window.location.pathname.endsWith('/popup.html');
  const sync = {
    haHost: 'home.example.test:8123', ssl: true, userName: 'Example user',
    deviceName: 'Desktop', defaultProfileId: 'default', quickSendDefault: isPopup,
    sendProfiles: [{ id: 'p_12345678', name: 'Download video', context: 'YTDL' }],
  };
  const local = { webhookId: 'sample-webhook-id', updateCheckEnabled: false };
  window.__testStorage = { sync, local };
  window.__failUpdateSave = false;
  const area = (data, areaName) => ({
    get(keys, callback) {
      const names = Array.isArray(keys) ? keys : [keys];
      callback(Object.fromEntries(names.filter((name) => Object.hasOwn(data, name))
        .map((name) => [name, data[name]])));
    },
    set(values, callback) {
      if (areaName === 'local' && Object.hasOwn(values, 'updateCheckEnabled') &&
          window.__failUpdateSave) {
        window.chrome.runtime.lastError = { message: 'Simulated storage failure' };
        callback?.();
        window.chrome.runtime.lastError = null;
        return;
      }
      Object.assign(data, values);
      callback?.();
    },
    remove(keys, callback) {
      for (const name of Array.isArray(keys) ? keys : [keys]) {
        delete data[name];
      }
      callback?.();
    },
  });
  Object.assign(window.chrome || (window.chrome = {}), {
    runtime: {
      lastError: null,
      getManifest: () => ({ version: '2026.10.3', version_name: '2026.10.3-Beta4' }),
      sendMessage: () => Promise.resolve({}),
      getURL: (file) => file,
      openOptionsPage() {},
    },
    tabs: {
      query(_options, callback) {
        callback([{ id: 7, url: 'https://example.com/page', title: 'Example page',
          favIconUrl: 'https://example.com/favicon.png' }]);
      },
    },
    scripting: {
      executeScript: async() => [{ result: {
        title: 'Example page', url: 'https://example.com/page',
        favicon: 'https://example.com/favicon.png',
        selected: '', timestamp: new Date().toISOString(), user_agent: 'UI smoke test',
      } }],
    },
    notifications: {
      create: async() => 'smoke-notification',
      update: async() => true,
    },
    storage: {
      sync: area(sync, 'sync'), local: area(local, 'local'),
      onChanged: { addListener() {} },
    },
    permissions: {
      contains: async() => true,
      request: async() => true,
      getAll: async() => ({ origins: [] }),
      remove: async() => true,
    },
  });
  window.__testPosts = [];
  window.fetch = async(url, options) => {
    window.__testPosts.push({ url: String(url), method: options?.method, body: options?.body });
    return { ok: true, status: 200 };
  };
}

async function evaluate(send, expression) {
  const result = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  if (result.exceptionDetails) {
    throw new Error('Browser evaluation error: ' + result.exceptionDetails.text);
  }
  return result.result?.value;
}

async function waitFor(send, predicate, name) {
  for (let attempt = 0; attempt < 100; attempt++) {
    if (await evaluate(send, predicate)) {
      return;
    }
    await sleep(100);
  }
  throw new Error('Timed out waiting for ' + name);
}

async function screenshot(send, name) {
  const image = await send('Page.captureScreenshot', {
    format: 'png', captureBeyondViewport: true, fromSurface: true,
  });
  fs.writeFileSync(path.join(output, name + '.png'), Buffer.from(image.data, 'base64'));
}

async function checkLayout(send, width, mode) {
  const data = await evaluate(send, `(() => {
    const selectors = ['.settings-shell', '.header-copy', '#connection', '#profiles', '#preferences',
      '#haHost', '#haPort', '#webhookId', '#defaultProfile', '#newProfileName',
      '#newProfileContext', '#quickSendDefault'];
    const rects = selectors.map((selector) => {
      const element = document.querySelector(selector);
      if (!element) return { selector, missing: true };
      const rect = element.getBoundingClientRect();
      return { selector, left: rect.left, right: rect.right, width: rect.width };
    });
    return {
      width: innerWidth,
      scrollWidth: document.documentElement.scrollWidth,
      profileCount: document.querySelectorAll('#profilesList .profile-list-row').length,
      status: document.getElementById('connectionState').textContent,
      rects,
    };
  })()`);
  assert.equal(data.width, width, mode + ': unexpected viewport width');
  assert.ok(data.scrollWidth <= width + 1,
    mode + ': horizontal document overflow ' + data.scrollWidth + '/' + width);
  assert.equal(data.profileCount, 2, mode + ': example profile rows did not render');
  assert.match(data.status, /Saved/, mode + ': example configuration did not load');
  for (const rect of data.rects) {
    assert.equal(rect.missing, undefined, mode + ': missing ' + rect.selector);
    assert.ok(rect.width >= 10 && rect.left >= -1 && rect.right <= width + 1,
      mode + ': clipped element ' + rect.selector + ' ' + JSON.stringify(rect));
  }
  const header = data.rects.find((rect) => rect.selector === '.header-copy');
  if (mode === 'Mobile') {
    assert.ok(header.width >= 240, 'Mobile title is squeezed by the version badge: ' + header.width);
  }
  console.log(mode + ': no horizontal overflow; settings and 2 profiles rendered at ' +
    width + 'px.');
}

async function main() {
  const browserBinary = findBrowser();
  fs.mkdirSync(output, { recursive: true });
  const profileDir = fs.mkdtempSync(path.join(os.tmpdir(), 'send-ha-visual-'));
  let browser;
  let client;
  try {
    const launched = await launchChrome(browserBinary, profileDir);
    browser = launched.browser;
    client = await openDevTools(launched.port);
    const { send } = client;
    await send('Page.enable');
    await send('Runtime.enable');
    await send('Page.addScriptToEvaluateOnNewDocument', {
      source: '(' + stubExtension.toString() + ')();',
    });

    await send('Emulation.setDeviceMetricsOverride', {
      width: 1280, height: 1000, deviceScaleFactor: 1, mobile: false,
    });
    await send('Page.navigate', {
      url: pathToFileURL(path.join(root, 'package', 'options.html')).href,
    });
    await waitFor(send, `document.readyState === 'complete' &&
      document.querySelectorAll('#profilesList .profile-list-row').length === 2`, 'Options');
    await checkLayout(send, 1280, 'Desktop');
    await screenshot(send, 'options-desktop');

    await send('Emulation.setDeviceMetricsOverride', {
      width: 390, height: 844, deviceScaleFactor: 1, mobile: true,
    });
    await sleep(200);
    await checkLayout(send, 390, 'Mobile');
    await screenshot(send, 'options-mobile');

    // The existing host:8123 setting must migrate into the separate port field.
    const migratedPort = await evaluate(send, `(() => ({
      hostname: document.getElementById('haHost').value,
      port: document.getElementById('haPort').value,
      secure: document.getElementById('sslToggle').checked,
    }))()`);
    assert.deepEqual(migratedPort,
      { hostname: 'home.example.test', port: '8123', secure: true },
      'Legacy host:port should migrate without changing its destination');

    const portSwitch = await evaluate(send, `(() => {
      const ssl = document.getElementById('sslToggle');
      const port = document.getElementById('haPort');
      ssl.checked = false;
      ssl.dispatchEvent(new Event('change', { bubbles: true }));
      const customHttp = port.value;
      ssl.checked = true;
      ssl.dispatchEvent(new Event('change', { bubbles: true }));
      port.value = '443';
      ssl.checked = false;
      ssl.dispatchEvent(new Event('change', { bubbles: true }));
      const httpDefault = port.value;
      ssl.checked = true;
      ssl.dispatchEvent(new Event('change', { bubbles: true }));
      const httpsDefault = port.value;
      port.value = '8123';
      port.dispatchEvent(new Event('input', { bubbles: true }));
      return { customHttp, httpDefault, httpsDefault };
    })()`);
    assert.deepEqual(portSwitch,
      { customHttp: '8123', httpDefault: '80', httpsDefault: '443' },
      'Default ports must follow HTTPS/HTTP while preserving custom ports');

    // Exercise actual Options event handlers inside Chromium, without a network.
    const shownType = await evaluate(send, `(() => {
      document.getElementById('toggleWebhookId').click();
      return document.getElementById('webhookId').type;
    })()`);
    assert.equal(shownType, 'text', 'Webhook reveal button did not work');
    const dirty = await evaluate(send, `(() => {
      const host = document.getElementById('haHost');
      host.value = 'new.example.test';
      host.dispatchEvent(new Event('input', { bubbles: true }));
      return document.getElementById('connectionState').textContent;
    })()`);
    assert.equal(dirty, 'Unsaved changes', 'Editing a host must show unsaved state');
    await evaluate(send, "document.getElementById('save').click()");
    await waitFor(send, "document.getElementById('connectionState').textContent.includes('Saved')",
      'connection save');
    await evaluate(send, "document.getElementById('test').click()");
    await waitFor(send, "document.getElementById('connectionState').textContent === 'Test accepted'",
      'test POST');
    const sent = await evaluate(send, "window.__testPosts");
    assert.equal(sent.length, 1, 'Test should send exactly one sample payload');
    assert.equal(sent[0].method, 'POST', 'Test must use POST');
    assert.match(sent[0].url, /^https:\/\/new\.example\.test:8123\/api\/webhook\//,
      'Test must retain the previously configured custom port');

    await evaluate(send, `(() => {
      document.querySelectorAll('#profilesList .profile-list-row')[1]
        .querySelector('.profile-row-actions button').click();
      const context = document.querySelector('.profile-edit-form input[id^="context-"]');
      context.value = 'Save';
      context.form.requestSubmit();
    })()`);
    await waitFor(send, `document.querySelectorAll('#profilesList .profile-context')[1]
      ?.textContent === 'Save'`, 'profile edit');
    await evaluate(send, `(() => {
      const select = document.getElementById('defaultProfile');
      select.value = 'p_12345678';
      select.dispatchEvent(new Event('change', { bubbles: true }));
    })()`);
    await waitFor(send, `document.querySelectorAll('#profilesList .profile-list-row')[1]
      ?.textContent.includes('Default')`, 'default profile selection');
    await evaluate(send, `(() => {
      const quick = document.getElementById('quickSendDefault');
      quick.checked = true;
      quick.dispatchEvent(new Event('change', { bubbles: true }));
    })()`);
    await waitFor(send, `document.getElementById('preferenceStatus').textContent
      .includes('Immediate sending enabled')`, 'quick-send preference');

    // Advanced update-check option starts disabled, is opt-in, and displays
    // both successful saves and storage failures beside the control.
    await evaluate(send, `(() => {
      const details = document.querySelector('.advanced-settings');
      details.open = true;
      document.getElementById('updateCheckToggle').click();
    })()`);
    await waitFor(send, `document.getElementById('updatePreferenceStatus')
      .textContent.includes('enabled')`, 'update preference save');
    const updateSaved = await evaluate(send, `(() => ({
      checked: document.getElementById('updateCheckToggle').checked,
      persisted: window.__testStorage.local.updateCheckEnabled,
    }))()`);
    assert.deepEqual(updateSaved, { checked: true, persisted: true },
      'Enabling update checks must save to local storage');

    await evaluate(send, `(() => {
      window.__failUpdateSave = true;
      document.getElementById('updateCheckToggle').click();
    })()`);
    await waitFor(send, `document.getElementById('updatePreferenceStatus')
      .textContent.includes('Simulated storage failure')`, 'update preference failure');
    const updateFailed = await evaluate(send, `(() => ({
      checked: document.getElementById('updateCheckToggle').checked,
      persisted: window.__testStorage.local.updateCheckEnabled,
      message: document.getElementById('updatePreferenceStatus').textContent,
    }))()`);
    assert.equal(updateFailed.checked, true, 'Failed save must restore checked state');
    assert.equal(updateFailed.persisted, true, 'Failed save must preserve stored preference');
    assert.match(updateFailed.message, /Could not save update preference/);
    await evaluate(send, "window.__failUpdateSave = false");

    const resetConfirmation = await evaluate(send, `(() => {
      document.getElementById('clearConfig').click();
      const shown = !document.getElementById('resetConfirmation').classList.contains('hidden');
      document.getElementById('cancelClearConfig').click();
      return { shown, cancelled: document.getElementById('resetConfirmation')
        .classList.contains('hidden') };
    })()`);
    assert.ok(resetConfirmation.shown && resetConfirmation.cancelled,
      'Reset must require confirmation and support cancellation');
    await evaluate(send, `(() => {
      document.getElementById('clearConfig').click();
      document.getElementById('confirmClearConfig').click();
    })()`);
    await waitFor(send, `document.getElementById('connectionState').textContent ===
      'Not configured'`, 'confirmed reset');
    await waitFor(send, `document.querySelectorAll('#profilesList .profile-list-row').length === 1`,
      'profile list after reset');
    const resetState = await evaluate(send, `(() => ({
      host: document.getElementById('haHost').value,
      webhook: document.getElementById('webhookId').value,
      port: document.getElementById('haPort').value,
      updates: document.getElementById('updateCheckToggle').checked,
      profiles: document.querySelectorAll('#profilesList .profile-list-row').length,
      savedHost: window.__testStorage.sync.haHost || '',
      savedWebhook: window.__testStorage.local.webhookId || '',
      savedUpdates: window.__testStorage.local.updateCheckEnabled === true,
    }))()`);
    assert.deepEqual(resetState, {
      host: '', webhook: '', port: '443', updates: false, profiles: 1,
      savedHost: '', savedWebhook: '', savedUpdates: false,
    }, 'Confirmed reset did not clear connection, profiles and preferences');
    console.log('Options interactions: reveal, dirty/save/test, profile edit, preferences and reset confirmation passed.');

    await send('Emulation.setDeviceMetricsOverride', {
      width: 400, height: 640, deviceScaleFactor: 1, mobile: false,
    });
    await send('Page.navigate', {
      url: pathToFileURL(path.join(root, 'package', 'popup.html')).href,
    });
    await waitFor(send, `document.readyState === 'complete' &&
      document.querySelectorAll('#profileSelect option').length === 2`, 'Popup');
    await waitFor(send, `document.getElementById('popupMsg').textContent
      .startsWith('Link sent to Home Assistant!')`, 'quick-send popup success');
    const popupPayload = await evaluate(send, `(() => ({
      requests: window.__testPosts.length,
      context: JSON.parse(window.__testPosts[0].body).context,
      hasPreview: Boolean(document.querySelector('.preview')),
      hasError: document.getElementById('popupMsg').textContent.startsWith('Error:'),
    }))()`);
    assert.deepEqual(popupPayload,
      { requests: 1, context: 'Default', hasPreview: true, hasError: false },
      'Quick-send popup must complete instead of showing an error');
    const popup = await evaluate(send, `(() => ({
      documentWidth: document.documentElement.scrollWidth,
      bodyWidth: document.body.getBoundingClientRect().width,
      sendWidth: document.getElementById('sendBtn').getBoundingClientRect().width,
      selectWidth: document.getElementById('profileSelect').getBoundingClientRect().width,
    }))()`);
    assert.equal(popup.bodyWidth, 376, 'Popup intrinsic width changed');
    assert.ok(popup.documentWidth <= 400 && popup.sendWidth >= 300 && popup.selectWidth >= 300,
      'Popup controls overflow or collapse: ' + JSON.stringify(popup));
    await screenshot(send, 'popup');
    console.log('Popup: stable 376px body, full-width profile and Send controls.');
  } finally {
    client?.close();
    if (browser && browser.exitCode === null) {
      browser.kill();
      await Promise.race([
        new Promise((resolve) => browser.once('exit', resolve)),
        sleep(1500),
      ]);
    }
    try {
      fs.rmSync(profileDir, { recursive: true, force: true, maxRetries: 8, retryDelay: 100 });
    } catch (error) {
      // Directory cleanup is not a UI test failure; the hosted runner is ephemeral.
      console.warn('Temporary Chrome directory cleanup failed: ' + error.message);
    }
  }
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
