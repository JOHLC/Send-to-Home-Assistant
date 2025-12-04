# Quick Fix Guide

## The Problem
After adding the "alarms" permission to the manifest, the extension needs to be completely reloaded for the changes to take effect.

## Solution: Reload the Extension

### Step 1: Reload Extension
1. Open `chrome://extensions/`
2. Find "Send to Home Assistant"
3. Click the **reload icon** (circular arrow) button
4. **OR** toggle the extension off and back on

### Step 2: Verify Reload Worked
1. Click "service worker" link under the extension
2. You should see fresh console logs:
   ```
   Initializing auto-update: enabled=false, interval=60s
   Auto-update alarm cleared
   ```

### Step 3: Reconfigure Settings
1. Right-click extension icon → Options
2. Verify all settings are still saved
3. Enable "Enable Auto-Update" checkbox
4. Set interval (e.g., 60 seconds)
5. Click **Save**

### Step 4: Verify Alarm Was Created
1. Go back to service worker console
2. Look for this message:
   ```
   Settings changed, updating auto-update alarm...
   Setting up auto-update alarm with interval: 60 seconds
   Auto-update alarm created successfully
   ```

3. Run this command in the console:
   ```javascript
   chrome.alarms.getAll(console.log)
   ```
   
4. Should show:
   ```javascript
   [{name: "ha-auto-update", periodInMinutes: 1, scheduledTime: ...}]
   ```

### Step 5: Test the Popup
1. Navigate to any regular website (e.g., google.com)
2. Click the extension icon
3. Popup should open and automatically send the page data
4. Should show "Link sent to Home Assistant!"

## If It Still Doesn't Work

### Check Active Alarms
```javascript
chrome.alarms.getAll(alarms => {
  console.log('Active alarms:', alarms);
  if (!alarms.length) {
    console.error('No alarms found! Auto-update not configured.');
  }
});
```

### Check Settings
```javascript
chrome.storage.sync.get(['autoUpdate', 'updateInterval'], data => {
  console.log('Settings:', data);
});
```

### Manually Trigger Auto-Update
```javascript
chrome.tabs.query({ active: true, currentWindow: true }, async tabs => {
  console.log('Active tab:', tabs[0]?.url);
  
  // If you get a result, manually test the send
  if (tabs[0]) {
    console.log('Tab found, would send to HA');
  }
});
```

### Force Alarm Reset
If the alarm isn't working, force reset it:

```javascript
// In service worker console
chrome.alarms.clear('ha-auto-update', () => {
  chrome.storage.sync.get(['autoUpdate', 'updateInterval'], data => {
    if (data.autoUpdate) {
      const intervalMinutes = data.updateInterval / 60;
      chrome.alarms.create('ha-auto-update', {
        delayInMinutes: intervalMinutes,
        periodInMinutes: intervalMinutes
      });
      console.log('Alarm recreated');
    }
  });
});
```

## Testing Auto-Update

1. Enable auto-update with 60-second interval
2. Navigate to a regular website
3. Open service worker console
4. Wait 1 minute
5. Should see: "Auto-update alarm triggered at [timestamp]"

## Common Mistakes

### ❌ Interval Too Short
- Chrome requires minimum 1 minute (60 seconds) for periodic alarms
- Setting 5-59 seconds will create an alarm but it may not fire reliably

### ❌ On Restricted Page
- Auto-update won't work on chrome://, edge://, about:, or extension pages
- Navigate to a real website

### ❌ Extension Not Reloaded
- After manifest changes, MUST reload extension
- Settings changes alone aren't enough

### ❌ No Active Tab
- If no tab is active or only restricted tabs are open, auto-update will silently fail

## Verify Everything is Working

Run this complete diagnostic in the service worker console:

```javascript
(async function diagnose() {
  console.log('=== DIAGNOSTIC START ===');
  
  // Check permissions
  const permissions = await chrome.permissions.getAll();
  console.log('Permissions:', permissions.permissions);
  if (!permissions.permissions.includes('alarms')) {
    console.error('❌ ALARMS permission missing! Reload extension.');
  } else {
    console.log('✅ Alarms permission OK');
  }
  
  // Check settings
  chrome.storage.sync.get(['autoUpdate', 'updateInterval', 'haHost', 'webhookId'], data => {
    console.log('Settings:', data);
    if (!data.autoUpdate) {
      console.warn('⚠️ Auto-update disabled in settings');
    } else {
      console.log('✅ Auto-update enabled');
    }
    
    if (!data.haHost || !data.webhookId) {
      console.error('❌ Webhook not configured');
    } else {
      console.log('✅ Webhook configured');
    }
    
    if (data.updateInterval < 60) {
      console.warn('⚠️ Interval <60s may not work in production');
    }
  });
  
  // Check alarms
  chrome.alarms.getAll(alarms => {
    console.log('Alarms:', alarms);
    const autoAlarm = alarms.find(a => a.name === 'ha-auto-update');
    if (!autoAlarm) {
      console.error('❌ Auto-update alarm not found');
    } else {
      console.log('✅ Auto-update alarm exists');
      console.log('  Next trigger:', new Date(autoAlarm.scheduledTime));
    }
  });
  
  // Check active tab
  chrome.tabs.query({ active: true, currentWindow: true }, tabs => {
    if (!tabs[0]) {
      console.error('❌ No active tab');
    } else {
      console.log('✅ Active tab:', tabs[0].url);
      if (tabs[0].url.startsWith('chrome://') || tabs[0].url.startsWith('edge://')) {
        console.warn('⚠️ Active tab is restricted page');
      }
    }
  });
  
  console.log('=== DIAGNOSTIC END ===');
})();
```

Expected output:
```
=== DIAGNOSTIC START ===
Permissions: ["storage", "scripting", "activeTab", "contextMenus", "notifications", "alarms"]
✅ Alarms permission OK
Settings: {autoUpdate: true, updateInterval: 60, haHost: "...", webhookId: "..."}
✅ Auto-update enabled
✅ Webhook configured
Alarms: [{name: "ha-auto-update", periodInMinutes: 1, ...}]
✅ Auto-update alarm exists
  Next trigger: Wed Dec 04 2025 ...
✅ Active tab: https://...
=== DIAGNOSTIC END ===
```

If you see any ❌ errors, that's your problem!
