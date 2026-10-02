'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const profileSource = fs.readFileSync(path.join(__dirname, '../package/profiles.js'), 'utf8');
const backgroundSource = fs.readFileSync(path.join(__dirname, '../package/background.js'), 'utf8');
const utilsSource = fs.readFileSync(path.join(__dirname, '../package/utils.js'), 'utf8');

function setup(initial = {}) {
  const stored = { ...initial };
  const storage = {
    get(keys, callback) {
      const result = Object.fromEntries(keys.filter((key) => Object.hasOwn(stored, key))
        .map((key) => [key, stored[key]]));
      callback(result);
    },
    set(values, callback) {
      Object.assign(stored, values);
      callback?.();
    },
    remove(keys, callback) {
      for (const key of Array.isArray(keys) ? keys : [keys]) {
        delete stored[key];
      }
      callback?.();
    },
  };
  const sandbox = { chrome: { runtime: {}, storage: { sync: storage } }, self: {} };
  vm.runInNewContext(profileSource, sandbox);
  return { api: sandbox.self.ExtensionProfiles, stored };
}

test('new installations start with a configurable Default context but do not auto-send', async() => {
  const { api } = setup();
  const settings = await api.getProfileSettings();
  assert.equal(settings.defaultProfileId, 'default');
  assert.equal(settings.quickSendDefault, false);
  assert.equal(api.resolveProfile(settings).context, 'Default');
  assert.equal(api.listProfiles(settings).length, 1);
});

test('profile settings persist and support arbitrary named contexts', async() => {
  const { api, stored } = setup();
  const settings = await api.saveProfileSettings({
    profiles: [{ id: 'p_12345678', name: 'Download video', context: 'YTDL' }],
    defaultProfileId: 'p_12345678',
    quickSendDefault: true,
  });
  assert.equal(settings.quickSendDefault, true);
  assert.equal(stored.sendProfiles[0].context, 'YTDL');
  assert.equal(api.resolveProfile(await api.getProfileSettings()).context, 'YTDL');
  assert.equal(api.resolveProfile(settings, 'default').context, 'Default');
  assert.throws(() => api.resolveProfile(settings, 'p_deleted123'), /no longer exists/);
});

test('deleted default falls back to built-in Default; invalid stored profiles fail closed', async() => {
  const { api } = setup({ defaultProfileId: 'p_missing12' });
  assert.equal((await api.getProfileSettings()).defaultProfileId, 'default');
  const invalid = setup({ sendProfiles: [{ id: 'bad', name: 'Oops', context: '<html>' }] });
  await assert.rejects(invalid.api.getProfileSettings(), /Stored send profiles are invalid/);
});

test('service worker builds and refreshes one menu entry per profile', async() => {
  const sync = {
    sendProfiles: [{ id: 'p_12345678', name: 'Download video', context: 'YTDL' }],
    defaultProfileId: 'p_12345678',
  };
  const menus = [];
  const listeners = {};
  const sends = [];
  const event = (name) => ({ addListener(callback) { listeners[name] = callback; } });
  const chrome = {
    runtime: {
      lastError: null,
      onInstalled: event('installed'),
      onStartup: event('startup'),
      onMessage: event('message'),
      getManifest: () => ({ version: '2025.09.2' }),
    },
    storage: {
      sync: { get(keys, callback) {
        callback(Object.fromEntries(keys.filter((key) => Object.hasOwn(sync, key)).map((key) => [key, sync[key]])));
      } },
      local: {
        get(_keys, callback) { callback({}); },
        remove(_keys, callback) { callback?.(); },
      },
      onChanged: event('changed'),
    },
    contextMenus: {
      onClicked: event('clicked'),
      removeAll(callback) { menus.length = 0; callback(); },
      create(options, callback) { menus.push(options); callback(); },
    },
    action: { onClicked: event('action') },
    tabs: { sendMessage() {} },
  };
  const sandbox = { chrome, URL, setTimeout, clearTimeout, console: { error() {}, warn() {} },
    navigator: { userAgent: 'Test' } };
  sandbox.self = sandbox;
  const ctx = vm.createContext(sandbox);
  sandbox.importScripts = (...files) => {
    for (const file of files) {
      vm.runInContext(file === 'profiles.js' ? profileSource : utilsSource, ctx);
    }
  };
  vm.runInContext(backgroundSource, ctx);
  const flush = () => new Promise((resolve) => setTimeout(resolve, 25));
  await flush();
  assert.deepEqual(menus.map((menu) => menu.title),
    ['Send to Home Assistant', 'Default', 'Download video (default)']);
  sandbox.ExtensionUtils.sendToHomeAssistant = async(options) => { sends.push(options); };
  await listeners.clicked({
    menuItemId: 'send-to-ha-profile:p_12345678', linkUrl: 'https://example.com/',
  }, { id: 17, url: 'https://example.com/' });
  assert.equal(sends[0].profileId, 'p_12345678');
  assert.equal(sends[0].contextInfo.linkUrl, 'https://example.com/');
  sync.sendProfiles = [{ id: 'p_87654321', name: 'Read later', context: 'Save' }];
  sync.defaultProfileId = 'default';
  listeners.changed({ sendProfiles: { newValue: sync.sendProfiles }, defaultProfileId: { newValue: 'default' } }, 'sync');
  await flush();
  assert.deepEqual(menus.map((menu) => menu.title),
    ['Send to Home Assistant', 'Default (default)', 'Read later']);
});
