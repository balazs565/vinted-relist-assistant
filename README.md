# 🔄 Vinted Relist Assistant

A Chrome / Brave browser extension that helps you **manually relist your Vinted items** in a safer, more human-like way — with randomized delays, confirmation steps, and full data backup before deletion.

> ⚠️ **Disclaimer:** Relisting items may violate Vinted's Terms of Service. Use this tool at your own risk and sparingly. The extension is designed to minimize detection risk, but no tool can guarantee immunity from platform action.

---

## ✨ Features

- **🔄 Relist safely** button injected directly on your item's detail page
- **📦 Full data extraction** — title, description, price, and all images saved before deletion
- **🖼 Image backup** — images downloaded as base64 and stored locally before the listing is deleted
- **⏱ Randomized safety delay** — waits a random 5–10 minutes (configurable) before allowing repost
- **✏️ Human-like autofill** — types your saved data into the sell form character by character with natural delays
- **🚫 Never auto-publishes** — the final Publish button always requires a manual click from you
- **📊 Popup dashboard** — live countdown timers, pending relist queue, settings panel
- **🌍 All Vinted domains** — works on `.ro`, `.com`, `.fr`, `.de`, `.co.uk`, `.pl`, and 15+ more

---

## 🖥 Screenshots

| Item page — Relist button | Popup — Active Relists | Popup — Settings |
|:---:|:---:|:---:|
| Button injected into the item info panel | Countdown timer + status | Delay range, autofill toggle |

---

## 🚀 Installation

> The extension is not published on the Chrome Web Store. Install it as an unpacked extension.

### 1. Download the code

```bash
git clone https://github.com/balazs565/vinted-relist-assistant.git
```

Or download the ZIP from the green **Code** button above.

### 2. Load in Chrome / Brave

1. Go to `chrome://extensions`
2. Enable **Developer mode** (top-right toggle)
3. Click **Load unpacked**
4. Select the `vinted-relist-assistant` folder
5. The extension icon appears in your toolbar ✅

---

## 📖 How to Use

### First time setup

1. Open your Vinted profile page (e.g. `vinted.ro/member/YOUR_ID`)
2. The extension automatically reads and stores your member ID
3. Open the extension popup → **Settings** → confirm your Vinted domain (e.g. `vinted.ro`)

### Relisting an item

```
1. Navigate to any of your listed items
   e.g. vinted.ro/items/8820948573-adidas-nmd-fs-s1

2. Click "🔄 Relist safely" in the item info panel

3. Read the warning and click "Yes, relist"

4. Review the extracted data (title, description, price, images)
   Edit anything that needs correcting → Save & continue

5. The extension saves all data + downloads your images

6. Delete the listing using Vinted's own delete option

7. Click "✓ Deletion Done" in the overlay

8. A randomized delay starts (default 5–10 min)
   Watch the countdown in the popup or the page toast

9. When ready → open the popup → click "🚀 Start reposting"

10. The sell form opens and is autofilled with your saved data

11. Review everything → click Publish yourself ✅
```

### Safer alternative — Refresh listing

Click **✏️ Refresh listing** instead to open the edit page and make a small description change. This bumps the listing timestamp **without deletion risk** and is the recommended approach when possible.

---

## ⚙️ Settings

| Setting | Default | Description |
|---|---|---|
| Minimum delay | 5 min | Shortest possible wait after deletion |
| Maximum delay | 10 min | Longest possible wait (randomized between min/max) |
| Autofill sell form | ON | Types saved data into the new listing form |
| Manual-only mode | ON | Requires confirmation at every step |
| Vinted domain | `vinted.ro` | Your country's Vinted site |

---

## 🗂 File Structure

```
vinted-relist-assistant/
├── manifest.json          # MV3 extension config + permissions
├── background.js          # Service worker: alarms, badge, notifications
├── content.js             # DOM injection, relist flow, autofill assist
├── utils.js               # Shared helpers (storage, delays, human typing)
├── popup.html             # Popup UI markup
├── popup.js               # Popup logic: countdown, queue, settings
└── icons/
    ├── icon16.png
    ├── icon48.png
    ├── icon128.png
    └── generate_icons.html  # Open in browser to generate icons
```

---

## 🛡 Safety Design

| Risk | How it's handled |
|---|---|
| Auto-publishing | **Impossible** — Publish always requires manual click |
| Bulk processing | One item at a time only |
| Bot-like typing | Random 45–130ms delay per character + natural pauses |
| Instant repost | Enforced randomized delay via `chrome.alarms` |
| Images lost on deletion | Downloaded as base64 **before** deletion |
| DOM changes breaking the extension | Multiple fallback selectors per field; warns and stops gracefully |
| Alarm lost on tab close | `chrome.alarms` API persists in the service worker |

---

## 🔧 Troubleshooting

**Button doesn't appear on my item page**
- Visit your profile page first so the extension can learn your member ID
- Reload the extension at `chrome://extensions` after any code change
- The button appears only on your **own** items

**Selectors stopped working after a Vinted update**
- Open `content.js` and update the `VR_SEL` object at the top with the new class names
- Use browser DevTools (F12 → Inspector) to find the updated selectors

**Images not saving**
- Some Vinted image CDN URLs have CORS restrictions — the extension will note which images failed and you'll need to re-upload those manually

---

## 🤝 Contributing

Pull requests are welcome. For major changes please open an issue first.

1. Fork the repo
2. Create a feature branch (`git checkout -b feature/my-feature`)
3. Commit your changes
4. Push and open a Pull Request

---

## 📄 License

MIT — free to use, modify, and distribute.
