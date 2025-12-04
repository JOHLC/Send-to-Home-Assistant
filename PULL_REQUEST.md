# Add Optional Auto-Update Feature

## Description
Adds an optional auto-update feature that automatically sends the active tab's information to the configured Home Assistant webhook at a user-specified interval. This feature is disabled by default and must be explicitly enabled in the extension options.

## Type of Change
- [ ] 🐛 Bug fix (non-breaking change which fixes an issue)
- [X] ✨ New feature (non-breaking change which adds functionality)
- [ ] 💥 Breaking change (fix or feature that would cause existing functionality to not work as expected)
- [ ] 📚 Documentation update
- [ ] 🔧 Configuration change
- [ ] ♻️ Code refactoring (no functional changes)
- [ ] 🧪 Tests

## Changes Made

### New Features
- **Auto-update toggle**: Checkbox in options to enable/disable automatic updates
- **Configurable interval**: Number input to set update frequency in seconds (minimum 60s recommended)
- **Silent operation**: Auto-updates run in background without showing notifications to avoid spam
- **Persistent scheduling**: Uses Chrome Alarms API to survive browser and service worker restarts

### Files Modified

#### `manifest.json`
- Added `"alarms"` permission for Chrome Alarms API

#### `options.html`
- Added "Enable Auto-Update" checkbox
- Added "Update Interval (seconds)" number input (min: 5, default: 60)
- Interval input visibility toggles based on checkbox state

#### `options.js`
- Added `autoUpdate` (boolean) and `updateInterval` (number) to configuration
- Added validation: interval must be ≥ 5 seconds
- Added settings save/load for new options
- Sends `settings-changed` message to background script when saved
- Clears auto-update settings when "Clear Config" is clicked

#### `background.js`
- **New function**: `sendActiveTabToHomeAssistant()` - Reusable function that queries for active tab and sends data (used by both auto-update and manual sends)
- **New function**: `setupAutoUpdateAlarm(enabled, intervalSeconds)` - Creates or clears Chrome alarm based on settings
- **New function**: `handleAutoUpdateAlarm(alarm)` - Handles alarm triggers and initiates sending with silent mode
- **New function**: `initializeAutoUpdate()` - Loads settings and sets up alarm on extension startup
- Added listener for `settings-changed` messages from options page
- Added alarm initialization on extension startup and browser startup
- Auto-updates send silently (no notifications or page alerts)

#### `utils.js`
- **Fixed**: `createPageInfo()` function made self-contained for proper Chrome script injection
  - Removed default parameters (incompatible with script serialization)
  - Removed spread operators (incompatible with script serialization)
  - Added inline implementations of `getFavicon()` and `getSelectedText()`
  - Uses traditional JavaScript syntax for compatibility
  - Added try-catch blocks for graceful error handling
- **Enhanced**: Added detailed error logging for script execution failures
- **Enhanced**: Added `world: 'ISOLATED'` parameter for better script injection compatibility

### Documentation
- Created `AUTO_UPDATE_FEATURE.md` with comprehensive documentation including:
  - User guide (how to enable/disable)
  - Technical implementation details
  - Architecture and data flow diagrams
  - Known limitations
  - Privacy & security information
  - Troubleshooting guide
  - Development notes

## Testing
- [X] I have tested these changes locally
- [X] I have tested the extension in Chrome/Edge
- [X] I have tested the Home Assistant webhook integration (if applicable)
- [X] I have verified that no XSS or security vulnerabilities are introduced

### Testing Performed
1. ✅ Manual sends (popup and context menu) work correctly
2. ✅ Auto-update enables/disables properly via options
3. ✅ Alarm is created and fires at specified intervals
4. ✅ Active tab data is sent to Home Assistant webhook
5. ✅ Auto-updates are silent (no notifications shown)
6. ✅ Restricted pages (chrome://, edge://) are handled gracefully
7. ✅ Settings persist across browser restarts
8. ✅ Extension reloads properly after manifest changes
9. ✅ Script injection works on regular websites
10. ✅ Error handling works for various edge cases

### Test Cases Covered
- Enable auto-update → wait for interval → verify data sent to HA
- Disable auto-update → verify alarm is cleared
- Change interval → verify alarm is updated
- Test on regular websites (google.com, github.com) → works
- Test on restricted pages (chrome://) → fails silently as expected
- Clear config → verify auto-update settings are reset
- Browser restart → verify alarm persists and re-initializes
- Extension reload → verify settings are maintained

## Screenshots

### Options Page - Auto-Update Controls
The new auto-update section in the options page with checkbox and interval input:

![Auto-Update Options](assets/auto-update-options.png)
<!-- Shows the "Enable Auto-Update" checkbox and "Update Interval (seconds)" input -->

### Service Worker Console - Auto-Update Running
Console output showing auto-update working correctly:

```
Initializing auto-update: enabled=true, interval=60s
Setting up auto-update alarm with interval: 60 seconds (1 minutes)
Auto-update alarm created successfully
Auto-update alarm triggered at 2025-12-04T...
Auto-update result: sent
```

## Checklist
- [X] My code follows the existing code style
- [X] I have performed a self-review of my changes
- [X] I have commented my code, particularly in hard-to-understand areas
- [X] My changes generate no new warnings or errors
- [X] I have tested edge cases and error conditions
- [X] Any dependent changes have been merged and published

## Related Issues
<!-- If this addresses any open issues, link them here -->
<!-- Example: Fixes #123, Closes #456 -->

## Additional Notes

### Important Implementation Details

1. **Chrome Alarms API Limitation**: Chrome enforces a minimum 60-second interval for periodic alarms in production. While the UI allows entering values as low as 5 seconds (for development testing), users should be advised to use ≥ 60 seconds for reliable operation.

2. **Script Injection Compatibility**: The `createPageInfo()` function was refactored to be self-contained because Chrome's `scripting.executeScript()` serializes functions before injection. Modern JavaScript features like default parameters and spread operators don't serialize correctly, so the function now uses traditional syntax.

3. **Silent Operation**: Auto-updates intentionally do not show notifications or page alerts to prevent spamming the user every interval. This is a deliberate UX decision. Manual sends still show all notifications as expected.

4. **Backward Compatibility**: This feature is completely optional and disabled by default. Existing users will see no behavior changes unless they explicitly enable auto-update. All existing functionality (manual sends via icon click and context menu) remains unchanged.

5. **Security**: Auto-update uses the same data collection and sending mechanisms as manual sends. No new permissions beyond `alarms` were required. The feature respects all existing security restrictions (cannot access chrome://, edge://, etc.).

### Future Enhancement Opportunities

Potential improvements for future PRs:
- Add pause/resume toggle for quick enable/disable
- Add URL/domain filtering to exclude certain sites
- Add scheduling windows (only auto-update during specific hours)
- Display last update timestamp in options
- Add error tracking and display in options
- Add interval preset buttons (1m, 5m, 15m, 30m)

### Migration Notes

No migration is needed. The feature adds two new storage keys:
- `autoUpdate` (boolean, default: false)
- `updateInterval` (number, default: 60)

These are only set when the user explicitly configures auto-update.

---

Thank you for reviewing this PR! Please let me know if you have any questions or if any changes are needed.
