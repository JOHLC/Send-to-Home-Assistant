# Debugging Guide - Auto-Update Issues

## Issue Reports
1. Extension popup failing to get webpage info when clicked
2. Auto-update not sending data at the specified interval

## Debugging Steps

### Step 1: Check Service Worker Console

1. Open Chrome and go to `chrome://extensions/`
2. Enable "Developer mode" (toggle in top right)
3. Find "Send to Home Assistant" extension
4. Click the "service worker" link (under "Inspect views")
5. Check the console for errors or messages

#### Expected Messages on Extension Load:
```
Initializing auto-update: enabled=true, interval=60s
Setting up auto-update alarm with interval: 60 seconds (1 minutes)
Auto-update alarm created successfully
```

#### Expected Messages Every Interval:
```
Auto-update alarm triggered at 2025-12-04T...
Auto-update result: sent
```

#### If You See Errors:
Note down the exact error messages.

### Step 2: Check Alarm Status

In the service worker console, run this command:

```javascript
chrome.alarms.getAll(alarms => {
  console.log('Active alarms:', alarms);
});
```

**Expected output:**
```javascript
Active alarms: [{
  name: "ha-auto-update",
  periodInMinutes: 1,
  scheduledTime: ...
}]
```

**If alarm is missing:** The alarm wasn't created properly.

### Step 3: Check Stored Settings

In the service worker console, run:

```javascript
chrome.storage.sync.get(['autoUpdate', 'updateInterval', 'haHost', 'webhookId'], data => {
  console.log('Stored settings:', data);
});
```

**Expected output:**
```javascript
{
  autoUpdate: true,
  updateInterval: 60,
  haHost: "your-ha-host",
  webhookId: "your-webhook-id"
}
```

### Step 4: Test Popup Manually

1. Open the extension popup by clicking the extension icon
2. Open the browser console (F12) while popup is open
3. Check for errors in the console

**Common issues:**
- "No active tab found" - popup opened on a non-webpage
- "This extension cannot send data from browser internal pages" - on chrome:// page
- Network errors - webhook not reachable

### Step 5: Test Auto-Update Manually

In the service worker console, run:

```javascript
// Trigger the alarm manually
chrome.alarms.get('ha-auto-update', alarm => {
  if (alarm) {
    chrome.alarms.onAlarm.dispatch(alarm);
  } else {
    console.error('Alarm not found!');
  }
});
```

This should trigger the auto-update immediately and show any errors.

### Step 6: Check Permissions

In the service worker console, run:

```javascript
chrome.permissions.getAll(permissions => {
  console.log('Granted permissions:', permissions);
});
```

**Must include:** `["storage", "scripting", "activeTab", "contextMenus", "notifications", "alarms"]`

## Common Issues & Fixes

### Issue 1: Alarm Not Being Created

**Symptoms:**
- `chrome.alarms.getAll()` returns empty array
- No "Auto-update alarm created successfully" message

**Possible causes:**
1. Auto-update not enabled in settings
2. Update interval < 5 seconds (invalid)
3. Settings not saving properly

**Fix:**
1. Open options page
2. Enable "Enable Auto-Update"
3. Set interval to 60 seconds
4. Click Save
5. Check service worker console for "Settings changed, updating auto-update alarm..."

### Issue 2: Alarm Created But Not Firing

**Symptoms:**
- Alarm appears in `chrome.alarms.getAll()`
- No "Auto-update alarm triggered" messages

**Possible causes:**
1. Chrome Alarms API minimum interval (1 minute) not met
2. Service worker terminated and alarm lost

**Fix:**
1. Make sure interval is ≥ 60 seconds (1 minute)
2. Reload the extension to restart the service worker

### Issue 3: Alarm Firing But Send Failing

**Symptoms:**
- "Auto-update alarm triggered" message appears
- "Auto-update result: error" message appears
- Data not reaching Home Assistant

**Possible causes:**
1. No active tab (or restricted page)
2. Webhook not configured
3. Network error

**Fix:**
1. Make sure you have a regular webpage open (not chrome://)
2. Verify webhook settings in options page
3. Check Home Assistant is reachable

### Issue 4: Popup Not Working

**Symptoms:**
- Clicking extension icon shows popup but it fails
- Error messages in popup

**Possible causes:**
1. On a restricted page (chrome://, edge://, etc.)
2. Webhook settings missing
3. Scripting permission issues

**Fix:**
1. Navigate to a regular website (e.g., google.com)
2. Verify webhook settings in options page
3. Check browser console for specific errors

## Getting More Debug Info

Add this to the service worker console to see detailed logs:

```javascript
// Enable verbose logging
chrome.storage.onChanged.addListener((changes, namespace) => {
  console.log('Storage changed:', changes, namespace);
});

chrome.tabs.onActivated.addListener((activeInfo) => {
  chrome.tabs.get(activeInfo.tabId, (tab) => {
    console.log('Active tab changed:', tab.url);
  });
});
```

## Reporting Issues

If the issue persists, provide:

1. **Console logs** from service worker (copy all messages)
2. **Alarm status** output from `chrome.alarms.getAll()`
3. **Settings** output from `chrome.storage.sync.get()`
4. **Chrome version** (chrome://version/)
5. **Extension version** (shown in options page)
6. **Steps to reproduce** the issue

## Quick Fixes to Try

### Reset Everything:

1. Open options page
2. Click "Clear Config"
3. Reload extension (chrome://extensions/ → reload button)
4. Reconfigure settings
5. Test again

### Force Alarm Recreation:

In service worker console:

```javascript
chrome.alarms.clearAll(() => {
  chrome.storage.sync.get(['autoUpdate', 'updateInterval'], data => {
    const enabled = data.autoUpdate || false;
    const interval = data.updateInterval || 60;
    
    if (enabled && interval >= 5) {
      const intervalMinutes = interval / 60;
      chrome.alarms.create('ha-auto-update', {
        delayInMinutes: intervalMinutes,
        periodInMinutes: intervalMinutes
      });
      console.log('Alarm recreated');
    }
  });
});
```

### Test Send Function Directly:

In service worker console:

```javascript
chrome.tabs.query({ active: true, currentWindow: true }, async tabs => {
  if (!tabs[0]) {
    console.error('No active tab');
    return;
  }
  
  const tab = tabs[0];
  console.log('Testing send with tab:', tab.url);
  
  // This assumes ExtensionUtils is available
  const result = await ExtensionUtils.sendToHomeAssistant({
    tab,
    showNotifications: false
  });
  
  console.log('Send result:', result);
});
```
