# Copilot Instructions for Send to Home Assistant Extension

## Project Overview
- **Purpose:** Chrome/Edge extension to send current page details (URL, title, favicon, selected text, etc.) to a Home Assistant instance via webhook.
- **Main Components:**
  - `package/background.js`: Handles context menu, extension icon click, message payload construction, and webhook POST.
  - `package/popup.js`: Popup UI, triggers send, shows status, previews payload, and allows copying JSON.
  - `package/options.js`: Options page for configuring Home Assistant host, SSL, webhook ID, username, device name, and testing webhook.
  - `config/automations.md`: Example Home Assistant automations for received payloads.

## Key Architectural Patterns
- **Data Flow:**
  - User triggers (icon/context menu) → Collects page info → POSTs JSON to Home Assistant webhook.
  - Settings stored in `chrome.storage.sync` (extension-wide) and `chrome.storage.local` (update info).
- **Popup/Options Communication:**
  - Use `chrome.runtime.openOptionsPage()` for settings access.
  - Popup and background communicate via `chrome.runtime.onMessage`.
- **Error Handling:**
  - User feedback via Chrome notifications and popup messages.
  - In-page alerts injected via `inpage-alert.js` for fallback.

## Developer Workflows
- **Build/Test:**
  - No build step; direct edit and load unpacked in Chrome/Edge.
  - For testing webhook, use the Options page's "Test" button.
  - Use `config/automations.md` for Home Assistant automation examples.
- **Debugging:**
  - Use browser extension debugger (background/popup scripts).
  - Check Chrome notifications and popup for error/status.

## Project-Specific Conventions
- **Manifest v3:**
  - Service worker (`background.js`) for background tasks.
  - Permissions: `storage`, `scripting`, `activeTab`, `contextMenus`, `notifications`.
- **Payload Structure:**
  - Always includes: `title`, `url`, `favicon`, `selected`, `timestamp`, `user_agent`.
  - Optionally: `user`, `device` (from options).
- **Security:**
  - SSL strongly recommended; UI warns if not enabled.
  - Never send data to third parties; only to configured webhook.

## Integration Points
- **Home Assistant:**
  - Webhook endpoint: `https://<host>/api/webhook/<webhookId>`
  - See `config/automations.md` for automation YAML examples.
- **Update Checks:**
  - Background script checks GitHub releases for updates (can be disabled in options)..

## Examples
- **Sending a page:**
  - Click extension icon or use context menu → Data sent to webhook → Automation triggers in Home Assistant.
- **Automation YAML:**
  - See `config/automations.md` for a template to notify mobile devices.

## Important Files
- `package/background.js`, `package/popup.js`, `package/options.js`, `config/automations.md`, `manifest.json`

---
For questions about project-specific patterns, see the README or ask for clarification. If any section is unclear or missing, please request feedback to improve these instructions.
