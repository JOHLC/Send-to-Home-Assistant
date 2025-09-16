#!/usr/bin/env node

/**
 * Extension Packaging Script
 * 
 * Creates a distributable ZIP file of the extension for Chrome Web Store submission.
 * Excludes development files and includes only necessary extension files.
 */

const fs = require('fs');
const path = require('path');
const archiver = require('archiver');

const PACKAGE_DIR = path.join(__dirname, '../package');
const OUTPUT_DIR = path.join(__dirname, '../dist');
const MANIFEST_PATH = path.join(PACKAGE_DIR, 'manifest.json');

function createPackage() {
  console.log('📦 Creating extension package...\n');

  // Ensure output directory exists
  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }

  // Read version from manifest
  const manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'));
  const version = manifest.version;
  const outputFile = path.join(OUTPUT_DIR, `send-to-home-assistant-v${version}.zip`);

  // Create output stream
  const output = fs.createWriteStream(outputFile);
  const archive = archiver('zip', { zlib: { level: 9 } });

  // Handle events
  output.on('close', () => {
    console.log(`✅ Package created successfully!`);
    console.log(`📁 Output: ${outputFile}`);
    console.log(`📊 Size: ${(archive.pointer() / 1024).toFixed(2)} KB`);
  });

  archive.on('warning', (err) => {
    if (err.code === 'ENOENT') {
      console.warn('⚠️  Warning:', err.message);
    } else {
      throw err;
    }
  });

  archive.on('error', (err) => {
    throw err;
  });

  // Pipe archive data to the file
  archive.pipe(output);

  // Add files from package directory
  const filesToInclude = [
    'manifest.json',
    'background.js',
    'popup.html',
    'popup.js',
    'options.html', 
    'options.js',
    'utils.js',
    'inpage-alert.js',
    'style.css',
    'icon.png'
  ];

  console.log('📂 Including files:');
  filesToInclude.forEach(file => {
    const filePath = path.join(PACKAGE_DIR, file);
    if (fs.existsSync(filePath)) {
      archive.file(filePath, { name: file });
      console.log(`   ✓ ${file}`);
    } else {
      console.warn(`   ⚠️  Missing: ${file}`);
    }
  });

  // Finalize the archive
  archive.finalize();
}

if (require.main === module) {
  try {
    createPackage();
  } catch (error) {
    console.error('❌ Packaging failed:', error.message);
    process.exit(1);
  }
}

module.exports = { createPackage };