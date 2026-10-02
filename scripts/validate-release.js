#!/usr/bin/env node
'use strict';

/**
 * Validate release tags against the Chrome-safe numeric extension version
 * and human-readable prerelease version_name. Do not skip this check for betas.
 */
function validateReleaseTag(tag, manifest, packageJson) {
  if (typeof tag !== 'string') {
    throw new Error('RELEASE_TAG must contain the target GitHub release tag.');
  }
  const match = /^v?(\d+(?:\.\d+){2,3})(?:-([A-Za-z0-9][A-Za-z0-9.-]{0,48}))?$/.exec(tag);
  if (!match) {
    throw new Error('Expected a release tag such as 2026.10.1 or 2026.10.1-Beta2.');
  }
  const baseVersion = match[1];
  const releaseName = baseVersion + (match[2] ? '-' + match[2] : '');
  const numericParts = baseVersion.split('.').map(Number);
  if (numericParts.some((part) => !Number.isInteger(part) || part > 65535)) {
    throw new Error('Chrome manifest version components must be between 0 and 65535.');
  }
  if (manifest.version !== baseVersion) {
    throw new Error('Release tag ' + tag + ' requires manifest version ' + baseVersion +
      ', but found ' + manifest.version + '.');
  }
  if (packageJson.version !== baseVersion) {
    throw new Error('package.json version must match the numeric manifest version: ' + baseVersion + '.');
  }
  if (match[2]) {
    if (manifest.version_name !== releaseName) {
      throw new Error('Prerelease tag requires manifest version_name "' + releaseName + '".');
    }
  } else if (manifest.version_name && manifest.version_name !== baseVersion) {
    throw new Error('Stable tag requires removing or updating prerelease manifest version_name.');
  }
  return { baseVersion, releaseName };
}

function run() {
  try {
    const manifest = require('../package/manifest.json');
    const packageJson = require('../package.json');
    const result = validateReleaseTag(process.env.RELEASE_TAG, manifest, packageJson);
    console.log('Validated release ' + result.releaseName + ' (Chrome version ' + result.baseVersion + ').');
  } catch (error) {
    console.error('Release version validation failed: ' + error.message);
    process.exitCode = 1;
  }
}

if (require.main === module) {
  run();
}

module.exports = { validateReleaseTag };
