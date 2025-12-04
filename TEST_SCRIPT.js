/**
 * Complete Diagnostic Test Script
 * 
 * Paste this entire script into the service worker console
 * (chrome://extensions → Inspect views: service worker)
 * 
 * This will check all aspects of the auto-update feature
 */

(async function runDiagnostics() {
  console.log('\n🔍 ========== AUTO-UPDATE DIAGNOSTICS ==========\n');
  
  // Test 1: Check Permissions
  console.log('📋 TEST 1: Checking Permissions...');
  try {
    const perms = await chrome.permissions.getAll();
    const hasAlarms = perms.permissions.includes('alarms');
    const hasScripting = perms.permissions.includes('scripting');
    const hasActiveTab = perms.permissions.includes('activeTab');
    
    console.log('   Permissions:', perms.permissions);
    console.log('   ✅ Alarms:', hasAlarms ? 'YES' : '❌ MISSING');
    console.log('   ✅ Scripting:', hasScripting ? 'YES' : '❌ MISSING');
    console.log('   ✅ ActiveTab:', hasActiveTab ? 'YES' : '❌ MISSING');
    
    if (!hasAlarms) {
      console.error('   ❌ ALARMS permission is missing! You MUST reload the extension.');
      console.error('   Go to chrome://extensions and click the reload button.');
    }
  } catch (e) {
    console.error('   ❌ Failed to check permissions:', e);
  }
  
  // Test 2: Check Storage Settings
  console.log('\n⚙️  TEST 2: Checking Storage Settings...');
  const settings = await new Promise(resolve => {
    chrome.storage.sync.get([
      'autoUpdate', 
      'updateInterval', 
      'haHost', 
      'webhookId',
      'ssl',
      'userName',
      'deviceName'
    ], resolve);
  });
  
  console.log('   Settings:', settings);
  console.log('   Auto-Update Enabled:', settings.autoUpdate ? '✅ YES' : '⚠️ NO');
  console.log('   Update Interval:', settings.updateInterval || 'not set', 'seconds');
  console.log('   Webhook Host:', settings.haHost || '❌ NOT SET');
  console.log('   Webhook ID:', settings.webhookId ? '✅ SET' : '❌ NOT SET');
  
  if (!settings.haHost || !settings.webhookId) {
    console.warn('   ⚠️ Webhook not configured. Configure in options page first.');
  }
  
  if (settings.updateInterval && settings.updateInterval < 60) {
    console.warn('   ⚠️ Interval < 60 seconds may not work reliably (Chrome limitation)');
  }
  
  // Test 3: Check Alarms
  console.log('\n⏰ TEST 3: Checking Alarms...');
  const alarms = await chrome.alarms.getAll();
  console.log('   All alarms:', alarms);
  
  const autoAlarm = alarms.find(a => a.name === 'ha-auto-update');
  if (autoAlarm) {
    console.log('   ✅ Auto-update alarm EXISTS');
    console.log('   Period:', autoAlarm.periodInMinutes, 'minutes');
    console.log('   Next trigger:', new Date(autoAlarm.scheduledTime).toLocaleString());
    
    const now = Date.now();
    const timeUntil = Math.round((autoAlarm.scheduledTime - now) / 1000);
    console.log('   Time until next trigger:', timeUntil, 'seconds');
  } else {
    console.log('   ❌ Auto-update alarm NOT FOUND');
    if (settings.autoUpdate) {
      console.error('   ❌ Auto-update is enabled but alarm is missing!');
      console.log('   Try: 1) Reload extension, 2) Re-save settings in options');
    } else {
      console.log('   ℹ️ This is expected (auto-update is disabled)');
    }
  }
  
  // Test 4: Check Active Tab
  console.log('\n🌐 TEST 4: Checking Active Tab...');
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tabs[0]) {
    const tab = tabs[0];
    console.log('   ✅ Active tab found');
    console.log('   URL:', tab.url);
    console.log('   Title:', tab.title);
    
    const isRestricted = tab.url.startsWith('chrome://') || 
                        tab.url.startsWith('edge://') ||
                        tab.url.startsWith('about:') ||
                        tab.url.startsWith('chrome-extension://');
    
    if (isRestricted) {
      console.warn('   ⚠️ This is a RESTRICTED page - auto-update will not work here');
      console.log('   Navigate to a regular website to test auto-update');
    } else {
      console.log('   ✅ This is a valid page for auto-update');
    }
  } else {
    console.error('   ❌ No active tab found');
  }
  
  // Test 5: Check ExtensionUtils
  console.log('\n🔧 TEST 5: Checking ExtensionUtils...');
  if (typeof ExtensionUtils !== 'undefined') {
    console.log('   ✅ ExtensionUtils is loaded');
    console.log('   Available functions:', Object.keys(ExtensionUtils).join(', '));
    
    if (typeof ExtensionUtils.sendToHomeAssistant === 'function') {
      console.log('   ✅ sendToHomeAssistant function exists');
    } else {
      console.error('   ❌ sendToHomeAssistant function missing');
    }
  } else {
    console.error('   ❌ ExtensionUtils is NOT loaded - this is a serious problem');
  }
  
  // Test 6: Try Manual Send (if configured)
  console.log('\n🚀 TEST 6: Testing Manual Send...');
  if (settings.haHost && settings.webhookId && tabs[0]) {
    const tab = tabs[0];
    const isRestricted = tab.url.startsWith('chrome://') || 
                        tab.url.startsWith('edge://') ||
                        tab.url.startsWith('about:') ||
                        tab.url.startsWith('chrome-extension://');
    
    if (!isRestricted) {
      console.log('   Attempting to send active tab to Home Assistant...');
      try {
        const result = await ExtensionUtils.sendToHomeAssistant({
          tab,
          showNotifications: false,
          onProgress: (msg) => console.log('   Progress:', msg),
          onSuccess: (data) => console.log('   ✅ Success:', data),
          onError: (err) => console.error('   ❌ Error:', err),
        });
        console.log('   Result:', result);
      } catch (error) {
        console.error('   ❌ Manual send failed:', error.message);
      }
    } else {
      console.log('   ⏭️ Skipping (restricted page)');
    }
  } else {
    console.log('   ⏭️ Skipping (webhook not configured or no active tab)');
  }
  
  // Summary
  console.log('\n📊 ========== DIAGNOSTIC SUMMARY ==========\n');
  
  const issues = [];
  const warnings = [];
  
  const perms = await chrome.permissions.getAll();
  if (!perms.permissions.includes('alarms')) {
    issues.push('Alarms permission missing - RELOAD EXTENSION');
  }
  
  if (!settings.haHost || !settings.webhookId) {
    issues.push('Webhook not configured');
  }
  
  if (settings.autoUpdate && !autoAlarm) {
    issues.push('Auto-update enabled but alarm not found');
  }
  
  if (settings.updateInterval && settings.updateInterval < 60) {
    warnings.push('Interval < 60 seconds may not work in production');
  }
  
  if (tabs[0]) {
    const isRestricted = tabs[0].url.startsWith('chrome://') || 
                        tabs[0].url.startsWith('edge://');
    if (isRestricted) {
      warnings.push('Currently on restricted page');
    }
  }
  
  if (issues.length > 0) {
    console.error('❌ ISSUES FOUND:');
    issues.forEach(issue => console.error('   •', issue));
  }
  
  if (warnings.length > 0) {
    console.warn('\n⚠️ WARNINGS:');
    warnings.forEach(warning => console.warn('   •', warning));
  }
  
  if (issues.length === 0 && warnings.length === 0) {
    console.log('✅ Everything looks good!');
    if (settings.autoUpdate && autoAlarm) {
      console.log('\n👍 Auto-update should be working.');
      const timeUntil = Math.round((autoAlarm.scheduledTime - Date.now()) / 1000);
      console.log('⏰ Next auto-update in', timeUntil, 'seconds');
    }
  }
  
  console.log('\n===========================================\n');
})();
