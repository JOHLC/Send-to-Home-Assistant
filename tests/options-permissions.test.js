'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const optionsSource = fs.readFileSync(path.join(__dirname, '../package/options.js'), 'utf8');
const utilsSource = fs.readFileSync(path.join(__dirname, '../package/utils.js'), 'utf8');

function harness({ savedHost = 'old.example.test', formHost = 'new.example.test',
  existingGrants = [], status = 200, failSave = false, blockSave = false,
  failResetLocal = false, failResetSync = false, failRevoke = false, blockTest = false } = {}) {
  let releaseTest;
  let testReached;
  const testStarted = blockTest ? new Promise((resolve) => { testReached = resolve; }) :
    Promise.resolve();
  const testGate = blockTest ? new Promise((resolve) => { releaseTest = resolve; }) :
    Promise.resolve();
  let failLocalRemoval = failResetLocal;
  let failSyncRemoval = failResetSync;
  let failPermissionRemoval = failRevoke;
  let releaseSave;
  let saveReached;
  const saveStarted = blockSave ? new Promise((resolve) => { saveReached = resolve; }) :
    Promise.resolve();
  const saveGate = blockSave ? new Promise((resolve) => { releaseSave = resolve; }) :
    Promise.resolve();
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
      if (blockSave && area === 'sync' && Object.hasOwn(values, 'haHost')) {
        saveReached();
        saveGate.then(() => {
          Object.assign(data, values);
          callback();
        });
        return;
      }
      Object.assign(data, values);
      callback();
    },
    remove(keys, callback) {
      const names = Array.isArray(keys) ? keys : [keys];
      const shouldFail = Array.isArray(keys) &&
        ((area === 'sync' && failSyncRemoval && names.includes('haHost')) ||
         (area === 'local' && failLocalRemoval && names.includes('webhookId')));
      if (shouldFail) {
        chrome.runtime.lastError = { message: 'Simulated reset storage failure' };
        callback();
        chrome.runtime.lastError = null;
        return;
      }
      for (const key of names) {
        delete data[key];
      }
      callback();
    },
  });

  const elements = new Map();
  for (const id of ['haHost', 'sslToggle', 'webhookId', 'userName', 'deviceName',
    'status', 'save', 'test', 'clearConfig', 'haPort', 'connectionState',
    'toggleWebhookId', 'resetConfirmation', 'confirmClearConfig', 'cancelClearConfig',
    'resetStatus']) {
    const classes = new Set(id === 'resetConfirmation' ? ['hidden'] : []);
    const attributes = {};
    elements.set(id, {
      value: '', checked: true, disabled: false, className: '', textContent: '',
      type: id === 'webhookId' ? 'password' : 'text',
      dataset: {}, attributes,
      classList: {
        add(name) { classes.add(name); },
        remove(name) { classes.delete(name); },
        contains(name) { return classes.has(name); },
      },
      setAttribute(name, value) { attributes[name] = value; },
      addEventListener() {},
    });
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
        if (failPermissionRemoval) {
          return false;
        }
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
      if (blockTest) {
        testReached();
        await testGate;
      }
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
    elements, context, saveStarted, testStarted,
    releaseSave: () => releaseSave?.(),
    releaseTest: () => releaseTest?.(),
    setResetFailures({ local: localFailure = false, sync: syncFailure = false,
      permissions: permissionFailure = false } = {}) {
      failLocalRemoval = localFailure;
      failSyncRemoval = syncFailure;
      failPermissionRemoval = permissionFailure;
    },
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

test('edits made during an asynchronous save remain visibly unsaved', async() => {
  const h = harness({ blockSave: true });
  const pending = h.save();
  await h.saveStarted;
  h.elements.get('haHost').value = 'newer.example.test';
  h.releaseSave();
  await pending;
  assert.equal(h.sync.haHost, 'new.example.test');
  assert.equal(h.elements.get('connectionState').textContent, 'Unsaved changes');
  assert.equal(h.elements.get('connectionState').dataset.state, 'unsaved');
  assert.match(h.statusElement.textContent, /newer changes are still unsaved/);
  await h.save();
  assert.equal(h.sync.haHost, 'newer.example.test');
  assert.equal(h.elements.get('connectionState').textContent, 'Saved');
});

test('failed reset reports incomplete state, leaves stored secret and allows retry', async() => {
  const h = harness({ failResetLocal: true });
  const first = await h.clear();
  assert.equal(first, false);
  assert.equal(h.local.webhookId, 'secret');
  assert.equal(h.elements.get('connectionState').textContent, 'Reset incomplete');
  assert.match(h.statusElement.textContent, /Some settings may already be cleared/);
  assert.match(h.elements.get('resetStatus').textContent, /Retry or cancel/);
  h.setResetFailures();
  const second = await h.clear();
  assert.equal(second, true);
  assert.equal(h.local.webhookId, undefined);
  assert.equal(h.elements.get('connectionState').textContent, 'Not configured');
});

test('failed permission cleanup is not reported as a completed reset', async() => {
  const h = harness({ failRevoke: true });
  assert.equal(await h.clear(), false);
  assert.equal(h.granted.has(h.previousOrigin), true);
  assert.match(h.statusElement.textContent, /Reset incomplete/);
  h.setResetFailures();
  assert.equal(await h.clear(), true);
  assert.equal(h.granted.size, 0);
});

test('confirmed reset remasks webhook input and resets reveal accessibility state', async() => {
  const h = harness();
  const secret = h.elements.get('webhookId');
  const reveal = h.elements.get('toggleWebhookId');
  secret.type = 'text';
  reveal.textContent = 'Hide';
  reveal.setAttribute('aria-pressed', 'true');
  assert.equal(await h.clear(), true);
  assert.equal(secret.value, '');
  assert.equal(secret.type, 'password');
  assert.equal(reveal.textContent, 'Show');
  assert.equal(reveal.attributes['aria-pressed'], 'false');
  assert.equal(reveal.attributes['aria-label'], 'Show webhook ID');
});

test('slow Test blocks Save, Reset and duplicate Test until permission cleanup completes', async() => {
  const h = harness({ blockTest: true });
  const pendingTest = h.tryHost();
  await h.testStarted;
  assert.equal(h.elements.get('save').disabled, true);
  assert.equal(h.elements.get('test').disabled, true);
  assert.equal(h.elements.get('clearConfig').disabled, true);
  await h.save();
  assert.equal(await h.clear(), false);
  await h.tryHost();
  assert.equal(h.requests.length, 1, 'A second Test must not send a duplicate POST');
  assert.equal(h.sync.haHost, 'old.example.test', 'Save must not run during Test');
  assert.equal(h.elements.get('test').disabled, true);
  h.releaseTest();
  await pendingTest;
  assert.equal(h.elements.get('test').disabled, false);
  assert.equal(h.elements.get('save').disabled, false);
  assert.equal(h.elements.get('clearConfig').disabled, false);
  await h.save();
  assert.equal(h.sync.haHost, 'new.example.test');
});

test('late initial read cannot restore stale credentials after successful reset', async() => {
  const h = harness();
  const original = h.context.ExtensionUtils.getStorageConfig;
  let resolveInitial;
  h.context.ExtensionUtils.getStorageConfig = () => new Promise((resolve) => {
    resolveInitial = resolve;
  });
  h.context.loadSavedConfiguration();
  h.context.ExtensionUtils.getStorageConfig = original;
  assert.equal(await h.clear(), true);
  resolveInitial({
    haHost: 'old.example.test', ssl: true, webhookId: 'stale-secret',
    userName: 'Former', deviceName: 'Old laptop',
  });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(h.elements.get('haHost').value, '');
  assert.equal(h.elements.get('webhookId').value, '');
  assert.equal(h.elements.get('connectionState').textContent, 'Not configured');
  assert.equal(h.local.webhookId, undefined);
});

test('late initial read cannot replace the form after a completed Save', async() => {
  const h = harness();
  const original = h.context.ExtensionUtils.getStorageConfig;
  let resolveInitial;
  let first = true;
  h.context.ExtensionUtils.getStorageConfig = () => {
    if (first) {
      first = false;
      return new Promise((resolve) => { resolveInitial = resolve; });
    }
    return original();
  };
  h.context.loadSavedConfiguration();
  await h.save();
  assert.equal(h.sync.haHost, 'new.example.test');
  assert.equal(h.elements.get('connectionState').textContent, 'Saved');
  resolveInitial({
    haHost: 'old.example.test', ssl: true, webhookId: 'stale-secret',
    userName: 'Former', deviceName: 'Old laptop',
  });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(h.elements.get('haHost').value, 'new.example.test');
  assert.equal(h.elements.get('webhookId').value, 'secret');
  assert.equal(h.elements.get('connectionState').textContent, 'Saved');
});
