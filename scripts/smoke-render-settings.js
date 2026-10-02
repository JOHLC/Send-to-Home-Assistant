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
  const sync = {
    haHost: 'home.example.test:8123', ssl: true, userName: 'Example user',
    deviceName: 'Desktop', defaultProfileId: 'default', quickSendDefault: false,
    sendProfiles: [{ id: 'p_12345678', name: 'Download video', context: 'YTDL' }],
  };
  const local = { webhookId: 'sample-webhook-id', updateCheckEnabled: false };
  const area = (data) => ({
    get(keys, callback) {
      const names = Array.isArray(keys) ? keys : [keys];
      callback(Object.fromEntries(names.filter((name) => Object.hasOwn(data, name))
        .map((name) => [name, data[name]])));
    },
    set(values, callback) { Object.assign(data, values); callback?.(); },
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
    },
    storage: {
      sync: area(sync), local: area(local),
      onChanged: { addListener() {} },
    },
    permissions: {
      request: async() => true,
      getAll: async() => ({ origins: [] }),
      remove: async() => true,
    },
  });
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
    const selectors = ['.settings-shell', '#connection', '#profiles', '#preferences',
      '#haHost', '#webhookId', '#defaultProfile', '#newProfileName',
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

    await send('Emulation.setDeviceMetricsOverride', {
      width: 400, height: 640, deviceScaleFactor: 1, mobile: false,
    });
    await send('Page.navigate', {
      url: pathToFileURL(path.join(root, 'package', 'popup.html')).href,
    });
    await waitFor(send, `document.readyState === 'complete' &&
      document.querySelectorAll('#profileSelect option').length === 2`, 'Popup');
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
    browser?.kill();
    fs.rmSync(profileDir, { recursive: true, force: true, maxRetries: 3 });
  }
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
