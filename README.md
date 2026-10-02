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

- **Multiple send profiles:** Add custom names and context values (for example, YTDL or Save), choose a default, and override it for individual sends.
- **Quick send (optional):** Enable automatic sending of your default profile when the popup opens. It is off by default so you can choose another profile first.
- **Clean popup UI:** See status updates, payload preview, and copy-as-JSON.
- **Sends basic info:** URL, title, selected text, username, and more.
- **Works everywhere:** Popup works on any website (except internal pages like `chrome://` or `edge://`).
- **Right-click context menu:** Send selected text or page details to Home Assistant.
- **Easy configuration:** Options page for Home Assistant host, SSL, webhook ID, username, and device name.
- **Webhook test:** Built-in from the options page.
- **Error handling:** Friendly user feedback.
- **Scoped permissions:** Grants access only to the Home Assistant host you select; manual page collection uses the browser's active-tab grant.
- **Local webhook secret:** Webhook ID stays in local extension storage; non-secret preferences may sync.
- **Automated checks:** Node tests, manifest validation, linting and ZIP packaging run in CI.

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

Settings are organized into **Connection**, **Send profiles**, and **Preferences**.
Connection changes need **Save connection**; profile changes and preference toggles
save as you make them. **Send test** submits a sample POST using the fields
currently shown, even if they have not been saved, and may trigger your Home
Assistant automation. The webhook ID is stored locally in this browser.

1. Open the extension options (popup gear icon or right-click → **Extension options**).
2. Enter your Home Assistant hostname or IP (e.g., `myhome.duckdns.org` or `192.168.1.2`).
3. Choose whether to use SSL (**strongly recommended**; you'll be warned if not enabled).
4. Enter your Home Assistant [Webhook ID](https://www.home-assistant.io/docs/automation/trigger/#webhook-trigger) (just the ID, not the full URL).
5. Optionally, add a username and device name to include in the payload.
6. Click **Save** and approve access to your specific Home Assistant host. Then click **Test** to send a sample POST request. Confirm that the automation actually triggered in Home Assistant; an HTTP success alone does not verify it.

**Profile configuration:** Choose your default in **Send profiles**. Add a
custom profile using a display name such as `Download video` and the
case-sensitive Home Assistant context `YTDL`. Existing profiles appear as
compact rows; choose Edit to modify one. In **Preferences**, enable
**Send immediately when I open the popup** only if you want to skip selecting a
profile for ordinary sends. Advanced settings include update checking, privacy,
and a confirmed reset.

**Updating from a previous version:** Open Options and click Save once to grant the new scoped host permission. An existing synced webhook ID is migrated to local storage. On another browser or computer, you may need to enter the ID again after migration.

### Profiles and Home Assistant routing

All profiles use the **same configured webhook**. Each send includes a case-sensitive `context` field, such as `Default`, `YTDL`, or `Save`. The built-in Default profile always exists, and existing HA automations that check `trigger.json.context == 'YTDL'` continue working once you add a profile with that exact context.

Create or edit profiles in **Options > Send profiles**, then choose the default profile. You can edit or delete custom profiles, but you cannot delete the built-in Default. Deleting the configured default falls back to Default. Profile names and contexts are stored in browser sync; your webhook ID remains local.

Example payload (other fields omitted):

```json
{
  "title": "Example page",
  "url": "https://example.com/",
  "context": "YTDL"
}
```

Example Home Assistant routing:

```yaml
actions:
  - choose:
      - conditions:
          - condition: template
            value_template: "{{ trigger.json.context | default('Default') == 'YTDL' }}"
        sequence:
          - action: script.home_assistant_fire_event
            data:
              event_type: send-to-ha
              customdata: "[{{ trigger.json }}]"
    default:
      - action: persistent_notification.create
        data:
          title: "Shared from Browser: {{ trigger.json.title }}"
          message: "{{ trigger.json.url }}"
```

**Local files:** Enable file URL access in the browser's extension details if you want page extraction from local files. If injection is unavailable, manual sending falls back to the browser tab's URL and title.

---

## Usage

- Click the extension icon, select a profile (your default is preselected), and click **Send**. The popup shows the payload and lets you copy its JSON.
- Right-click a page, link, or selected text and select **Send to Home Assistant**, then choose **Default**, **YTDL**, **Save**, or any other custom profile. The configured default is marked in the menu.
- If you prefer the previous one-click behavior, enable **Automatically send the default when the popup opens** in Options. Alternative profiles remain available from the right-click menu, and you can send a second time from the popup.
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

**Page data** is posted to your configured Home Assistant webhook when you manually send it. Update checks are disabled by default; enabling them makes daily requests to GitHub's releases API. An HTTPS fallback favicon hosted on GitHub may be fetched when your Home Assistant notification displays it. The extension author does not operate a collection endpoint. Treat the webhook ID like a secret and use HTTPS on untrusted networks.

---

## License

MIT

---

## Credits

**Home Assistant** is an open-source home automation platform. Learn more at [home-assistant.io](https://www.home-assistant.io/)

---



