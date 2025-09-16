# Security Policy

_Last updated: 2025-09-16_

## Supported Versions

We support the latest version of the Send to Home Assistant extension. Please ensure you are using the most recent release before reporting any security issues.

| Version | Supported          |
| ------- | ------------------ |
| Latest  | ✅                 |
| Older   | ❌                 |

## Reporting a Vulnerability

**Do NOT create a public GitHub issue for security vulnerabilities.**

Please report security issues using one of the following methods:
- **GitHub Security Advisory**: Use GitHub’s “Report a vulnerability” feature on this repo.

### What to Include

- Clear description of the vulnerability
- Impact (potential attacker actions)
- Reproduction steps
- Environment details (browser, extension, OS versions)
- Proof of concept (if possible)

## Security Considerations

This extension processes sensitive information:
- URLs, page titles, selected text
- Home Assistant webhook URLs and credentials
- Browser extension permissions

### Key Security Areas

- **XSS Prevention:** Data is sanitized before display ([test page](/tests/xss-test.html))
- **Data Transmission:** Data is sent only to your configured Home Assistant instance
- **Storage Security:** Configurations are stored securely in the browser
- **Permissions:** Extension requests only the minimum required permissions

## Response Timeline

- **Acknowledgment:** Within 72 hours
- **Assessment:** Within 1 week
- **Resolution:** As soon as possible, depending on complexity

## Responsible Disclosure & Safe Harbor

We support responsible disclosure. No legal action will be taken against researchers who:
- Report vulnerabilities through the channels above
- Minimize impact to users and data
- Avoid testing on others' systems without permission
- Allow us reasonable time to resolve issues prior to public disclosure

## Security Best Practices for Users

- Use HTTPS for your Home Assistant instance
- Keep the extension updated
- Use long, random webhook IDs
- Secure your Home Assistant network
- Regularly review extension permissions

## Privacy

- No personal data is collected
- No data sent to third parties
- Data sent only to your configured Home Assistant webhook
- Configuration is stored locally in secure browser storage

See the [Privacy Notice](README.md) for details.

## Contact

For security-related questions or concerns, please use the reporting methods above.

Thank you for helping keep Send to Home Assistant secure!
