'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '../package/utils.js'), 'utf8');

function harness({ legacy = false, allowed = true, extractionFails = false, httpStatus = 200 } = {}) {
  const sync = { haHost: 'ha.example.test:8123', ssl: true, userName: 'User', deviceName: 'Laptop' };
  const local = {};
  if (legacy) {
    sync.webhookId = 'legacy-secret';
  } else {
    local.webhookId = 'local-secret';
  }
  const calls = [];
  const storage = (data) => ({
    get(keys, cb) {
      const list = Array.isArray(keys) ? keys : [keys];
      cb(Object.fromEntries(list.filter((key) => Object.hasOwn(data, key)).map((key) => [key, data[key]])));
    },
    set(values, cb) {
      Object.assign(data, values);
      cb?.();
    },
    remove(keys, cb) {
      for (const key of Array.isArray(keys) ? keys : [keys]) {
        delete data[key];
      }
      cb?.();
    },
  });
  const chrome = {
    runtime: { getURL: (file) => 'chrome-extension://test/' + file },
    storage: { sync: storage(sync), local: storage(local) },
    permissions: { contains: async () => allowed },
    notifications: { create: async () => 'notification', update: async () => true },
    scripting: {
      executeScript: async ({ func }) => {
        if (extractionFails) {
          throw new Error('Cannot inject into this document');
        }
        return [{ result: vm.runInNewContext('(' + func.toString() + ')()', pageContext()) }];
      },
    },
  };
  const sandbox = {
    chrome, self: {}, console: { warn() {}, error() {} }, navigator: { userAgent: 'Test UA' },
    URL, AbortController, setTimeout, clearTimeout,
    fetch: async (url, options) => {
      calls.push({ url, options });
      return { ok: httpStatus < 400, status: httpStatus };
    },
  };
  vm.runInNewContext(source, sandbox, { filename: 'utils.js' });
  return { utils: sandbox.self.ExtensionUtils, sync, local, calls, chrome };
}

function pageContext() {
  const base = 'https://www.example.com/article';
  return {
    URL,
    document: {
      title: 'Example Article',
      baseURI: base,
      querySelectorAll: () => [
        { getAttribute: (key) => ({ href: 'javascript:alert(1)', type: 'image/png' })[key] || '' },
        { getAttribute: (key) => ({ href: '/icon.svg', type: 'image/svg+xml' })[key] || '' },
        { getAttribute: (key) => ({ href: '/logo.png', type: 'image/png' })[key] || '' },
      ],
    },
    location: { origin: 'https://www.example.com', protocol: 'https:' },
    window: { location: { href: base }, getSelection: () => ({ toString: () => 'selected text' }) },
    navigator: { userAgent: 'Test UA' },
  };
}

test('injected page collector has no closure dependencies and rejects unsafe favicons', () => {
  const { utils } = harness();
  const data = vm.runInNewContext('(' + utils.createPageInfo.toString() + ')()', pageContext());
  assert.equal(data.title, 'Example Article');
  assert.equal(data.url, 'https://www.example.com/article');
  assert.equal(data.selected, 'selected text');
  assert.equal(data.favicon, 'https://www.example.com/logo.png');
  assert.match(data.timestamp, /^\\d{4}-/);
});

test('webhook URLs validate the host and encode supported IDs', () => {
  const { utils } = harness();
  assert.equal(utils.createWebhookUrl('ha.example.test:8123', true, 'ab_cd-42'),
    'https://ha.example.test:8123/api/webhook/ab_cd-42');
  for (const host of ['https://evil.example', 'ha.example/path', 'person@evil.example', 'ha.example?x=1', 'ha.example:99999']) {
    assert.throws(() => utils.createWebhookUrl(host, true, 'secret'));
  }
  assert.throws(() => utils.createWebhookUrl('ha.example', true, 'a/b'));
});

test('webhook secret is migrated once from sync storage to local storage', async () => {
  const { utils, local, sync } = harness({ legacy: true });
  const config = await utils.getStorageConfig();
  assert.equal(config.webhookId, 'legacy-secret');
  assert.equal(local.webhookId, 'legacy-secret');
  assert.equal(Object.hasOwn(sync, 'webhookId'), false);
});

test('rejects internal and unsupported URL schemes', () => {
  const { utils } = harness();
  for (const url of ['chrome://settings', 'edge://extensions', 'javascript:alert(1)', 'data:text/html,test', 'about:blank', '']) {
    assert.equal(utils.isRestrictedPage(url), true);
  }
  assert.equal(utils.isRestrictedPage('https://www.example.com/'), false);
  assert.equal(utils.isRestrictedPage('file:///C:/test.html'), false);
});

test('manual send posts serialized page data to the configured endpoint', async () => {
  const { utils, calls } = harness();
  const result = await utils.sendToHomeAssistant({
    tab: { id: 10, url: 'https://www.example.com/article', title: 'Example Article' },
    showNotifications: false,
  });
  assert.equal(result.status, 'sent');
  assert.equal(calls.length, 1);
  assert.equal(calls[0].options.method, 'POST');
  assert.equal(calls[0].url, 'https://ha.example.test:8123/api/webhook/local-secret');
  assert.equal(JSON.parse(calls[0].options.body).selected, 'selected text');
  assert.equal(JSON.parse(calls[0].options.body).user, 'User');
});

test('injection failure falls back to tab metadata for manual sends', async () => {
  const { utils, calls } = harness({ extractionFails: true });
  const result = await utils.sendToHomeAssistant({
    tab: { id: 11, url: 'https://fallback.example/path', title: 'Fallback', favIconUrl: 'https://fallback.example/icon.png' },
    showNotifications: false,
  });
  assert.equal(result.status, 'sent');
  assert.equal(JSON.parse(calls[0].options.body).title, 'Fallback');
  assert.equal(JSON.parse(calls[0].options.body).selected, '');
});

test('no webhook request occurs without granted destination site access', async () => {
  const { utils, calls } = harness({ allowed: false });
  const result = await utils.sendToHomeAssistant({
    tab: { id: 12, url: 'https://www.example.com/' },
    showNotifications: false,
  });
  assert.equal(result.status, 'error');
  assert.match(result.error, /site access/i);
  assert.equal(calls.length, 0);
});

test('HTTP errors are reported rather than treating rejected POSTs as delivered', async () => {
  const { utils } = harness({ httpStatus: 500 });
  const result = await utils.sendToHomeAssistant({
    tab: { id: 13, url: 'https://www.example.com/' },
    showNotifications: false,
  });
  assert.equal(result.status, 'error');
  assert.match(result.error, /HTTP 500/);
});
