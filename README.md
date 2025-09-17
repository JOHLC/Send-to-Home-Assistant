# Send to Home Assistant – Chrome/Edge Extension

<img src="https://raw.githubusercontent.com/JOHLC/Send-to-Home-Assistant/refs/heads/v2025.09.2-beta/assets/social-preview.webp" alt="Send to Home Assistant Logo" width="600" />

[![Visit/download on Github](https://img.shields.io/badge/GitHub-Download-blue?logo=github)](https://github.com/JOHLC/Send-to-Home-Assistant) ![GitHub Release](https://img.shields.io/github/v/release/JOHLC/send-to-home-assistant) ![GitHub Release Date](https://img.shields.io/github/release-date/JOHLC/send-to-home-assistant?label=Latest%20release)
 ![GitHub Downloads (all assets, all releases)](https://img.shields.io/github/downloads/JOHLC/send-to-home-assistant/total) ![GitHub Issues or Pull Requests](https://img.shields.io/github/issues/JOHLC/send-to-home-assistant) ![GitHub Sponsors](https://img.shields.io/github/sponsors/JOHLC)





## Table of Contents
- [About](#about)
- [Features](#features)
- [Installation](#installation)
- [Configuration](#configuration)
- [Usage](#usage)
- [Screenshots](#screenshots)
- [Privacy Notice](#privacy-notice)
- [License](#license)
- [Credits](#credits)

---

## About

Send to Home Assistant is a simple browser extension that sends the current page’s details (URL, title, favicon, selected text, and more) to your Home Assistant instance via a webhook. Perfect for creating automations or quickly capturing content from any site.

> **⚠️ General Disclaimer**  
> This project is provided *as is*, without any warranty of any kind. The author takes no responsibility for any issues, damages, or losses arising from its use. Use at your own risk.
>
> **🤖 AI-Powered Notice**  
> This project includes code and documentation produced with AI assistance.  
> AI output may contain mistakes, omissions, or insecure patterns.  
> Always test and verify before trusting it in your setup.

I am far from being an accomplished developer. Community feedback, contributions, and code reviews are not only welcome—they're encouraged!

#### Why?

This all started because I wanted to be able to send the current web page from my computer to my phone. With the use of Copilot Chat, ChatGPT, Gemini, and other AI resources, I was able to clobber something pretty cool (in my eyes) together.

---

## Features

- **One click:** Send the current tab’s details to Home Assistant.
- **Clean popup UI:** See status updates, payload preview, and copy-as-JSON.
- **Sends basic info:** URL, title, selected text, username, and more.
- **Works everywhere:** Popup works on any website (except internal pages like `chrome://` or `edge://`).
- **Right-click context menu:** Send selected text or page details to Home Assistant.
- **Easy configuration:** Options page for Home Assistant host, SSL, webhook ID, username, and device name.
- **Webhook test:** Built-in from the options page.
- **Error handling:** Friendly user feedback.
- **Sync storage:** All settings are stored securely.

---

## Screenshots

**Extension Popup**  
<img width="500" alt="Extension Popup" src="https://github.com/user-attachments/assets/cf206055-5074-4684-8928-5854d33fd38c" />

**Options Page**  
<img width="500" alt="Options Page" src="https://github.com/user-attachments/assets/39065165-36f8-41c2-9b55-f570135f8e22" />

**HTML Notification**  
<img width="455" alt="HTML Notification" src="https://github.com/user-attachments/assets/7d7fac2d-dfd6-463b-94f8-8a169f9cab9f" />

**Android Notification (Through Home Assistant Automation)**  
<img width="500" alt="Android Notification" src="https://github.com/user-attachments/assets/48faa4e2-cf21-45ab-8efc-68ac2904288a" />

---


## Installation

1. [Download and extract the latest release .zip file](https://github.com/JOHLC/Send-to-Home-Assistant/releases/latest)
2. In Chrome or Edge, open `chrome://extensions` or `edge://extensions`.
3. Enable **Developer mode**.
4. Click **Load unpacked** and select the unpacked zip folder.
5. Open the extension options to configure your Home Assistant details.

---

## Configuration

1. Open the extension options (popup gear icon or right-click → **Extension options**).
2. Enter your Home Assistant hostname or IP (e.g., `myhome.duckdns.org` or `192.168.1.2`).
3. Choose whether to use SSL (**strongly recommended**; you'll be warned if not enabled).
4. Enter your Home Assistant [Webhook ID](https://www.home-assistant.io/docs/automation/trigger/#webhook-trigger) (just the ID, not the full URL).
5. Optionally, add a username and device name to include in the payload.
6. Click **Test** to confirm the webhook is reachable, then **Save** your settings.

---

## Usage

- Click the extension icon on any page to send its info directly to your Home Assistant webhook. The popup shows real-time status, a payload preview, and a one-click copy-to-clipboard button.
- Or, select text on a web page, then right click and select Send to Home Assistant (Default) in the context menu.
- Create an automation based on the received payload.
  - For example, I use it to send links right to my phone. See [Automation Examples](https://github.com/JOHLC/Send-to-Home-Assistant/blob/main/config/automations.md).

---

## Privacy Notice

This extension collects the following data when you use it:

| Data            | Purpose |
|-----------------|---------|
| Page title      | Sent to your webhook |
| URL             | Sent to your webhook |
| Favicon         | Sent to your webhook |
| Selected text   | Sent to your webhook |
| Timestamp       | Sent to your webhook |
| User agent      | Sent to your webhook |
| Username/device | Only if provided in options |

**All data is sent only to your configured Home Assistant webhook and is never sent to any third party or external server. No data is collected or stored by the extension author.**

---

## License

MIT

---

## Credits

**Home Assistant** is an open-source home automation platform. Learn more at [home-assistant.io](https://www.home-assistant.io/)

---



