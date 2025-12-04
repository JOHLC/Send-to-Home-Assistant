# Debug Steps - Enhanced Logging Added

## What I Changed

I added detailed logging to help diagnose the exact issue:

1. **In `background.js`**: Logs the active tab info (ID, URL, title)
2. **In `utils.js`**: Logs script execution results and detailed error messages

## How to Debug

### Step 1: Reload Extension
1. Go to `chrome://extensions/`
2. Click reload on "Send to Home Assistant"

### Step 2: Open Service Worker Console
1. On extensions page, click **"service worker"** link
2. Keep this console open

### Step 3: Test on a Regular Website
1. Open a **new tab** with a regular website (e.g., `https://www.google.com`)
2. Make sure this tab is **active** (in focus)
3. Wait for auto-update to trigger (or click extension icon to test manually)

### Step 4: Check Console Output

You should now see much more detailed output. Please share what you see:

#### Expected Good Output:
```
Active tab for send: {id: 123, url: "https://www.google.com", title: "Google"}
Script execution results: [{result: {...}}]
Auto-update result: sent
```

#### Possible Error Outputs:

**If on restricted page:**
```
Active tab for send: {id: 123, url: "chrome://extensions/", title: "Extensions"}
Restricted page: chrome://extensions/
```
**Solution:** Navigate to a regular website (not chrome://, edge://, about:)

**If no active tab:**
```
Active tab for send: NONE
No active tab: Error: No active tab found
```
**Solution:** Make sure a browser window with a regular tab is open and active

**If script execution fails:**
```
Active tab for send: {id: 123, url: "https://example.com", title: "..."}
Script execution results: [{error: "..."}]
Script execution failed: Error: ...
```
**This tells us the specific problem with script injection**

## Common Scenarios

### Scenario 1: You're on chrome:// pages
**Symptom:** "Restricted page" warning in console

**Solution:** 
- Extensions cannot access chrome://, edge://, about:, or extension pages
- Navigate to a regular website like google.com, github.com, etc.

### Scenario 2: No browser window is active
**Symptom:** "No active tab found" or tab is null

**Solution:**
- Make sure a browser window is open and in focus
- Auto-update only works when a window is active

### Scenario 3: Script injection permissions issue
**Symptom:** Script execution fails with permission error

**Solution:**
- Check that manifest has "activeTab" and "scripting" permissions (should be present)
- Some sites block all extensions (rare)

### Scenario 4: The createPageInfo function is failing
**Symptom:** Script execution returns empty result

**Solution:**
- This would indicate an issue inside createPageInfo
- Should see specific error in the results log

## What to Share

After following the steps above, please share:

1. **What URL/page you're testing on:**
   - Example: "https://www.google.com"

2. **The complete console output**, especially:
   ```
   Active tab for send: ...
   Script execution results: ...
   ```

3. **Any error messages** you see

4. **When does it fail:**
   - On auto-update?
   - On manual click?
   - Both?

## Quick Tests

### Test 1: Simple Page
1. Open new tab: `https://www.google.com`
2. Keep it active (in focus)
3. Click extension icon OR wait for auto-update
4. Check console output

### Test 2: GitHub Page
1. Open new tab: `https://github.com`
2. Keep it active
3. Click extension icon OR wait for auto-update
4. Check console output

### Test 3: Different Window
1. Close all other browser windows
2. Open ONE window with google.com
3. Keep this window in focus
4. Wait for auto-update
5. Check console output

## Reset Everything (If Needed)

If you want to start completely fresh:

```javascript
// Paste in service worker console:
chrome.storage.sync.clear(() => {
  chrome.alarms.clearAll(() => {
    console.log('Everything cleared. Reload extension and reconfigure.');
  });
});
```

Then:
1. Reload extension
2. Reconfigure in options
3. Test again

## Checking If Script Injection Works At All

Test if script injection works on the current page:

```javascript
// Paste in service worker console:
chrome.tabs.query({active: true, currentWindow: true}, async tabs => {
  if (!tabs[0]) {
    console.error('No active tab');
    return;
  }
  
  console.log('Testing on tab:', tabs[0].url);
  
  try {
    const results = await chrome.scripting.executeScript({
      target: {tabId: tabs[0].id},
      func: () => {
        return {
          title: document.title,
          url: window.location.href
        };
      }
    });
    
    console.log('✅ Script injection works!', results);
  } catch (error) {
    console.error('❌ Script injection failed:', error);
  }
});
```

If this simple test fails, it means the page you're on doesn't allow script injection at all.
