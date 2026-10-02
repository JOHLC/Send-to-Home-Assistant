#!/usr/bin/env node

/**
 * Manifest Validation Script
 * 
 * Validates the extension manifest.json file for common issues
 * and ensures it meets Chrome Web Store requirements.
 */

const fs = require('fs');
const path = require('path');

const MANIFEST_PATH = path.join(__dirname, '../package/manifest.json');

function validateManifest() {
  console.log('🔍 Validating manifest.json...\n');

  // Check if manifest exists
  if (!fs.existsSync(MANIFEST_PATH)) {
    console.error('❌ manifest.json not found at:', MANIFEST_PATH);
    process.exit(1);
  }

  // Read and parse manifest
  let manifest;
  try {
    const manifestContent = fs.readFileSync(MANIFEST_PATH, 'utf8');
    manifest = JSON.parse(manifestContent);
  } catch (error) {
    console.error('❌ Invalid JSON in manifest.json:', error.message);
    process.exit(1);
  }

  const errors = [];
  const warnings = [];

  // Required fields
  const requiredFields = [
    'manifest_version',
    'name', 
    'version',
    'description'
  ];

  requiredFields.forEach(field => {
    if (!manifest[field]) {
      errors.push(`Missing required field: ${field}`);
    }
  });

  // Manifest version check
  if (manifest.manifest_version !== 3) {
    warnings.push('Consider using Manifest V3 for future compatibility');
  }

  // Version format check
  if (manifest.version && !/^\d+(\.\d+)*$/.test(manifest.version)) {
    errors.push('Version must be in format: number.number.number');
  }

  // Chrome requires a numeric version but permits a readable prerelease version_name.
  if (manifest.version_name && (typeof manifest.version_name !== 'string' ||
      !/^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/.test(manifest.version_name))) {
    errors.push('version_name must be a safe, readable release label');
  }

  // Name and description length
  if (manifest.name && manifest.name.length > 45) {
    warnings.push('Extension name is longer than recommended (45 chars)');
  }

  if (manifest.description && manifest.description.length > 132) {
    warnings.push('Description is longer than recommended (132 chars)');
  }

  // Icons check
  if (manifest.icons) {
    const recommendedSizes = [16, 32, 48, 128];
    const availableSizes = Object.keys(manifest.icons).map(Number);
    
    recommendedSizes.forEach(size => {
      if (!availableSizes.includes(size)) {
        warnings.push(`Missing recommended icon size: ${size}x${size}`);
      }
    });
  }

  // Permissions check
  if (manifest.permissions && manifest.permissions.length > 0) {
    const sensitivePermissions = ['activeTab', 'storage', '<all_urls>'];
    const requestedSensitive = manifest.permissions.filter(p => 
      sensitivePermissions.some(sp => p.includes(sp))
    );
    
    if (requestedSensitive.length > 0) {
      console.log('ℹ️  Sensitive permissions detected:', requestedSensitive.join(', '));
    }
  }

  // Production permissions and CSP checks
  if ((manifest.host_permissions || []).includes('<all_urls>')) {
    errors.push('Persistent <all_urls> access is not permitted');
  }
  if (!(manifest.optional_host_permissions || []).includes('https://*/*')) {
    errors.push('HTTPS optional host permission is required for user-selected HA instances');
  }
  for (const file of ['background.js', 'popup.html', 'popup.js', 'options.html', 'options.js', 'utils.js', 'profiles.js', 'profile-options.js', 'options.css', 'icon-256.png']) {
    if (!fs.existsSync(path.join(__dirname, '../package', file))) {
      errors.push('Missing extension runtime file: ' + file);
    }
  }
  for (const file of ['popup.html', 'options.html']) {
    const html = fs.readFileSync(path.join(__dirname, '../package', file), 'utf8');
    if (/\son(?:error|load|click)\s*=/.test(html)) {
      errors.push(file + ' contains an inline event handler');
    }
  }

  // Host permissions check (Manifest V3)
  if (manifest.host_permissions && manifest.host_permissions.includes('<all_urls>')) {
    warnings.push('Using <all_urls> host permission - consider being more specific');
  }

  // CSP check
  if (manifest.content_security_policy) {
    const csp = manifest.content_security_policy.extension_pages || manifest.content_security_policy;
    if (typeof csp === 'string' && csp.includes("'unsafe-inline'")) {
      warnings.push('CSP allows unsafe-inline - consider removing for better security');
    }
  }

  // Output results
  if (errors.length === 0 && warnings.length === 0) {
    console.log('✅ Manifest validation passed! No issues found.\n');
  } else {
    if (errors.length > 0) {
      console.log('❌ ERRORS:');
      errors.forEach(error => console.log(`   ${error}`));
      console.log('');
    }

    if (warnings.length > 0) {
      console.log('⚠️  WARNINGS:');
      warnings.forEach(warning => console.log(`   ${warning}`));
      console.log('');
    }
  }

  // Summary
  console.log('📋 SUMMARY:');
  console.log(`   Name: ${manifest.name}`);
  console.log(`   Version: ${manifest.version}`);
  console.log(`   Manifest Version: ${manifest.manifest_version}`);
  console.log(`   Permissions: ${manifest.permissions ? manifest.permissions.length : 0}`);
  console.log(`   Host Permissions: ${manifest.host_permissions ? manifest.host_permissions.length : 0}`);

  if (errors.length > 0) {
    console.log('\n❌ Validation failed with errors!');
    process.exit(1);
  } else {
    console.log('\n✅ Manifest validation completed successfully!');
  }
}

if (require.main === module) {
  validateManifest();
}

module.exports = { validateManifest };