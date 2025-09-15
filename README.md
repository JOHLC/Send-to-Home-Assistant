
<div align="center">
	<img src="https://raw.githubusercontent.com/JOHLC/Send-to-Home-Assistant/refs/heads/main/package/icon.png" alt="Send to Home Assistant Logo" width="auto" height="200">
</div>

# Send to Home Assistant – Chrome/Edge Extension

A simple browser extension that lets you send the current page’s details (URL, title, favicon, selected text, and more) to your Home Assistant instance via a webhook. Perfect for creating automations or quickly capturing content from any site.  

## Features  

- One click: send the current tab’s details to Home Assistant.  
- Clean popup UI with status updates, payload preview, and copy-as-JSON.  
- Options page to configure your Home Assistant host, SSL, webhook ID, and optional username.  
- Built-in webhook test from the options page.  
- Clear error handling and user feedback.  
- Works on any website (except browser internal pages like `chrome://` or `edge://`).  

## Installation  

1. Download or clone this repository.  
2. In Chrome or Edge, open `chrome://extensions` or `edge://extensions`.  
3. Enable **Developer mode**.  
4. Click **Load unpacked** and select the `package/` folder from this repo.  
5. Open the extension options and configure your Home Assistant host, SSL, webhook ID, and optional username.  

## Configuration  

1. Open the extension options (via the popup gear icon or right-click → **Extension options**).  
2. Enter your Home Assistant hostname or IP (e.g., `myhome.duckdns.org` or `192.168.1.2`).  
3. Choose whether to use SSL (recommended for HTTPS).  
4. Enter your Home Assistant **Webhook ID** (not the full URL, just the ID).  
5. Optionally, add a username to include in the payload.  
6. Click **Test** to confirm the webhook is reachable, then **Save** your settings.  

## Usage  

- Click the extension icon on any page to send its info directly to your Home Assistant webhook.  
- The popup shows real-time status, a payload preview, and a one-click copy-to-clipboard button.  
- Update or test your webhook anytime in the options page.  

## Security & Privacy  

- Only the current page’s basic info (URL, title, favicon, selected text, and optional username) is sent.  
- All settings are stored securely using Chrome/Edge sync storage.  
- SSL is strongly recommended; you’ll be warned if it’s not enabled.  

## Screenshots  

Options Page Screenshot  
<div align="left">
	<img src="https://raw.githubusercontent.com/JOHLC/Send-to-Home-Assistant/refs/heads/main/assets/screenshot-1.png" alt="Send to Home Assistant Logo" width="auto" height="500px">
</div>

## License  

MIT  

---  

**Home Assistant** is an open-source home automation platform. Learn more at [home-assistant.io](https://www.home-assistant.io/).  



