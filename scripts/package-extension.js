#!/usr/bin/env node
'use strict';
// Produce a minimal installable ZIP without undeclared npm dependencies.
// zip is standard on macOS/Linux and Compress-Archive ships with Windows.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const source = path.join(root, 'package');
const destination = path.join(root, 'dist');
const manifest = JSON.parse(fs.readFileSync(path.join(source, 'manifest.json'), 'utf8'));
const files = [
  'manifest.json', 'background.js', 'popup.html', 'popup.js',
  'options.html', 'options.js', 'utils.js', 'inpage-alert.js',
  'style.css', 'options.css', 'icon-256.png', 'profiles.js', 'profile-options.js',
];

function createPackage() {
  for (const file of files) {
    if (!fs.statSync(path.join(source, file), { throwIfNoEntry: false })?.isFile()) {
      throw new Error('Required extension file missing: ' + file);
    }
  }
  fs.mkdirSync(destination, { recursive: true });
  const displayVersion = manifest.version_name || manifest.version;
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/.test(displayVersion)) {
    throw new Error('Invalid release display version for ZIP filename');
  }
  const output = path.join(destination, 'send-to-home-assistant-v' + displayVersion + '.zip');
  fs.rmSync(output, { force: true });
  let result;
  if (os.platform() === 'win32') {
    const psQuote = (value) => "'" + value.replaceAll("'", "''") + "'";
    const command = 'Compress-Archive -LiteralPath @(' +
      files.map((file) => psQuote(path.join(source, file))).join(',') +
      ') -DestinationPath ' + psQuote(output) + ' -CompressionLevel Optimal -Force';
    result = spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', command],
      { encoding: 'utf8' });
  } else {
    result = spawnSync('zip', ['-q', '-X', output, ...files],
      { cwd: source, encoding: 'utf8' });
  }
  if (result.error || result.status !== 0) {
    throw new Error('ZIP creation failed: ' + (result.error?.message || result.stderr || result.status));
  }
  if (!fs.statSync(output).size) {
    throw new Error('ZIP archive is empty');
  }
  console.log('Created ' + output);
  return output;
}

if (require.main === module) {
  try {
    createPackage();
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}

module.exports = { createPackage };
