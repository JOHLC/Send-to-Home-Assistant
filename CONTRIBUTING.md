# Contributing to Send to Home Assistant

First off, thank you for considering contributing to Send to Home Assistant! 🎉

The author acknowledges being "far from an accomplished developer" and welcomes community feedback, contributions, and code reviews. Your contributions help make this extension better for everyone.

## Table of Contents

- [Code of Conduct](#code-of-conduct)
- [How Can I Contribute?](#how-can-i-contribute)
- [Getting Started](#getting-started)
- [Development Setup](#development-setup)
- [Making Changes](#making-changes)
- [Testing](#testing)
- [Submitting Changes](#submitting-changes)
- [Style Guidelines](#style-guidelines)
- [Security Considerations](#security-considerations)

## Code of Conduct

This project and everyone participating in it is governed by our [Code of Conduct](CODE_OF_CONDUCT.md). By participating, you are expected to uphold this code.

## How Can I Contribute?

### 🐛 Reporting Bugs

Found a bug? Please use our bug report template:
- Check if the bug has already been reported
- Use the latest version of the extension
- Provide detailed information using the bug report template

### ✨ Suggesting Features

Have an idea for improvement? We'd love to hear it:
- Check if the feature has already been suggested
- Use the feature request template
- Explain your use case and how it would help

### 📝 Improving Documentation

Documentation improvements are always welcome:
- Fix typos or unclear instructions
- Add examples or clarifications
- Update screenshots or guides

### 💻 Code Contributions

Ready to contribute code? Great! Here's how to get started:

## Getting Started

1. **Fork the repository** on GitHub
2. **Clone your fork** locally:
   ```bash
   git clone https://github.com/YOUR-USERNAME/Send-to-Home-Assistant.git
   cd Send-to-Home-Assistant
   ```
3. **Create a branch** for your feature or bugfix:
   ```bash
   git checkout -b feature/amazing-feature
   # or
   git checkout -b bugfix/fix-something
   ```

## Development Setup

This is a browser extension built with vanilla JavaScript:

### Prerequisites
- Chrome or Edge browser
- Text editor or IDE
- Basic knowledge of JavaScript and browser extensions

### Loading the Extension for Development

1. Open Chrome/Edge and go to `chrome://extensions` or `edge://extensions`
2. Enable "Developer mode"
3. Click "Load unpacked"
4. Select the `package` folder from your cloned repository
5. The extension will be loaded and ready for testing

### Project Structure

```
├── .github/           # GitHub templates and workflows
├── package/           # Extension source code
│   ├── background.js  # Service worker
│   ├── popup.html     # Extension popup
│   ├── popup.js       # Popup logic
│   ├── options.html   # Options page
│   ├── options.js     # Options logic
│   ├── manifest.json  # Extension manifest
│   └── ...
├── tests/             # Test files
├── config/            # Configuration examples
└── README.md
```

## Making Changes

### Before You Start
- Create an issue first (unless it's a small fix)
- Discuss your approach with maintainers
- Keep changes focused and atomic

### Development Guidelines

1. **Keep it simple**: This extension aims to be lightweight and focused
2. **Maintain compatibility**: Support both Chrome and Edge
3. **Security first**: Always sanitize user input and data
4. **Test thoroughly**: Test with various websites and edge cases

### Key Areas

- **background.js**: Service worker, context menus, webhook sending
- **popup.js**: Main UI logic, status display, payload preview
- **options.js**: Configuration management, webhook testing
- **manifest.json**: Extension permissions and configuration

## Testing

### Manual Testing

1. **Load the extension** in developer mode
2. **Test basic functionality**:
   - Click extension icon on various websites
   - Test context menu on selected text
   - Verify payload is sent correctly to Home Assistant
3. **Test edge cases**:
   - Special characters in URLs/titles
   - Very long URLs or selected text
   - Pages with unusual content
4. **Security testing**:
   - Load `tests/xss-test.html` and verify no XSS vulnerabilities
   - Check that malicious content is properly sanitized

### Testing Checklist

- [ ] Extension loads without errors
- [ ] Popup displays correctly on all tested websites
- [ ] Context menu works with text selection
- [ ] Options page saves and loads settings correctly
- [ ] Webhook test function works
- [ ] No console errors or warnings
- [ ] Data is properly sanitized (test with XSS test page)
- [ ] Works in both Chrome and Edge

## Submitting Changes

### Pull Request Process

1. **Update documentation** if needed
2. **Test your changes** thoroughly
3. **Create a pull request** with:
   - Clear title and description
   - Reference any related issues
   - Include screenshots if UI changes
   - Fill out the PR template completely

### PR Requirements

- [ ] Code follows existing style and patterns
- [ ] Changes have been tested locally
- [ ] No new console errors or warnings
- [ ] Security considerations have been addressed
- [ ] Documentation updated if necessary

## Style Guidelines

### JavaScript Style
- Use consistent indentation (2 spaces)
- Follow existing naming conventions
- Add comments for complex logic
- Use modern JavaScript features appropriately
- Handle errors gracefully

### HTML/CSS Style
- Keep HTML semantic and accessible
- Use existing CSS classes when possible
- Maintain consistent styling with current UI
- Ensure responsive design

### Commit Messages
- Use clear, descriptive commit messages
- Start with a verb (Add, Fix, Update, etc.)
- Reference issues when applicable
- Keep first line under 72 characters

Example:
```
Add context menu option for sending page URL

Fixes #123 by adding a new context menu item that appears
when right-clicking on any page element.
```

## Security Considerations

⚠️ **Security is critical** for this extension as it handles:
- User browsing data
- Home Assistant credentials
- Network requests to user's home network

### Security Guidelines

- **Sanitize all user input** before display or transmission
- **Validate URLs** and webhook endpoints
- **Use secure storage** for sensitive configuration
- **Test with the XSS test page** (`tests/xss-test.html`)
- **Follow principle of least privilege** for permissions

### Security Review Process

All changes undergo security review, especially those affecting:
- Data handling and transmission
- User input processing
- Permission usage
- External network requests

## Getting Help

- **Questions?** Open a discussion or question issue
- **Stuck?** Tag maintainers in your PR for guidance
- **Security concerns?** Follow the security reporting process in SECURITY.md

## Recognition

Contributors will be recognized in:
- GitHub contributors list
- Release notes (for significant contributions)
- Project documentation (where appropriate)

## License

By contributing, you agree that your contributions will be licensed under the same MIT License that covers the project.

---

Thank you for contributing to Send to Home Assistant! 🚀