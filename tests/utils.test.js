'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '../package/utils.js'), 'utf8');
const profileSource = fs.readFileSync(path.join(__dirname, '../package/profiles.js'), 'utf8');

function harness({ legacy = false, allowed = true, extractionFails = false,
  httpStatus = 200, profileConfig = null } = {}) {
  const sync = { haHost: 'ha.example.test:8123', ssl: true, userName: 'User', deviceName: 'Laptop' };
  if (profileConfig) {
    Object.assign(sync, profileConfig);
  }
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
  vm.runInNewContext(profileSource, sandbox, { filename: 'profiles.js' });
  sandbox.ExtensionProfiles = sandbox.self.ExtensionProfiles;
  vm.runInNewContext(source, sandbox, { filename: 'utils.js' });
  return { utils: sandbox.self.ExtensionUtils, profiles: sandbox.ExtensionProfiles, sync, local, calls, chrome };
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
  assert.ok(Number.isFinite(Date.parse(data.timestamp)));
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

test('legacy synced webhook remains readable without side effects until explicitly saved', async () => {
  const { utils, local, sync } = harness({ legacy: true });
  const config = await utils.getStorageConfig();
  assert.equal(config.webhookId, 'legacy-secret');
  assert.equal(local.webhookId, undefined);
  assert.equal(sync.webhookId, 'legacy-secret');
  const again = await utils.getStorageConfig();
  assert.equal(again.webhookId, 'legacy-secret');
  assert.equal(local.webhookId, undefined);
});

test('local webhook ID takes precedence over a legacy synchronized ID', async () => {
  const { utils, local, sync } = harness({ legacy: true });
  local.webhookId = 'replacement-secret';
  const config = await utils.getStorageConfig();
  assert.equal(config.webhookId, 'replacement-secret');
  assert.equal(local.webhookId, 'replacement-secret');
  assert.equal(sync.webhookId, 'legacy-secret');
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
  assert.equal(JSON.parse(calls[0].options.body).context, 'Default');
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

test('configured default profile routes ordinary sends without an override', async() => {
  const custom = { id: 'p_12345678', name: 'Download video', context: 'YTDL' };
  const { utils, calls } = harness({ profileConfig: {
    sendProfiles: [custom], defaultProfileId: custom.id,
  } });
  const result = await utils.sendToHomeAssistant({
    tab: { id: 20, url: 'https://www.example.com/article' },
    showNotifications: false,
  });
  assert.equal(result.status, 'sent');
  assert.equal(JSON.parse(calls[0].options.body).context, 'YTDL');
});

test('explicit custom profile overrides default for right-click links and selections', async() => {
  const custom = { id: 'p_12345678', name: 'Save it', context: 'Save' };
  const { utils, calls } = harness({ profileConfig: { sendProfiles: [custom] } });
  const result = await utils.sendToHomeAssistant({
    tab: { id: 21, url: 'https://www.example.com/article', title: 'Example' },
    contextInfo: { linkUrl: 'https://destination.example/item', selectionText: 'interesting' },
    profileId: custom.id,
    showNotifications: false,
  });
  assert.equal(result.status, 'sent');
  const payload = JSON.parse(calls[0].options.body);
  assert.equal(payload.context, 'Save');
  assert.equal(payload.url, 'https://destination.example/item');
  assert.equal(payload.selected, 'interesting');
});

test('deleted or unknown profile is never silently replaced by Default', async() => {
  const { utils, calls } = harness();
  const result = await utils.sendToHomeAssistant({
    tab: { id: 22, url: 'https://www.example.com/' },
    profileId: 'p_unknown1234',
    showNotifications: false,
  });
  assert.equal(result.status, 'error');
  assert.match(result.error, /no longer exists/);
  assert.equal(calls.length, 0);
});

test('profile validation prevents duplicate contexts, IDs and markup-bearing contexts', () => {
  const { profiles } = harness();
  const first = { id: 'p_12345678', name: 'YTDL', context: 'YTDL' };
  const other = { id: 'p_87654321', name: 'Save', context: 'Save' };
  assert.deepEqual([...profiles.validateProfiles([first, other])].map((p) => p.context), ['YTDL', 'Save']);
  assert.throws(() => profiles.validateProfiles([first, { ...other, context: 'ytdl' }]), /unique/);
  assert.throws(() => profiles.validateProfiles([first, { ...other, name: 'ytdl' }]), /unique/);
  assert.throws(() => profiles.validateProfiles([first, { ...other, id: first.id }]), /unique/);
  assert.throws(() => profiles.validateProfiles([{ ...first, context: '<script>' }]), /Contexts/);
  assert.throws(() => profiles.validateProfiles(Array.from({ length: 16 }, (_, i) => ({
    id: 'p_12345678' + i, name: 'p' + i, context: 'c' + i,
  }))), /15/);
});
