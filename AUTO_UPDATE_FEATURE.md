# Auto-Update Feature Implementation

## Overview
This document describes the optional auto-update feature that has been added to the "Send to Home Assistant" browser extension.

## What Was Implemented

### 1. User Interface (options.html)
Added two new settings in the options page:
- **Enable Auto-Update**: A checkbox to enable/disable automatic sending of active tab data
- **Update Interval**: A number input to set the interval in seconds (minimum 5 seconds, default 60)

The interval input is only visible when auto-update is enabled.

### 2. Settings Management (options.js)
Updated the options script to:
- Save and restore `autoUpdate` (boolean) and `updateInterval` (number) settings
- Validate that the interval is at least 5 seconds
- Show/hide the interval input based on the checkbox state
- Notify the background script when settings change
- Clear auto-update settings when "Clear Config" is clicked

### 3. Manifest Updates (manifest.json)
Added the `alarms` permission required for the Chrome Alarms API.

### 4. Background Script (background.js)
Implemented the auto-update mechanism:

#### New Functions:
- **`sendActiveTabToHomeAssistant(options)`**: Reusable function that gets the active tab and sends it to Home Assistant. Can be configured to show/hide page alerts and notifications.
  
- **`setupAutoUpdateAlarm(enabled, intervalSeconds)`**: Sets up or clears the Chrome alarm based on user settings.

- **`handleAutoUpdateAlarm(alarm)`**: Handles alarm triggers and sends the active tab data silently (no notifications or page alerts to avoid spam).

- **`initializeAutoUpdate()`**: Loads settings from storage and initializes the alarm on extension startup.

#### Event Listeners:
- `chrome.alarms.onAlarm`: Listens for alarm triggers
- `chrome.runtime.onMessage`: Listens for settings changes from the options page
- `chrome.runtime.onStartup`: Re-initializes the alarm when the browser starts

## How It Works

1. **User enables auto-update** in the extension options and sets an interval (e.g., 60 seconds)
2. **Settings are saved** to `chrome.storage.sync` and the background script is notified
3. **Background script creates an alarm** using the Chrome Alarms API
4. **Every interval, the alarm fires** and triggers `sendActiveTabToHomeAssistant()`
5. **Active tab data is sent** to Home Assistant silently (no notifications to avoid spamming)
6. **If settings change**, the alarm is updated or cleared accordingly

## Important Notes

### Chrome Alarms API Limitations
- **Minimum interval**: Chrome's Alarms API has a minimum interval of 1 minute (60 seconds) in production builds
- **Development builds**: Can use shorter intervals, but users should be aware this may not work in production
- **Workaround**: The implementation converts seconds to minutes (`intervalSeconds / 60`) to work with the API

### Silent Updates
Auto-updates are sent **silently** to avoid spamming the user with notifications every interval. The following are disabled for auto-updates:
- Browser notifications
- In-page alerts

Manual sends (via icon click or context menu) still show all notifications and alerts.

### Restricted Pages
The extension cannot send data from browser internal pages (chrome://, edge://, about:, etc.). Auto-updates will fail silently on these pages.

### Settings Synchronization
All settings (including auto-update preferences) are stored in `chrome.storage.sync`, so they sync across devices where the user is signed in.

## Testing the Feature

1. **Install/reload the extension** with the updated code
2. **Open the options page** (right-click extension icon → Options)
3. **Configure your Home Assistant** settings (host, webhook ID, etc.)
4. **Enable "Enable Auto-Update"** checkbox
5. **Set an interval** (e.g., 60 seconds for 1 minute)
6. **Click Save**
7. **Navigate to a regular website** (not chrome:// pages)
8. **Wait for the interval** to pass and check your Home Assistant logs to confirm data is being sent

## Verifying It Works

### Check Browser Console
Open the extension's service worker console:
1. Go to `chrome://extensions/`
2. Enable "Developer mode"
3. Click "service worker" link under your extension
4. Look for console messages:
   - "Initializing auto-update: enabled=true, interval=60s"
   - "Setting up auto-update alarm with interval: 60 seconds"
   - "Auto-update alarm triggered, sending active tab..."

### Check Home Assistant Logs
In Home Assistant, create an automation that listens to your webhook and logs the data:

```yaml
automation:
  - alias: "Log Browser Extension Data"
    trigger:
      - platform: webhook
        webhook_id: your-webhook-id-here
    action:
      - service: system_log.write
        data:
          message: "Received from browser: {{ trigger.json.title }} - {{ trigger.json.url }}"
          level: info
```

## Disabling Auto-Update

To disable auto-update:
1. Open the options page
2. Uncheck "Enable Auto-Update"
3. Click Save

The alarm will be cleared and no more automatic sends will occur.

## Code Changes Summary

### Files Modified:
- `package/manifest.json`: Added "alarms" permission
- `package/options.html`: Added auto-update checkbox and interval input
- `package/options.js`: Added save/load/validate logic for auto-update settings
- `package/background.js`: Added auto-update alarm mechanism and refactored send logic

### Key Design Decisions:
1. **Chrome Alarms API**: Used instead of `setInterval()` because service workers can be terminated, and alarms persist across worker restarts
2. **Silent updates**: Disabled notifications for auto-updates to avoid spamming
3. **Reusable send function**: Extracted `sendActiveTabToHomeAssistant()` so both manual and automatic sends use the same logic
4. **Settings sync**: Auto-update settings are stored in `chrome.storage.sync` for cross-device synchronization
5. **Minimum interval validation**: Enforced 5-second minimum in the UI, though Chrome enforces 1 minute minimum in production

## Future Enhancements (Optional)

Consider these improvements:
1. **Better interval presets**: Add quick-select buttons (1 min, 5 min, 15 min, 30 min)
2. **Pause/resume**: Add a quick toggle to pause auto-update without changing settings
3. **Last update timestamp**: Show when the last auto-update occurred
4. **Error logging**: Track and display auto-update errors in the options page
5. **Tab filtering**: Allow users to exclude certain URLs or domains from auto-update
6. **Schedule windows**: Only send during certain hours (e.g., work hours)
