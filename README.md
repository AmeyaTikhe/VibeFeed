# VibeFeed ✦ Apple-Style YouTube Feed Filter & Vibe Curator

> An elegant, Cupertino dark-mode browser extension that filters your YouTube feed so you **only** see videos matching your keywords, topics, and `#hashtags`. As you watch videos, it dynamically analyzes their vibe and suggests matching interests you can add to your preference list with a single click.

---

## ✨ Features

- **Active Feed Curation & Injection**: Instead of just hiding videos and leaving empty space, VibeFeed **actively fetches and injects videos matching your preferences directly into your YouTube Home feed**. You get an Apple-styled **"✦ Curated For Your Vibe"** shelf with real playable video cards and topic tabs (`[ All Vibes ] [ #AI ] [ Coding ] [ Synthwave ] [ ↻ Refresh ]`).
- **Unrestricted Watching & Search**: When you explicitly search for any video or visit a creator's channel, VibeFeed never blocks your results. You have 100% freedom to search and watch anything you want. Filtering curates passive home feed recommendations.
- **Strict Focus Feed (Whitelist)**: Your YouTube home feed displays **only** videos adhering to your active preference list (keywords, topics, and `#hashtags`).
- **Dynamic Vibe Suggestions (On Watch)**: As you watch any YouTube video, VibeFeed's client-side NLP engine analyzes the video's title, channel, description, and hashtags. An Apple-style floating HUD appears offering instant 1-tap vibe additions (e.g. `[+ #AI]`, `[+ Python]`, `[+ Deep Work]`).
- **Vibe Radar**: A history of vibes detected from videos you've watched, complete with 1-click `[+]` addition buttons inside the popup.
- **Apple Dark Mode Aesthetics**:
  - Deep obsidian backgrounds (`#0A0A0D`), frosted glass (`backdrop-filter: blur(25px)`), and SF Pro-inspired typography.
  - Native iOS Cupertino toggle switches with smooth spring physics.
  - Interactive pill chips with `#` highlighted in luminous cyan.
- **Two Visual Filter Modes**:
  - **Clean Hide (Default)**: Collapses non-matching cards so the YouTube grid remains clean and uninterrupted.
  - **Apple Frosted Glass Blur**: Non-matching cards remain with a frosted dark blur overlay and unblur smoothly on hover.
- **Negative Keywords (Anti-Clickbait)**: Block specific terms (e.g. `prank`, `clickbait`, `drama`, `spoilers`) even if a video matches other terms.
- **Shorts Blocker**: Option to hide YouTube Shorts shelves and reels entirely.
- **Starter Packs**: 1-click curated bundles for *Deep Work & Code*, *Ambient & Lo-Fi Flow*, *Cosmos & Science*, and *Mindset & High Agency*.
- **100% Private & Local**: Zero external API calls, zero tracking. All keyword matching and vibe extraction runs locally in your browser.

---

## 🚀 How to Launch / Install in Any Browser

VibeFeed is built on the universal **Manifest V3** standard, meaning it works out of the box in all modern desktop browsers.

### 1. Google Chrome & Brave
1. Open your browser and navigate to `chrome://extensions` (or `brave://extensions` in Brave).
2. In the top-right corner, toggle **Developer mode** to **ON**.
3. In the top-left corner, click **Load unpacked**.
4. Select this project folder:
   ```
   D:\Projects\YTF
   ```
5. Click **Select Folder**. VibeFeed will now appear in your extensions toolbar!
6. *(Recommended)* Click the puzzle piece icon in the browser toolbar and pin **VibeFeed** for instant access.

---

### 2. Microsoft Edge
1. Navigate to `edge://extensions`.
2. In the left sidebar, turn on **Developer mode**.
3. Click the **Load unpacked** button at the top.
4. Select `D:\Projects\YTF`.
5. Pin VibeFeed to your toolbar.

---

### 3. Mozilla Firefox
1. Open Firefox and navigate to `about:debugging#/runtime/this-firefox`.
2. Click **Load Temporary Add-on...**.
3. Navigate into `D:\Projects\YTF` and select `manifest.json`.
4. VibeFeed is now active on YouTube!

---

## 🎯 How to Use

### 1. Curating Your Preference List
1. Click the **VibeFeed** icon in your browser toolbar.
2. In the **"My Feed"** tab, type any keyword or hashtag into the box (e.g. `#ai`, `coding`, `synthwave`, `minimalism`, `mechanical keyboards`).
3. Press `Enter` or click **Add**.
4. Open or refresh [YouTube](https://www.youtube.com). Your feed will immediately filter to only show videos adhering to those topics!

### 2. Discovering Vibes as You Watch
1. Click on and watch any YouTube video.
2. An elegant frosted-glass card will appear in the bottom-right corner:
   ```
   ✦ Vibe Detected
   [+ #Coding] [+ Machine Learning] [+ Python] [+ Tech & AI]
   ```
3. Click any chip to instantly add it to your active preference list, or tap **+ Add All**!
4. You can also view recent video suggestions anytime by opening the extension popup and tapping the **Vibe Radar** tab.

### 3. Customizing Filtering
- Switch between **Clean Hide** and **Frosted Glass Blur** in the popup.
- Turn on **Hide Shorts** in the Rules tab to remove distraction reels.
- Add negative keywords in the **Rules** tab (e.g. `prank`, `reaction`) to automatically block unwanted videos.
- Tap **Options ↗** to backup/export your preferences as JSON or apply pre-made **Starter Packs**.

---

## 📁 Codebase Architecture

```
YTF/
├── manifest.json              # Universal Manifest V3 configuration
├── icons/                     # Crisp Apple-style SVG and PNG icons (16, 32, 48, 128)
│   ├── icon.svg
│   ├── icon16.png
│   ├── icon32.png
│   ├── icon48.png
│   └── icon128.png
├── background/
│   └── service-worker.js      # Background worker (badge count, storage sync, messaging)
├── content/
│   ├── vibe-analyzer.js       # Client-side NLP & hashtag/vibe classifier
│   ├── filter-engine.js       # Core feed matching algorithm & card handler
│   ├── content.js             # YouTube SPA mutation observer & floating HUD injection
│   └── content.css            # Cupertino dark-mode glass styling & micro-animations
├── popup/
│   ├── popup.html             # Apple dark popup UI
│   ├── popup.css              # SF Pro fonts, iOS toggles, segmented tabs
│   └── popup.js               # Reactive popup controller & radar sync
├── options/
│   ├── options.html           # Full settings page & backup/export manager
│   ├── options.css            # macOS System Settings layout
│   └── options.js             # Options logic & Starter Packs applier
└── tests/
    └── test-engine.js         # Automated unit test suite for matching & vibe extraction
```

---

## 🛡️ Privacy & Performance

- **Zero Data Collection**: No metrics or browsing history leave your machine.
- **Optimized DOM Observation**: Uses `requestAnimationFrame` debouncing and `WeakSet` caching so YouTube continues scrolling smoothly at 60 FPS without stutter or memory leaks.
