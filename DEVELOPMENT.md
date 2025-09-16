# Development Guide

This guide covers the development setup, code standards, and best practices for the Send to Home Assistant extension.

## Table of Contents

- [Setup](#setup)
- [Code Standards](#code-standards)
- [Architecture](#architecture)
- [Testing](#testing)
- [Building & Packaging](#building--packaging)
- [Security Considerations](#security-considerations)

## Setup

### Prerequisites

- Node.js 16+ (for development tools)
- Chrome or Edge browser
- Text editor with JavaScript/HTML support

### Development Environment

1. **Clone the repository:**
   ```bash
   git clone https://github.com/JOHLC/Send-to-Home-Assistant.git
   cd Send-to-Home-Assistant
   ```

2. **Install development dependencies:**
   ```bash
   npm install
   ```

3. **Load extension in developer mode:**
   - Open Chrome/Edge and navigate to `chrome://extensions/` or `edge://extensions/`
   - Enable "Developer mode"
   - Click "Load unpacked" and select the `package/` directory

### Development Scripts

- `npm run lint` - Check code for style and potential issues
- `npm run lint:fix` - Automatically fix linting issues
- `npm run validate` - Validate manifest.json
- `npm run package` - Create distribution ZIP file

## Code Standards

### ESLint Configuration

The project uses ESLint with the following key rules:

- **Indentation:** 2 spaces
- **Quotes:** Single quotes for strings
- **Semicolons:** Required
- **Line length:** 120 characters (soft limit)
- **Security:** No eval(), no innerHTML without escaping

### File Organization

```
package/
├── manifest.json         # Extension manifest
├── background.js         # Service worker
├── popup.html/js         # Extension popup
├── options.html/js       # Options page
├── utils.js             # Shared utilities
├── style.css            # Shared styles
├── inpage-alert.js      # Injected content script
└── icon.png            # Extension icon
```

### Coding Patterns

1. **Error Handling:**
   ```javascript
   try {
     await someAsyncOperation();
   } catch (error) {
     console.error('Operation failed:', error);
     showUserFriendlyError(error.message);
   }
   ```

2. **XSS Prevention:**
   ```javascript
   // Always escape HTML content
   element.innerHTML = escapeHTML(userContent);
   ```

3. **Async/Await:**
   ```javascript
   // Prefer async/await over .then() chains
   async function fetchData() {
     const response = await fetch(url);
     return await response.json();
   }
   ```

## Architecture

### Service Worker (background.js)

- Handles extension lifecycle events
- Manages context menus
- Checks for updates
- Communicates with popup

### Popup (popup.js/html)

- Main user interface
- Collects page information
- Sends data to webhook
- Shows preview and feedback

### Options (options.js/html)

- Configuration management
- Webhook testing
- Update preferences
- SSL warnings

### Utilities (utils.js)

- Shared functions across components
- XSS protection (escapeHTML)
- Configuration constants
- Validation helpers

## Testing

### Manual Testing

1. **Basic functionality:**
   ```bash
   # Load the test page
   open tests/xss-test.html
   
   # Test the extension on various websites
   # - Click extension icon
   # - Use context menu
   # - Check popup preview
   ```

2. **Security testing:**
   - Load `tests/xss-test.html`
   - Verify no JavaScript alerts appear
   - Check that malicious content is escaped
   - Confirm extension functions normally

3. **Configuration testing:**
   - Test with invalid webhook URLs
   - Test with/without SSL
   - Test user/device name validation

### Automated Testing

Run the linter to catch common issues:
```bash
npm run lint
```

Validate the manifest:
```bash
npm run validate
```

## Building & Packaging

### Development Build

For development, simply load the `package/` directory in the browser's extension developer mode.

### Production Build

Create a distribution package:
```bash
npm run package
```

This creates a ZIP file in the `dist/` directory ready for Chrome Web Store submission.

### File Inclusion

The packaging script includes only necessary files:
- All JavaScript, HTML, CSS files
- Manifest and icon
- Excludes development files (node_modules, scripts, tests, etc.)

## Security Considerations

### XSS Protection

- All user-generated content is escaped using `escapeHTML()`
- innerHTML is avoided unless content is properly sanitized
- CSP headers restrict script execution

### Input Validation

- Webhook URLs are validated
- User input is sanitized
- Device names are restricted to safe characters

### Permissions

The extension requests minimal permissions:
- `storage` - For configuration
- `scripting` - For page content access
- `activeTab` - For current page only
- `contextMenus` - For right-click menu
- `notifications` - For user feedback

### Best Practices

1. **Never trust user input** - Always validate and sanitize
2. **Minimize permissions** - Request only what's needed
3. **Use HTTPS** - Encourage SSL for webhook URLs
4. **Error handling** - Don't expose sensitive information
5. **Regular updates** - Keep dependencies current

## Contributing

1. Follow the established code style (enforced by ESLint)
2. Test thoroughly on the XSS test page
3. Update documentation for new features
4. Consider security implications of changes
5. Keep changes focused and atomic

## Debugging

### Console Logging

- Service Worker: Chrome DevTools > Extensions > Service Worker
- Popup: Right-click popup > Inspect
- Options: Right-click options page > Inspect

### Common Issues

1. **Service worker not loading:** Check for JavaScript errors
2. **Popup not working:** Verify manifest.json syntax
3. **Permissions errors:** Check host_permissions and permissions arrays
4. **XSS test failures:** Review escapeHTML() usage