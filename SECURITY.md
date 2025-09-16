# Security Policy

## Supported Versions

We actively support the latest version of the Send to Home Assistant extension. Please ensure you are using the most recent version before reporting security issues.

| Version | Supported          |
| ------- | ------------------ |
| Latest  | :white_check_mark: |
| < Latest| :x:                |

## Reporting a Vulnerability

We take security seriously. If you discover a security vulnerability, please help us address it responsibly.

### How to Report

**Please do NOT create a public GitHub issue for security vulnerabilities.**

Instead, please report security issues by:

1. **Email**: Send details to the repository owner via GitHub's private vulnerability reporting feature
2. **GitHub Security**: Use GitHub's "Report a vulnerability" feature (if available)
3. **Private Contact**: Reach out through the sponsor/contact information in the repository

### What to Include

When reporting a security vulnerability, please include:

- **Description**: Clear description of the vulnerability
- **Impact**: What could an attacker achieve?
- **Reproduction**: Step-by-step instructions to reproduce the issue
- **Environment**: Browser version, extension version, and OS
- **Proof of Concept**: If applicable, include a minimal example

### Security Considerations

This extension handles sensitive data including:
- URLs and page titles from your browsing
- Selected text content
- Home Assistant webhook URLs and credentials
- Browser extension permissions

### Common Security Areas

Please pay special attention to:

- **XSS Prevention**: The extension sanitizes data before display (test with `/tests/xss-test.html`)
- **Data Transmission**: All data is sent only to your configured Home Assistant instance
- **Storage Security**: Configuration data is stored in browser's secure extension storage
- **Permission Usage**: Extension only requests necessary permissions

### Response Timeline

- **Acknowledgment**: Within 48 hours
- **Initial Assessment**: Within 1 week
- **Resolution**: Varies based on complexity, but we aim for quick fixes

### Safe Harbor

We support responsible disclosure and will not pursue legal action against researchers who:

- Report vulnerabilities through proper channels
- Do not access or modify user data beyond what's necessary to demonstrate the vulnerability
- Do not perform testing on others' systems without permission
- Give us reasonable time to address issues before public disclosure

## Security Best Practices for Users

- **Use HTTPS**: Always configure Home Assistant with SSL/TLS enabled
- **Keep Updated**: Install extension updates promptly
- **Webhook Security**: Use long, random webhook IDs
- **Network Security**: Ensure your Home Assistant instance is properly secured
- **Review Permissions**: Regularly review extension permissions in your browser

## Privacy

This extension:
- **Does NOT** collect any personal data
- **Does NOT** send data to third parties
- **ONLY** sends data to your configured Home Assistant webhook
- **Stores** configuration locally in browser's secure extension storage

For more details, see the Privacy Notice in the README.

## Contact

For security-related questions or concerns, please use the reporting methods above rather than public issues.

Thank you for helping keep Send to Home Assistant secure!