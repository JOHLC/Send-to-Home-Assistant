# Favicon Fallback Testing Guide

## Test with Broken Favicon Pages

Use the provided `favicon-test.html` file to test various favicon fallback scenarios:

### Test Cases Covered:
1. **Broken domain favicon**: `https://nonexistent.domain/broken.ico`
2. **404 favicon**: `/404-favicon.ico`
3. **File:// protocol favicon**: Blocked by CSP validation
4. **localhost/local domains**: Detected and handled

### Expected Behavior:
- Extension popup preview shows extension icon instead of broken images
- Webhook payload includes fallback favicon URL pointing to extension icon
- Context menu and direct send both use same fallback logic
- No console errors or CSP violations

### Manual Testing Steps:
1. Open `favicon-test.html` in browser
2. Use extension (both popup and context menu)
3. Verify extension icon appears in preview
4. Check webhook payload contains proper fallback URL

### Validation Logic:
The extension now validates favicon URLs and falls back to extension icon for:
- `file://` protocol URLs
- localhost/empty hostnames
- `.local` domains
- URLs containing "404" or "nonexistent"
- Invalid URLs that throw exceptions

This prevents CSP violations and ensures consistent user experience.