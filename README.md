# VibeFeed: YouTube Feed Filter & Vibe Curator

> A minimalist, privacy-focused browser extension that filters your YouTube feed so you **only** see videos matching your curated keywords, topics, and `#hashtags`. As you watch videos, it dynamically analyzes their vibe and suggests matching interests you can add to your feed with a single click.

---

## Features

- **Active Feed Curation & Shelf**: Instead of just hiding videos and leaving blank space, VibeFeed actively curates and displays matching videos right on your YouTube homepage in a dedicated **SUGGESTED** shelf with topic tabs and quick refresh.
- **Unrestricted Search & Channel Browsing**: VibeFeed only filters passive feed recommendations on your homepage. When you search for a video or visit a creator's channel, results are never blocked.
- **Dynamic Vibe Detection (On Watch)**: As you watch any YouTube video, VibeFeed's client-side NLP engine analyzes the video's title, channel, description, and hashtags, displaying a minimalist floating HUD with instant 1-tap vibe additions (e.g. `[+ #AI]`, `[+ Python]`, `[+ Deep Work]`).
- **Vibe Radar**: Keeps a history of vibes detected from videos you've watched, complete with 1-click `[+]` addition buttons inside the popup.
- **Negative Keywords (Anti-Clickbait)**: Block specific terms (e.g. `prank`, `clickbait`, `drama`, `spoilers`) even if a video matches other keywords.
- **Frosted Glass Filter**: Non-matching videos are subtly blurred with frosted glass and a minimalist badge, smoothly revealing on hover without disrupting your feed layout.
- **Distraction Reducers**: Option to hide YouTube Shorts reels and shelves entirely.
- **Starter Packs**: 1-click curated bundles for *Deep Work & Code*, *Ambient & Lo-Fi Flow*, *Cosmos & Science*, and *Mindset & High Agency*.
- **100% Private & Local**: Zero external API calls, zero analytics, zero data collection. All keyword filtering and vibe extraction runs locally in your browser.

---

## Installation & Setup Guide

VibeFeed is built on the universal **Manifest V3** standard and works across all modern Chromium browsers (Google Chrome, Brave, Microsoft Edge, Arc, Opera) and Firefox.

### Step 1: Download to Local Device

1. On the GitHub repository page, click the green **Code** button near the top right.
2. Click **Download ZIP**.
3. Extract (unzip) the downloaded `.zip` file into a folder on your computer.

---

### Step 2: Load the Extension into Your Browser

#### Google Chrome, Brave, Arc, or Opera
1. Open your browser and navigate to the Extensions management page:
   - **Chrome**: `chrome://extensions`
   - **Brave**: `brave://extensions`
   - **Opera**: `opera://extensions`
2. In the top-right corner, toggle **Developer mode** to **ON**.
3. In the top-left corner, click **Load unpacked**.
4. Select the extracted folder (the folder containing `manifest.json`).
5. VibeFeed is now installed. Pin it to your browser toolbar for quick access.

#### Microsoft Edge
1. Navigate to `edge://extensions`.
2. In the left sidebar, turn on **Developer mode**.
3. Click the **Load unpacked** button at the top.
4. Select the extracted folder containing `manifest.json`.
5. Pin VibeFeed to your toolbar.

#### Mozilla Firefox
1. Open Firefox and navigate to `about:debugging#/runtime/this-firefox`.
2. Click **Load Temporary Add-on...**.
3. Select `manifest.json` inside the extracted folder.

---

## How to Use

1. **Add Your Preferences**:
   - Click the **VibeFeed** icon in your browser toolbar.
   - Under **Active Keywords**, type any topic or hashtag (e.g. `#ai`, `coding`, `ambient`, `productivity`).
   - Press `Enter` or click **ADD**.
2. **Browse YouTube**:
   - Open [YouTube](https://www.youtube.com). Your feed will instantly display only videos matching your preferences.
3. **Discover Vibes As You Watch**:
   - Click on any video. A minimalist HUD appears in the bottom right corner showing detected topics.
   - Click any tag to add it to your feed immediately.
4. **Customize Rules**:
   - Open the popup and navigate to **Rules** to toggle Shorts hiding, adjust target fields (Title, Channel, Hashtags, Description), or add negative keywords.
   - Open **Options** to export/import your configuration as JSON or load pre-made Starter Packs.

---

## Testing & Development

Automated test suites verify feed filtering, keyword scoring, decay logic, and topic extraction:

```bash
# Run unit tests
node tests/test-engine.js
```

---

## Project Structure

```
├── manifest.json              # Universal Manifest V3 extension configuration
├── icons/                     # Extension icons (16, 32, 48, 128, 512, 1024, SVG)
├── background/
│   └── service-worker.js      # Background worker (badge count, storage sync, messaging)
├── content/
│   ├── vibe-analyzer.js       # Client-side NLP & hashtag/vibe classifier
│   ├── related-suggester.js   # Related vibe recommendations engine
│   ├── filter-engine.js       # Core feed matching algorithm & card handler
│   ├── feed-injector.js       # Curated shelf generator & feed injection
│   ├── content.js             # YouTube SPA mutation observer & floating HUD injection
│   └── content.css            # Minimalist styling, glass filters & shelf layout
├── popup/
│   ├── popup.html             # Main popup interface
│   ├── popup.css              # Styling & controls
│   └── popup.js               # Reactive popup controller & radar sync
├── options/
│   ├── options.html           # Settings & backup/export manager
│   ├── options.css            # Settings page layout
│   └── options.js             # Options logic & starter packs applier
└── tests/
    └── test-engine.js         # Automated unit test suite
```

---

## Privacy & Performance

- **Zero Data Collection**: No metrics, browsing history, or user data ever leaves your device.
- **Lightweight & Fast**: Debounced DOM mutation observers and efficient set lookups keep YouTube scrolling at 60 FPS without memory leaks.

---

## License

MIT License. Free to use, modify, and distribute.
