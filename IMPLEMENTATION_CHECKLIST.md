# Auto-Update Feature - Implementation Checklist

## ✅ Completed Tasks

### 1. ✅ Manifest Updates
- [x] Added "alarms" permission to `manifest.json`
- [x] No linter errors

### 2. ✅ Options Page UI (`options.html`)
- [x] Added "Enable Auto-Update" checkbox with ID `autoUpdateToggle`
- [x] Added "Update Interval" number input with ID `updateInterval`
- [x] Interval input is wrapped in a div with ID `autoUpdateIntervalDiv`
- [x] Default interval set to 60 seconds, minimum 5 seconds
- [x] Properly styled and integrated with existing options

### 3. ✅ Options Script (`options.js`)
- [x] Added DOM element references: `autoUpdateToggle`, `updateIntervalInput`, `autoUpdateIntervalDiv`
- [x] Updated `loadSavedConfiguration()` to load `autoUpdate` and `updateInterval` from storage
- [x] Updated `getFormConfiguration()` to include `autoUpdate` and `updateInterval`
- [x] Updated `validateConfiguration()` to validate interval is at least 5 seconds
- [x] Updated `saveConfiguration()` to save auto-update settings and notify background script
- [x] Updated `handleClearConfig()` to clear auto-update settings
- [x] Added `toggleAutoUpdateInterval()` to show/hide interval input based on checkbox
- [x] Added event listener for auto-update toggle change
- [x] No linter errors

### 4. ✅ Background Script (`background.js`)
- [x] Created reusable `sendActiveTabToHomeAssistant(options)` function
- [x] Function accepts optional parameters for `showPageAlert` and `showNotifications`
- [x] Function gets active tab and sends it to Home Assistant
- [x] Function handles restricted pages
- [x] Added `AUTO_UPDATE_ALARM_NAME` constant
- [x] Implemented `setupAutoUpdateAlarm(enabled, intervalSeconds)` function
- [x] Implemented `handleAutoUpdateAlarm(alarm)` function
- [x] Implemented `initializeAutoUpdate()` function
- [x] Added `chrome.alarms.onAlarm` listener
- [x] Added message listener for 'settings-changed' events from options page
- [x] Auto-update initializes on extension startup
- [x] Auto-update initializes on browser startup
- [x] Auto-updates are silent (no notifications or page alerts)
- [x] No linter errors

## 🎯 Feature Behavior

### When Auto-Update is Enabled:
1. User checks "Enable Auto-Update" in options
2. User sets interval (e.g., 60 seconds)
3. User clicks "Save"
4. Background script receives `settings-changed` message
5. Background script creates a Chrome alarm with the specified interval
6. Every interval, the alarm fires and sends active tab data to Home Assistant
7. Sends are silent (no notifications to avoid spam)

### When Auto-Update is Disabled:
1. User unchecks "Enable Auto-Update" in options
2. User clicks "Save"
3. Background script clears the alarm
4. No more automatic sends occur

### Manual Sends (Unchanged):
- Extension icon click: Shows notifications and page alerts
- Context menu: Shows notifications and page alerts

## 📝 Key Implementation Details

### Storage Keys:
- `autoUpdate`: Boolean indicating if auto-update is enabled
- `updateInterval`: Number of seconds between updates (minimum 5)

### Chrome Alarms API:
- Alarm name: `ha-auto-update`
- Uses `periodInMinutes` for recurring alarms
- Interval is converted from seconds to minutes (`intervalSeconds / 60`)
- Note: Chrome enforces minimum 1 minute in production builds

### Message Types:
- `settings-changed`: Sent from options.js to background.js when settings are saved
  - Includes `autoUpdate` and `updateInterval` fields

### Silent Updates:
Auto-updates call `sendActiveTabToHomeAssistant()` with:
- `showPageAlert: false`
- `showNotifications: false`

This prevents spamming the user with notifications every interval.

## 🧪 Testing Instructions

### Manual Testing:
1. Load the extension in Chrome
2. Open options page
3. Configure Home Assistant settings
4. Enable auto-update with 60-second interval
5. Save settings
6. Open extension service worker console (`chrome://extensions/` → Service worker link)
7. Verify console logs show alarm initialization
8. Navigate to a regular website
9. Wait 1 minute and check Home Assistant logs for received data

### Verification Points:
- ✅ Options UI shows/hides interval input correctly
- ✅ Settings save and load correctly
- ✅ Background script initializes alarm
- ✅ Alarm fires at correct interval
- ✅ Active tab data is sent to Home Assistant
- ✅ No notifications or page alerts during auto-update
- ✅ Manual sends still show notifications
- ✅ Disabling auto-update clears the alarm

## 🔧 Debugging Tips

### Enable Console Logging:
1. Go to `chrome://extensions/`
2. Enable "Developer mode"
3. Click "service worker" link under extension
4. Watch for these messages:
   - "Initializing auto-update: enabled=true, interval=60s"
   - "Setting up auto-update alarm with interval: 60 seconds"
   - "Auto-update alarm created successfully"
   - "Auto-update alarm triggered, sending active tab..."

### Check Alarm Status:
In the service worker console, run:
```javascript
chrome.alarms.getAll(console.log)
```

Should show an alarm named "ha-auto-update" if enabled.

### Check Storage:
In the service worker console, run:
```javascript
chrome.storage.sync.get(['autoUpdate', 'updateInterval'], console.log)
```

Should show the current settings.

## 📚 Documentation

Created documentation files:
- [AUTO_UPDATE_FEATURE.md](AUTO_UPDATE_FEATURE.md): Comprehensive feature documentation
- [IMPLEMENTATION_CHECKLIST.md](IMPLEMENTATION_CHECKLIST.md): This file

## ⚠️ Known Limitations

1. **Chrome Alarms Minimum Interval**: Chrome enforces a minimum interval of 1 minute (60 seconds) for periodic alarms in production builds. Shorter intervals may work in development but not in production.

2. **Service Worker Lifecycle**: Service workers can be terminated by Chrome. The Chrome Alarms API persists across worker restarts, which is why we use it instead of `setInterval()`.

3. **Restricted Pages**: Cannot send data from `chrome://`, `edge://`, `about:`, or `extension://` pages.

4. **Active Tab Only**: Only sends the currently active tab. If user switches tabs, the next alarm will send the new active tab.

## ✨ Future Enhancement Ideas

- Add quick preset buttons for common intervals (1m, 5m, 15m, 30m)
- Add pause/resume toggle without changing settings
- Show last update timestamp in options page
- Add error tracking and display in options
- Allow URL/domain filtering for auto-update
- Add scheduling windows (e.g., only during work hours)
- Add badge counter showing successful auto-updates
