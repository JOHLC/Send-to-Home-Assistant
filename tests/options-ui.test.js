'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '../package');
const options = fs.readFileSync(path.join(root, 'options.html'), 'utf8');
const popup = fs.readFileSync(path.join(root, 'popup.html'), 'utf8');
const stylesheet = fs.readFileSync(path.join(root, 'options.css'), 'utf8');
const profileEditor = fs.readFileSync(path.join(root, 'profile-options.js'), 'utf8');
const optionsScript = fs.readFileSync(path.join(root, 'options.js'), 'utf8');
const packager = fs.readFileSync(path.join(__dirname, '../scripts/package-extension.js'), 'utf8');

test('options are split into named connection, profiles and preferences sections', () => {
  for (const section of ['connection', 'profiles', 'preferences']) {
    assert.match(options, new RegExp('<section[^>]+id="' + section + '"'));
    assert.match(options, new RegExp('href="#' + section + '"'));
  }
  assert.match(options, /<main class="settings-main">/);
  assert.match(options, /<nav class="settings-nav" aria-label="Settings sections">/);
  assert.match(options, /<link rel="stylesheet" href="options.css">/);
  assert.doesNotMatch(options, /href="style.css"/);
  assert.match(popup, /href="style.css"/);
});

test('each connection control has a unique ID, useful label and explicit action', () => {
  for (const id of ['haHost', 'haPort', 'sslToggle', 'webhookId', 'userName', 'deviceName']) {
    assert.match(options, new RegExp('id="' + id + '"'));
    assert.match(options, new RegExp('for="' + id + '"'));
  }
  for (const id of ['save', 'test', 'toggleWebhookId', 'connectionState', 'status']) {
    assert.match(options, new RegExp('id="' + id + '"'));
  }
  assert.match(options, /class="reset-confirm hidden" id="resetConfirmation"/);
  assert.match(options, /id="confirmClearConfig"/);
  assert.match(options, /id="cancelClearConfig"/);
  assert.match(options, /id="haPort"[^>]*inputmode="numeric"/);
  assert.match(options, /value="443" placeholder="443"/);
  assert.match(stylesheet, /\.connection-address-grid\s*\{/);
  assert.match(options, /Send test sends sample data/);
  assert.match(optionsScript, /setConnectionState\('Unsaved changes'/);
  assert.match(optionsScript, /resetConfirmation\.classList\.remove\('hidden'\)/);
});

test('profile list offers compact rows and inline edit on demand', () => {
  assert.match(profileEditor, /profile-list-row/);
  assert.match(profileEditor, /showEditor\(row, profile\)/);
  assert.match(profileEditor, /makeButton\('Edit'/);
  assert.match(profileEditor, /profile-row-caption/);
  assert.match(options, /id="preferenceStatus"/);
  assert.match(options, /Profile actions save independently/);
  assert.match(options, /Automation context/);
});

test('options have a separate responsive stylesheet and package includes it', () => {
  assert.match(stylesheet, /\.settings-layout\s*\{/);
  assert.match(stylesheet, /@media \(max-width: 780px\)/);
  assert.match(stylesheet, /@media \(max-width: 520px\)/);
  assert.match(stylesheet, /\.field-grid/);
  assert.match(packager, /'options\.css'/);
  let braces = 0;
  for (const character of stylesheet.replace(/\/\*[\s\S]*?\*\//g, '')) {
    if (character === '{') { braces++; }
    if (character === '}') { braces--; }
    assert.ok(braces >= 0, 'Unexpected closing brace in options.css');
  }
  assert.equal(braces, 0, 'Unclosed options.css rule');
});

test('update checks are advanced and have visible saved/error feedback', () => {
  const advanced = options.indexOf('<details class="settings-details advanced-settings">');
  const updateToggle = options.indexOf('id="updateCheckToggle"');
  const updateFeedback = options.indexOf('id="updatePreferenceStatus"');
  const detailsEnd = options.indexOf('</details>', advanced);
  assert.ok(advanced >= 0 && advanced < updateToggle &&
    updateToggle < updateFeedback && updateFeedback < detailsEnd,
  'Update toggle and its feedback must be inside the advanced disclosure');
  assert.match(optionsScript, /chrome\.runtime\.lastError\?\.message/);
  assert.match(optionsScript, /Could not save update preference/);
  assert.match(optionsScript, /Automatic update checks enabled/);
  assert.match(optionsScript, /Automatic update checks disabled/);
});

test('browser smoke test confirms reset and popup sends, not just popup dimensions', () => {
  const smoke = fs.readFileSync(path.join(__dirname, '../scripts/smoke-render-settings.js'), 'utf8');
  assert.match(smoke, /confirmClearConfig/);
  assert.match(smoke, /Not configured/);
  assert.match(smoke, /profiles: 1/);
  assert.match(smoke, /Simulated storage failure/);
  assert.match(smoke, /quick-send popup success/);
  assert.match(smoke, /context: 'Default'/);
});
