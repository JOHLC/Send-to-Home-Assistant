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