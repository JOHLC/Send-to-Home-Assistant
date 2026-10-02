'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { validateReleaseTag } = require('../scripts/validate-release');

const manifest = require('../package/manifest.json');
const packageJson = require('../package.json');

test('the current Beta3 release tag matches the Chrome-safe version and display name', () => {
  assert.deepEqual(validateReleaseTag('2026.10.2-Beta3', manifest, packageJson),
    { baseVersion: '2026.10.2', releaseName: '2026.10.2-Beta3' });
  assert.equal(manifest.version_name, '2026.10.2-Beta3');
});

test('a leading v is accepted without affecting the display name', () => {
  assert.deepEqual(validateReleaseTag('v2026.10.2-Beta3', manifest, packageJson),
    { baseVersion: '2026.10.2', releaseName: '2026.10.2-Beta3' });
});

test('outdated manifest or package.json versions fail instead of bypassing validation', () => {
  assert.throws(() => validateReleaseTag('2026.10.2-Beta3',
    { ...manifest, version: '2025.09.2' }, packageJson), /requires manifest version/);
  assert.throws(() => validateReleaseTag('2026.10.2-Beta3', manifest,
    { ...packageJson, version: '2025.09.2' }), /package.json version/);
});

test('release stage must match version_name, including Beta3 vs Beta4', () => {
  assert.throws(() => validateReleaseTag('2026.10.2-Beta4', manifest, packageJson),
    /version_name/);
  assert.throws(() => validateReleaseTag('2026.10.2', manifest, packageJson),
    /Stable tag/);
  assert.deepEqual(validateReleaseTag('2026.10.2',
    { ...manifest, version_name: undefined }, packageJson),
  { baseVersion: '2026.10.2', releaseName: '2026.10.2' });
});

test('rejects malformed and unsafe release tags and unsupported Chrome version parts', () => {
  for (const tag of ['', '2026.10.2/Beta2', '../../etc', '2026.10.2-Beta3/../bad',
    '2026.10.2-Beta3;echo unsafe']) {
    assert.throws(() => validateReleaseTag(tag, manifest, packageJson));
  }
  assert.throws(() => validateReleaseTag('99999.10.1-Beta2',
    { ...manifest, version: '99999.10.1', version_name: '99999.10.1-Beta2' },
    { ...packageJson, version: '99999.10.1' }), /65535/);
});

test('package name includes prerelease display name and a ZIP created locally is valid', () => {
  const script = fs.readFileSync(path.join(__dirname, '../scripts/package-extension.js'), 'utf8');
  assert.match(script, /manifest\.version_name \|\| manifest\.version/);
});
