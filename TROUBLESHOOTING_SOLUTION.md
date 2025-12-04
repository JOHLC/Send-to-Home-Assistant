# Troubleshooting Solution

## 🔴 CRITICAL: You MUST Reload the Extension

After modifying the `manifest.json` to add the "alarms" permission, Chrome requires a **complete extension reload** for the new permissions to take effect. Simply closing and reopening the browser is not enough.

## ✅ Step-by-Step Solution

### 1. Reload the Extension (REQUIRED)

1. Open `chrome://extensions/`
2. Find "Send to Home Assistant"
3. Click the **circular reload icon** button
   - OR toggle the extension OFF, then ON again
4. Verify it reloaded by checking the service worker logs (see step 2)

### 2. Verify Service Worker Restarted

1. On the extensions page, click **"service worker"** link (under "Inspect views")
2. Check the console for initialization messages:
   ```
   Initializing auto-update: enabled=false, interval=60s
   Auto-update alarm cleared
   ```
3. If you don't see these messages, the service worker hasn't restarted

### 3. Run Diagnostic Script

1. In the service worker console, paste the contents of `TEST_SCRIPT.js`
2. Press Enter to run it
3. Review the output for any ❌ errors or ⚠️ warnings
4. The script will tell you exactly what's wrong

**Quick diagnostic:** Copy and paste this one-liner:

```javascript
chrome.permissions.getAll(p => console.log('Has alarms permission:', p.permissions.includes('alarms')))
```

If it says `false`, the extension wasn't reloaded properly.

### 4. Reconfigure Settings

1. Right-click extension icon → **Options**
2. Verify all settings are still present:
   - Home Assistant host
   - SSL enabled/disabled
   - Webhook ID
   - User name (optional)
   - Device name (optional)
3. **Enable "Enable Auto-Update"** checkbox
4. Set **Update Interval** (e.g., 60 seconds)
5. Click **Save**

### 5. Verify Alarm Creation

After saving, check the service worker console for:

```
Settings changed, updating auto-update alarm...
Setting up auto-update alarm with interval: 60 seconds (1 minutes)
Auto-update alarm created successfully
```

Then verify the alarm exists:

```javascript
chrome.alarms.getAll(alarms => console.log('Alarms:', alarms))
```

Expected output:
```javascript
[{name: "ha-auto-update", periodInMinutes: 1, scheduledTime: 1733...}]
```

### 6. Test Popup Functionality

1. Navigate to a **regular website** (e.g., `google.com`)
   - NOT chrome://, edge://, about:, or extension pages
2. Click the extension icon
3. Popup should open and show "Sending..."
4. Should quickly change to "Link sent to Home Assistant!"
5. Should show preview of sent data

**If popup fails:**
- Open browser console (F12) while popup is open
- Check for error messages
- Verify you're not on a restricted page

### 7. Test Auto-Update

1. Make sure you're on a regular website
2. Wait for the interval to pass (e.g., 60 seconds)
3. Check service worker console for:
   ```
   Auto-update alarm triggered at 2025-12-04T...
   Auto-update result: sent
   ```

4. Check Home Assistant logs to confirm data was received

## 🐛 Common Issues & Solutions

### Issue: "Popup fails to get webpage info"

**Cause:** Extension not reloaded after manifest change

**Solution:**
1. Reload extension completely
2. Verify alarms permission exists (see diagnostic script)
3. Test on a regular website (not chrome:// pages)

### Issue: "Auto-update not working"

**Causes & Solutions:**

1. **Alarm not created**
   - Reload extension
   - Re-save settings in options page
   - Check service worker console for errors

2. **Alarm created but not firing**
   - Interval must be ≥ 60 seconds (Chrome limitation)
   - Wait a full minute for first trigger
   - Check alarm exists: `chrome.alarms.getAll(console.log)`

3. **Alarm firing but failing to send**
   - Must have a regular website open (not chrome:// pages)
   - Webhook must be configured correctly
   - Check service worker console for error messages

### Issue: "Settings not saving"

**Solution:**
1. Clear all settings: Options page → "Clear Config"
2. Reload extension
3. Reconfigure everything from scratch
4. Test webhook before enabling auto-update

## 🧪 Manual Testing Commands

### Test if alarm is working:
```javascript
// Check alarm status
chrome.alarms.get('ha-auto-update', alarm => {
  if (alarm) {
    console.log('✅ Alarm exists');
    console.log('Next trigger in', Math.round((alarm.scheduledTime - Date.now()) / 1000), 'seconds');
  } else {
    console.error('❌ Alarm not found');
  }
});
```

### Manually trigger auto-update:
```javascript
// Force trigger the alarm (for testing)
chrome.tabs.query({ active: true, currentWindow: true }, async tabs => {
  if (tabs[0]) {
    console.log('Testing send for tab:', tabs[0].url);
    
    const result = await ExtensionUtils.sendToHomeAssistant({
      tab: tabs[0],
      showNotifications: false
    });
    
    console.log('Result:', result);
  }
});
```

### Reset alarm:
```javascript
// Clear and recreate alarm
chrome.alarms.clear('ha-auto-update', () => {
  chrome.storage.sync.get(['autoUpdate', 'updateInterval'], data => {
    if (data.autoUpdate && data.updateInterval) {
      const intervalMinutes = data.updateInterval / 60;
      chrome.alarms.create('ha-auto-update', {
        delayInMinutes: intervalMinutes,
        periodInMinutes: intervalMinutes
      });
      console.log('✅ Alarm recreated');
    }
  });
});
```

## 📋 Checklist Before Asking for Help

- [ ] Extension was reloaded after modifying manifest.json
- [ ] Alarms permission exists (`chrome.permissions.getAll()`)
- [ ] Webhook is configured in options (host + ID)
- [ ] Auto-update is enabled in options
- [ ] Settings were saved (clicked Save button)
- [ ] Alarm exists (`chrome.alarms.getAll()`)
- [ ] Currently on a regular website (not chrome://)
- [ ] Waited at least 60 seconds for alarm to trigger
- [ ] Checked service worker console for errors
- [ ] Ran diagnostic script (TEST_SCRIPT.js)

## 📸 What Good Logs Look Like

### On Extension Load:
```
Initializing auto-update: enabled=true, interval=60s
Setting up auto-update alarm with interval: 60 seconds (1 minutes)
Auto-update alarm created successfully
```

### On Settings Save:
```
Settings changed, updating auto-update alarm...
Setting up auto-update alarm with interval: 60 seconds (1 minutes)
Auto-update alarm created successfully
```

### On Alarm Trigger:
```
Auto-update alarm triggered at 2025-12-04T12:34:56.789Z
Auto-update result: sent
```

### On Manual Popup Send:
```
(in popup context - check browser console F12)
Sending to Home Assistant...
Sent to Home Assistant!
```

## 🆘 Still Not Working?

If you've followed all steps and it still doesn't work:

1. **Collect debug info:**
   - Run diagnostic script (TEST_SCRIPT.js)
   - Copy ALL output from service worker console
   - Note your Chrome version (`chrome://version`)
   - Note extension version (shown in options page)

2. **Try complete reset:**
   ```javascript
   // Clear everything and start fresh
   chrome.storage.sync.clear(() => {
     chrome.alarms.clearAll(() => {
       console.log('Everything cleared. Reload extension and reconfigure.');
     });
   });
   ```

3. **Check file integrity:**
   - Verify `manifest.json` contains `"alarms"` in permissions array
   - Verify `background.js` contains the auto-update code
   - Verify `options.html` has the auto-update checkbox and interval input

4. **Report issue with:**
   - Complete diagnostic output
   - Console logs
   - Steps to reproduce
   - Chrome and extension versions
