'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const optionsSource = fs.readFileSync(path.join(__dirname, '../package/options.js'), 'utf8');
const utilsSource = fs.readFileSync(path.join(__dirname, '../package/utils.js'), 'utf8');

function harness({ savedHost = 'old.example.test', formHost = 'new.example.test',
  existingGrants = [], status = 200, failSave = false } = {}) {
  const local = { webhookId: 'secret' };
  const sync = { haHost: savedHost, ssl: true, userName: '', deviceName: '' };
  const previousOrigin = 'https://' + savedHost + '/*';
  const newOrigin = 'https://' + formHost + '/*';
  const granted = new Set([previousOrigin, ...existingGrants]);
  const permanent = 'https://api.github.com/*';
  const removed = [];
  const requested = [];
  const requests = [];

  const storage = (data, area) => ({
    get(keys, callback) {
      const names = Array.isArray(keys) ? keys : [keys];
      callback(Object.fromEntries(names.filter((name) => Object.hasOwn(data, name))
        .map((name) => [name, data[name]])));
    },
    set(values, callback) {
      if (area === 'sync' && failSave) {
        chrome.runtime.lastError = { message: 'Sync storage unavailable' };
        callback();
        chrome.runtime.lastError = null;
        return;
      }
      Object.assign(data, values);
      callback();
    },
    remove(keys, callback) {
      for (const key of Array.isArray(keys) ? keys : [keys]) {
        delete data[key];
      }
      callback();
    },
  });

  const elements = new Map();
  for (const id of ['haHost', 'sslToggle', 'webhookId', 'userName', 'deviceName',
    'status', 'save', 'test', 'clearConfig', 'haPort']) {
    elements.set(id, { value: '', checked: true, disabled: false, className: '', textContent: '',
      addEventListener() {} });
  }
  elements.get('haHost').value = formHost;
  elements.get('haPort').value = '443';
  elements.get('webhookId').value = 'secret';
  elements.get('sslToggle').checked = true;

  const chrome = {
    runtime: { lastError: null, getManifest: () => ({ host_permissions: [permanent] }),
      openOptionsPage() {} },
    storage: { sync: storage(sync, 'sync'), local: storage(local, 'local') },
    permissions: {
      request({ origins }) {
        requested.push(...origins);
        origins.forEach((origin) => granted.add(origin));
        return Promise.resolve(true);
      },
      getAll: async() => ({ origins: [permanent, ...granted] }),
      remove: async({ origins }) => {
        removed.push(...origins);
        origins.forEach((origin) => granted.delete(origin));
        return true;
      },
    },
  };
  const sandbox = {
    chrome, URL, AbortController, navigator: { userAgent: 'test' },
    console: { error() {}, warn() {} },
    setTimeout: () => 1, clearTimeout() {},
    fetch: async(url, opts) => {
      requests.push({ url, opts });
      return { status, ok: status >= 200 && status < 300 };
    },
    document: {
      addEventListener() {},
      getElementById(id) { return elements.get(id) || null; },
    },
  };
  sandbox.window = sandbox;
  const context = vm.createContext(sandbox);
  vm.runInContext(utilsSource, context, { filename: 'utils.js' });
  vm.runInContext(optionsSource, context, { filename: 'options.js' });

  return {
    save: () => context.handleSave(),
    tryHost: () => context.handleTest(),
    clear: () => context.handleClearConfig(),
    sync, local, granted, removed, requested, requests,
    previousOrigin, newOrigin, permanent,
    statusElement: elements.get('status'),
    elements, context,
  };
}

test('saving host B revokes old host A and unrelated grants but keeps required GitHub access', async() => {
  const h = harness({ existingGrants: ['https://obsolete.example/*'] });
  await h.save();
  assert.equal(h.sync.haHost, 'new.example.test');
  assert.deepEqual([...h.granted], [h.newOrigin]);
  assert.deepEqual(new Set(h.removed),
    new Set([h.previousOrigin, 'https://obsolete.example/*']));
  assert.equal(h.requested[0], h.newOrigin);
  assert.equal(h.statusElement.className, 'status success');
});

test('testing unsaved host B sends a POST and removes its temporary grant', async() => {
  const h = harness();
  await h.tryHost();
  assert.equal(h.requests.length, 1);
  assert.equal(h.requests[0].opts.method, 'POST');
  assert.equal(h.granted.has(h.previousOrigin), true);
  assert.equal(h.granted.has(h.newOrigin), false);
  assert.ok(h.removed.includes(h.newOrigin));
});

test('failed POST still revokes test-only permission', async() => {
  const h = harness({ status: 503 });
  await h.tryHost();
  assert.equal(h.granted.has(h.newOrigin), false);
  assert.equal(h.granted.has(h.previousOrigin), true);
  assert.match(h.statusElement.textContent, /HTTP 503/);
});

test('testing saved host retains its permission', async() => {
  const h = harness({ formHost: 'old.example.test' });
  await h.tryHost();
  assert.equal(h.granted.has(h.previousOrigin), true);
  assert.equal(h.removed.includes(h.previousOrigin), false);
});

test('failed save revokes new host but retains previously configured host', async() => {
  const h = harness({ failSave: true });
  await h.save();
  assert.equal(h.sync.haHost, 'old.example.test');
  assert.equal(h.granted.has(h.previousOrigin), true);
  assert.equal(h.granted.has(h.newOrigin), false);
  assert.match(h.statusElement.textContent, /Save failed/);
});

test('clearing settings removes current and historically orphaned optional origins', async() => {
  const h = harness({ existingGrants: ['http://stale.example/*'] });
  await h.clear();
  assert.equal(h.granted.size, 0);
  assert.equal(h.sync.haHost, undefined);
  assert.equal(h.local.webhookId, undefined);
  assert.deepEqual(new Set(h.removed), new Set([h.previousOrigin, 'http://stale.example/*']));
});

test('webhook input CSS rules close before their sibling layout declarations', () => {
  const css = fs.readFileSync(path.join(__dirname, '../package/style.css'), 'utf8');
  assert.match(css, /input\[type="password"\][^{]*\{[^{}]*\}\s*\.webhook-row\s*\{/);
  let depth = 0;
  for (const char of css.replace(/\/\*[\s\S]*?\*\//g, '')) {
    if (char === '{') {
      depth++;
    } else if (char === '}') {
      depth--;
    }
    assert.ok(depth >= 0, 'Unexpected CSS closing brace');
  }
  assert.equal(depth, 0, 'Unclosed CSS block');
});

test('new HTTPS configurations default to 443 and do not require an explicit port', async() => {
  const h = harness();
  const config = h.context.getFormConfiguration();
  assert.equal(config.hostname, 'new.example.test');
  assert.equal(config.port, '443');
  assert.equal(config.host, 'new.example.test');
  await h.save();
  assert.equal(h.sync.haHost, 'new.example.test');
  await h.tryHost();
  assert.equal(h.requests[0].url, 'https://new.example.test/api/webhook/secret');
});

test('switching from HTTPS to HTTP updates the default port to 80', () => {
  const h = harness();
  h.elements.get('sslToggle').checked = false;
  h.context.onSslChanged();
  assert.equal(h.elements.get('haPort').value, '80');
  const config = h.context.getFormConfiguration();
  assert.equal(config.host, 'new.example.test');
  assert.equal(h.context.validateConfiguration(config).valid, true);
  h.elements.get('sslToggle').checked = true;
  h.context.onSslChanged();
  assert.equal(h.elements.get('haPort').value, '443');
});

test('custom ports survive protocol changes and save in the existing host:port format', async() => {
  const h = harness();
  h.elements.get('haPort').value = '8123';
  h.elements.get('sslToggle').checked = false;
  h.context.onSslChanged();
  assert.equal(h.elements.get('haPort').value, '8123');
  h.elements.get('sslToggle').checked = true;
  h.context.onSslChanged();
  assert.equal(h.context.getFormConfiguration().host, 'new.example.test:8123');
  await h.save();
  assert.equal(h.sync.haHost, 'new.example.test:8123');
});

test('legacy host:port values migrate into the separate Port field without changing the target', () => {
  const h = harness();
  assert.deepEqual({ ...h.context.splitStoredAddress('legacy.example.test:8123', true) },
    { hostname: 'legacy.example.test', port: '8123' });
  assert.deepEqual({ ...h.context.splitStoredAddress('legacy.example.test', true) },
    { hostname: 'legacy.example.test', port: '443' });
  assert.deepEqual({ ...h.context.splitStoredAddress('legacy.example.test', false) },
    { hostname: 'legacy.example.test', port: '80' });
  assert.deepEqual({ ...h.context.splitStoredAddress('[::1]:8123', true) },
    { hostname: '[::1]', port: '8123' });
});

test('invalid ports and embedded host:port values are rejected', async() => {
  const h = harness();
  for (const value of ['0', '65536', '-1', 'abc', '443.5', '']) {
    h.elements.get('haPort').value = value;
    assert.equal(h.context.validateConfiguration(h.context.getFormConfiguration()).valid,
      false, 'Unexpectedly accepted port ' + value);
  }
  h.elements.get('haPort').value = '443';
  h.elements.get('haHost').value = 'new.example.test:8123';
  assert.equal(h.context.validateConfiguration(h.context.getFormConfiguration()).valid, false);
  await h.save();
  assert.equal(h.sync.haHost, 'old.example.test', 'Invalid form must not overwrite saved host');
});
