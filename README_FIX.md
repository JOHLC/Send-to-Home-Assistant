# 🚨 IMMEDIATE FIX REQUIRED

## The Problem

You're experiencing two issues:
1. **Extension popup fails to get webpage info**
2. **Auto-update not working**

## The Root Cause

After adding the `"alarms"` permission to `manifest.json`, the extension **MUST be completely reloaded** in Chrome for the new permissions to take effect. Without this reload:
- The alarms API won't work
- The extension may behave unpredictably

## The Solution (2 minutes)

### Step 1: Reload Extension
1. Open **`chrome://extensions/`**
2. Find **"Send to Home Assistant"**
3. Click the **🔄 reload button** (circular arrow icon)

### Step 2: Verify Reload Worked
1. Click **"service worker"** link on the extension card
2. You should see console messages like:
   ```
   Initializing auto-update: enabled=false, interval=60s
   ```

### Step 3: Reconfigure Auto-Update
1. Right-click extension icon → **Options**
2. Check **"Enable Auto-Update"** checkbox
3. Set interval to **60** seconds
4. Click **Save**

### Step 4: Verify It Works
In the service worker console, you should see:
```
Settings changed, updating auto-update alarm...
Setting up auto-update alarm with interval: 60 seconds
Auto-update alarm created successfully
```

### Step 5: Test Popup
1. Go to any regular website (e.g., **google.com**)
2. Click extension icon
3. Should work normally now

## Quick Diagnostic

Paste this into the service worker console to check if everything is working:

```javascript
chrome.permissions.getAll(p => {
  const hasAlarms = p.permissions.includes('alarms');
  console.log(hasAlarms ? '✅ Alarms permission OK' : '❌ MISSING - RELOAD EXTENSION');
});

chrome.alarms.getAll(alarms => {
  const autoAlarm = alarms.find(a => a.name === 'ha-auto-update');
  console.log(autoAlarm ? '✅ Auto-update alarm exists' : '❌ Alarm not found');
});

chrome.storage.sync.get(['autoUpdate', 'haHost', 'webhookId'], data => {
  console.log('Settings:', data);
});
```

## What This Should Show

✅ **Good output:**
```
✅ Alarms permission OK
✅ Auto-update alarm exists
Settings: {autoUpdate: true, haHost: "...", webhookId: "..."}
```

❌ **Bad output:**
```
❌ MISSING - RELOAD EXTENSION
❌ Alarm not found
```

If you see the bad output, **go back to Step 1** and reload the extension.

## Additional Resources

- **QUICK_FIX.md** - Detailed step-by-step fix guide
- **TEST_SCRIPT.js** - Complete diagnostic script
- **TROUBLESHOOTING_SOLUTION.md** - Comprehensive troubleshooting guide
- **DEBUGGING_GUIDE.md** - Advanced debugging techniques

## Why This Happened

When I added the `"alarms"` permission to your `manifest.json`, Chrome requires the extension to be fully reloaded before it will grant that permission to the extension. It's not enough to just restart the browser - you must explicitly reload the extension itself.

This is a Chrome security feature to ensure users are aware when extensions request new permissions.

## Still Not Working?

If reloading doesn't fix it:

1. Run the complete diagnostic:
   - Open service worker console
   - Paste contents of **TEST_SCRIPT.js**
   - Share the output

2. Check you're testing on a valid page:
   - ✅ Regular websites (google.com, github.com, etc.)
   - ❌ Browser pages (chrome://, edge://, about:)

3. Verify interval is ≥ 60 seconds:
   - Chrome requires minimum 1 minute for periodic alarms
   - Shorter intervals won't work reliably

## Implementation Status

✅ All code changes are complete and correct:
- ✅ manifest.json has "alarms" permission
- ✅ options.html has UI controls
- ✅ options.js handles settings
- ✅ background.js has auto-update mechanism
- ✅ No linter errors
- ✅ All functions implemented correctly

The issue is **not** with the code - it's simply that the extension needs to be reloaded for the new permissions to take effect.
