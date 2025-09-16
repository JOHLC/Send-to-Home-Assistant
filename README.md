# Send to Home Assistant – Chrome/Edge Extension

<img src="https://raw.githubusercontent.com/JOHLC/Send-to-Home-Assistant/refs/tags/v2025.09.2-beta1/package/icon.png" alt="Send to Home Assistant Logo" width="200" />       

> <a class="github-button" href="https://github.com/JOHLC/Send-to-Home-Assistant" data-color-scheme="no-preference: dark; light: light; dark: dark;" data-size="large" aria-label="Download JOHLC/Send-to-Home-Assistant on GitHub">Visit/download on Github</a>

This all started because I wanted to be able to send the current web page from my computer to my phone. With the use of Copilot Chat, ChatGPT, Gemini, and other AI resources, I was able to clobber something pretty cool (in my eyes) together.

Send to Home Assistant is a simple browser extension that sends the current page’s details (URL, title, favicon, selected text, and more) to your Home Assistant instance via a webhook. Perfect for creating automations or quickly capturing content from any site.  

> **⚠️ General Disclaimer**
> This project is provided *as is*, without any warranty of any kind. The author takes no responsibility for any issues, damages, or losses arising from its use. Use at your own risk.  
>
> **🤖 Disclaimer: AI-Powered**
> This project includes code and documentation produced with AI assistance. AI output may contain mistakes, omissions, or insecure patterns. Always test and verify before trusting it in your setup.
>
> Community feedback, contributions, and code reviews are not only welcome, they're encouraged!  

## Features  

- One click: send the current tab’s details to Home Assistant.  
- Works on any website (does not work on internal pages like `chrome://` or `edge://`).  
- Only sends the current page’s basic info (e.g., URL, title, selected text, username, etc.)
- Clean popup UI with status updates, payload preview, and copy-as-JSON.  
- Options page to configure your Home Assistant host, SSL, webhook ID, and optional username.  
- Built-in webhook test from the options page.  
- Error handling and user feedback.  
- All settings are stored using sync storage.  

## Installation  

1. Download and extract the latest [release .zip file](https://github.com/JOHLC/Send-to-Home-Assistant/releases/latest)
2. In Chrome or Edge, open `chrome://extensions` or `edge://extensions`.  
3. Enable **Developer mode**.  
4. Click **Load unpacked** and select the unpacked zip folder.  
5. Open the extension options to configure your Home Assistant details

## Configuration  

1. Open the extension options (via the popup gear icon or right-click → **Extension options**).  
2. Enter your Home Assistant hostname or IP (e.g., `myhome.duckdns.org` or `192.168.1.2`).  
3. Choose whether to use SSL 
3.1 SSL is strongly recommended; you’ll be warned if it’s not enabled.
5. Enter your Home Assistant **[Webhook ID](https://www.home-assistant.io/docs/automation/trigger/#webhook-trigger)** (not the full URL, just the ID).  
6. Optionally, add a username to include in the payload.  
7. Click **Test** to confirm the webhook is reachable, then **Save** your settings.  

## Usage  

- Click the extension icon on any page to send its info directly to your Home Assistant webhook.  
- The popup shows real-time status, a payload preview, and a one-click copy-to-clipboard button.  
- Create an automation based on the received payload. 
  - For example, I am using it to send links right to my phone. See [Automation Examples.](https://github.com/JOHLC/Send-to-Home-Assistant/blob/main/config/automations.md) 



## Screenshots

### Notification
<img width="500" alt="image" src="https://github.com/user-attachments/assets/5f3dd2dc-bb66-491d-acd4-f3fd2acd50e4" />

### Extension Popup 
<img width="500" alt="image" src="https://github.com/user-attachments/assets/1f881395-27cf-4aca-8dee-29440e979e78" />

### Options Page

<img src="https://raw.githubusercontent.com/JOHLC/Send-to-Home-Assistant/refs/heads/main/assets/screenshot-1.png" alt="Options Page Screenshot" width="500" />

## License  

MIT  

---  

**Home Assistant** is an open-source home automation platform. Learn more at [home-assistant.io](https://www.home-assistant.io/)

## Privacy Notice

This extension collects the following data when you use it:
- Page title
- URL
- Favicon
- Selected text
- Timestamp
- User agent
- Optional user name and device name (if provided in options)

**All data is sent only to your configured Home Assistant webhook and is never sent to any third party or external server.**
No data is collected or stored by the extension author.

