# Auto-Update Feature

## Overview

The auto-update feature allows the extension to automatically send the active tab's information to your Home Assistant webhook at a specified interval. This is useful for tracking your browsing activity, creating time-based automations, or monitoring what you're currently viewing.

## Features

- **Optional**: Disabled by default, must be explicitly enabled in settings
- **Configurable interval**: Set update frequency in seconds (minimum 60 seconds)
- **Silent operation**: Runs in the background without showing notifications
- **Respects restrictions**: Won't send data from browser internal pages (chrome://, edge://, etc.)
- **Persistent**: Uses Chrome Alarms API to survive browser restarts

## User Guide

### Enabling Auto-Update

1. Right-click the extension icon and select **Options**
2. Scroll to the **Enable Auto-Update** checkbox
3. Check the box to enable automatic updates
4. Set your desired **Update Interval** in seconds (minimum 60)
5. Click **Save**

### Disabling Auto-Update

1. Open the extension **Options**
2. Uncheck the **Enable Auto-Update** checkbox
3. Click **Save**

### Recommended Settings

- **Minimum interval**: 60 seconds (1 minute)
- **Typical use**: 300 seconds (5 minutes) or 600 seconds (10 minutes)
- **Light tracking**: 900 seconds (15 minutes) or more

**Note**: Chrome enforces a minimum interval of 60 seconds for periodic alarms. While the UI allows entering smaller values for development purposes, intervals less than 60 seconds may not work reliably in production.

## Technical Implementation

### Architecture

The auto-update feature is implemented using:

1. **Chrome Alarms API**: Provides persistent, reliable scheduled tasks that survive service worker restarts
2. **Storage API**: Saves user preferences (enabled state and interval) to `chrome.storage.sync`
3. **Tabs API**: Queries for the active tab in the current window
4. **Scripting API**: Injects code to extract page information

### Files Modified

#### `manifest.json`
- Added `"alarms"` permission

#### `options.html`
- Added checkbox: "Enable Auto-Update"
- Added number input: "Update Interval (seconds)"
- Interval input visibility toggles based on checkbox state

#### `options.js`
- Added `autoUpdate` (boolean) and `updateInterval` (number) to configuration
- Validates interval is ≥ 5 seconds
- Sends message to background script when settings change
- Clears auto-update alarm when settings are disabled

#### `background.js`
- **`sendActiveTabToHomeAssistant()`**: Reusable function that queries for active tab and sends data
- **`setupAutoUpdateAlarm()`**: Creates or clears the Chrome alarm based on settings
- **`handleAutoUpdateAlarm()`**: Handles alarm triggers and initiates sending
- **`initializeAutoUpdate()`**: Loads settings and sets up alarm on extension startup
- Listens for `settings-changed` messages from options page
- Auto-updates send silently (no notifications or page alerts)

#### `utils.js`
- **`createPageInfo()`**: Made self-contained for proper script injection
  - Uses traditional JavaScript syntax (no default parameters or spread operators)
  - Inline implementations of helper functions
  - Compatible with Chrome's script serialization

### Data Flow

1. User enables auto-update in options
2. Options page saves settings to `chrome.storage.sync`
3. Options page sends `settings-changed` message to background script
4. Background script calls `setupAutoUpdateAlarm()` with new settings
5. Chrome creates a periodic alarm with specified interval
6. When alarm fires:
   - `handleAutoUpdateAlarm()` is triggered
   - Calls `sendActiveTabToHomeAssistant()` with silent mode
   - Queries for active tab
   - Executes `createPageInfo()` in page context to extract data
   - Sends data to configured webhook
7. Repeat every interval

### Storage Keys

- `autoUpdate` (boolean): Whether auto-update is enabled
- `updateInterval` (number): Update interval in seconds

### Message Types

- `settings-changed`: Sent from options.js to background.js when settings are saved
  - Payload: `{type: 'settings-changed', autoUpdate: boolean, updateInterval: number}`

## Known Limitations

### Chrome Alarms API Constraints

- **Minimum interval**: Chrome enforces a 60-second (1 minute) minimum for periodic alarms in production
- **Development mode**: Shorter intervals may work with unpacked extensions but shouldn't be relied upon
- **Precision**: Alarms may not fire at exact intervals due to browser optimization

### Page Restrictions

Auto-update cannot send data from:
- Browser internal pages: `chrome://`, `edge://`, `about:`, etc.
- Extension pages: `chrome-extension://`, `moz-extension://`
- Some pages with strict Content Security Policy (CSP)

When auto-update encounters a restricted page, it fails silently and waits for the next interval.

### Active Tab Requirement

- Auto-update sends data for the **currently active tab** in the **focused window**
- If no browser window is active, the update is skipped
- If multiple windows are open, only the active tab in the focused window is tracked

### Performance Considerations

- Each auto-update performs a script injection into the active page
- Very short intervals (even if possible) could impact browser performance
- Recommended minimum: 60 seconds (enforced by Chrome)
- Recommended typical: 300-900 seconds (5-15 minutes)

## Privacy & Security

### Data Handling

- Auto-update uses the same data collection and sending mechanism as manual sends
- All data is sent **only** to the user-configured Home Assistant webhook
- No data is sent to third parties or external servers
- No data is collected or stored by the extension author

### What Data is Sent

Each auto-update sends:
- Page title
- Page URL
- Favicon URL
- Selected text (if any)
- Timestamp
- User agent
- User name (if configured)
- Device name (if configured)

### Silent Operation

- Auto-updates intentionally do **not** show browser notifications
- Auto-updates do **not** show in-page alerts
- This prevents notification spam every interval
- Manual sends (icon click, context menu) still show all notifications

## Troubleshooting

### Auto-Update Not Working

1. **Verify it's enabled**: Check options page, ensure checkbox is checked
2. **Check interval**: Must be ≥ 60 seconds
3. **Reload extension**: After enabling, reload the extension at `chrome://extensions`
4. **Check active tab**: Must have a regular website open (not chrome:// pages)
5. **Check service worker**: Open service worker console at `chrome://extensions` and look for alarm messages

### Verifying Auto-Update is Running

Open the service worker console (`chrome://extensions` → click "service worker"):

**On startup:**
```
Initializing auto-update: enabled=true, interval=60s
Setting up auto-update alarm with interval: 60 seconds
Auto-update alarm created successfully
```

**Every interval:**
```
Auto-update alarm triggered at [timestamp]
Auto-update result: sent
```

**If you see errors**, check that you're on a regular website, not a restricted page.

### Manual Alarm Check

In the service worker console:
```javascript
chrome.alarms.getAll(alarms => console.log('Alarms:', alarms));
```

Should show an alarm named `ha-auto-update` if enabled.

### Manual Settings Check

In the service worker console:
```javascript
chrome.storage.sync.get(['autoUpdate', 'updateInterval'], data => console.log('Settings:', data));
```

Should show your current configuration.

## Development Notes

### Testing

When developing or testing:
1. Reload extension after any code changes
2. Use service worker console for debugging
3. Test on simple pages first (e.g., google.com)
4. Verify alarm is created: `chrome.alarms.getAll()`
5. Monitor Home Assistant logs to confirm data is received

### Code Style

- Auto-update code follows the existing codebase style
- Functions are documented with JSDoc comments
- Error handling is comprehensive with console logging
- Chrome APIs are used with proper error handling

### Future Enhancements

Potential improvements:
- Pause/resume without changing settings
- URL/domain filtering (exclude certain sites)
- Scheduling windows (only during certain hours)
- Last update timestamp display
- Error tracking and reporting in options
- Interval presets (1m, 5m, 15m, 30m buttons)

## Credits

Feature implemented as a contribution to the [Send to Home Assistant](https://github.com/JOHLC/Send-to-Home-Assistant) extension.

## License

This feature is part of the Send to Home Assistant extension and follows the same license as the main project.
