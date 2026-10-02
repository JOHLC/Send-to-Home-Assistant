'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const popup = fs.readFileSync(path.join(__dirname, '../package/popup.html'), 'utf8');
const options = fs.readFileSync(path.join(__dirname, '../package/options.html'), 'utf8');
const css = fs.readFileSync(path.join(__dirname, '../package/style.css'), 'utf8');

function styleFor(selector, stylesheet = css) {
  const escaped = selector.replace(/[.*+?^\${}()|[\]\\]/g, '\\$&');
  const match = new RegExp(escaped + '\\s*\\{([^{}]*)\\}', 's').exec(stylesheet);
  assert.ok(match, 'Missing CSS rule for ' + selector);
  return match[1];
}

test('toolbar popup has a fixed intrinsic document and body width independent of 100vw', () => {
  assert.match(popup, /<html class="popup-document">/);
  assert.match(popup, /<body class="popup-page">/);
  const html = styleFor('html.popup-document');
  const body = styleFor('body.popup-page');
  for (const rule of [html, body]) {
    assert.match(rule, /width:\s*376px\s*;/);
    assert.match(rule, /min-width:\s*376px\s*;/);
    assert.doesNotMatch(rule, /100vw/);
  }
  assert.match(body, /min-height:\s*0\s*;/);
});

test('popup controls fill the panel without inheriting desktop card padding', () => {
  const panel = styleFor('.popup-page .container');
  assert.match(panel, /width:\s*100%\s*;/);
  assert.match(panel, /box-sizing:\s*border-box\s*;/);
  assert.match(panel, /padding:\s*18px 22px 24px\s*;/);
  assert.match(styleFor('.popup-page .profile-select'), /width:\s*100%\s*;/);
  assert.match(styleFor('.popup-page #sendBtn'), /width:\s*100%\s*;/);
  assert.match(styleFor('.popup-page .preview'), /max-height:\s*255px\s*;/);
  assert.match(styleFor('.popup-page .preview'), /overflow-y:\s*auto\s*;/);
  assert.match(styleFor('.popup-page .container .icon img'), /width:\s*48px\s*;/);
});

test('full Options page remains separate from action popup sizing', () => {
  assert.doesNotMatch(options, /popup-document|popup-page/);
  assert.match(options, /class="card"/);
  assert.doesNotMatch(popup, /style="/);
});
