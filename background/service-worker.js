/**
 * VibeFeed - Background Service Worker (Manifest V3)
 * Handles storage initialization, badge counters, and tab messaging.
 */

const DEFAULT_PREFERENCES = {
  enabled: true,
  filterMode: 'whitelist', // 'whitelist' = only show matching keywords, 'blacklist' = hide matching
  visualStyle: 'hide',     // 'hide' = completely collapse, 'blur' = frosted glass blur
  keywords: [
    '#ai',
    'coding',
    'productivity',
    'minimalism',
    'synthwave'
  ],
  negativeKeywords: [
    'clickbait',
    'prank',
    'drama'
  ],
  matchTarget: {
    title: true,
    channel: true,
    hashtags: true,
    description: true
  },
  filterScope: {
    homeFeed: true,
    subscriptions: false,
    search: false,
    sidebar: true
  },
  feedCuration: true,
  hideShorts: false,
  showFloatingBadge: true,
  autoSuggestOnWatch: true,
  adaptiveWatchWeights: true, // Learn and prioritize recurring interests from watch history
  diversityGuardrail: true,   // Ensure diverse topics with max cap so one topic never dominates
  keywordWeights: {},         // { [kw]: { count: number, weight: number, lastWatched: number } }
  stats: {
    totalFiltered: 0,
    sessionFiltered: 0
  },
  recentVibes: []
};

// Initialize default storage on installation
chrome.runtime.onInstalled.addListener(async (details) => {
  console.log('[VibeFeed] Extension installed or updated:', details.reason);
  
  const existing = await chrome.storage.local.get(null);
  const merged = { ...DEFAULT_PREFERENCES, ...existing };
  
  // Ensure array safety
  if (!Array.isArray(merged.keywords)) merged.keywords = DEFAULT_PREFERENCES.keywords;
  if (!Array.isArray(merged.negativeKeywords)) merged.negativeKeywords = DEFAULT_PREFERENCES.negativeKeywords;
  if (!Array.isArray(merged.recentVibes)) merged.recentVibes = [];
  if (!merged.matchTarget) merged.matchTarget = DEFAULT_PREFERENCES.matchTarget;
  if (!merged.stats) merged.stats = DEFAULT_PREFERENCES.stats;

  await chrome.storage.local.set(merged);

  // Set default badge styling
  try {
    await chrome.action.setBadgeBackgroundColor({ color: '#0A84FF' });
  } catch (err) {
    console.warn('[VibeFeed] Could not set badge color:', err);
  }
});

// Handle incoming messages from content scripts and popup
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'UPDATE_BADGE' && sender.tab?.id) {
    const tabId = sender.tab.id;
    const count = Number(message.count) || 0;
    const text = count > 0 ? (count > 99 ? '99+' : String(count)) : '';
    
    chrome.action.setBadgeText({ text, tabId }).catch(() => {});
    chrome.action.setBadgeBackgroundColor({ color: '#0A84FF', tabId }).catch(() => {});
    sendResponse({ success: true });
    return true;
  }

  if (message.action === 'ADD_KEYWORD') {
    const keyword = (message.keyword || '').trim();
    if (!keyword) {
      sendResponse({ success: false, reason: 'Empty keyword' });
      return true;
    }

    chrome.storage.local.get(['keywords'], (data) => {
      let keywords = Array.isArray(data.keywords) ? data.keywords : [];
      const lower = keyword.toLowerCase();
      
      const exists = keywords.some(k => k.toLowerCase() === lower);
      if (!exists) {
        keywords.push(keyword);
        chrome.storage.local.set({ keywords }, () => {
          sendResponse({ success: true, added: keyword, keywords });
        });
      } else {
        sendResponse({ success: false, reason: 'Already exists', keywords });
      }
    });
    return true;
  }

  if (message.action === 'RECORD_VIBE') {
    const vibe = message.vibe;
    if (!vibe || !vibe.videoTitle) {
      sendResponse({ success: false });
      return true;
    }

    chrome.storage.local.get(['recentVibes'], (data) => {
      let vibes = Array.isArray(data.recentVibes) ? data.recentVibes : [];
      // Keep unique by videoId or title, limit to 20 recent
      vibes = vibes.filter(v => v.videoId !== vibe.videoId && v.videoTitle !== vibe.videoTitle);
      vibes.unshift(vibe);
      if (vibes.length > 20) vibes = vibes.slice(0, 20);

      chrome.storage.local.set({ recentVibes: vibes }, () => {
        sendResponse({ success: true });
      });
    });
    return true;
  }

  if (message.action === 'INCREMENT_KEYWORD_WEIGHT') {
    const matched = message.matchedKeywords || [];
    if (!Array.isArray(matched) || matched.length === 0) {
      sendResponse({ success: false });
      return true;
    }

    chrome.storage.local.get(['keywordWeights'], (data) => {
      const weights = data.keywordWeights || {};
      for (const kw of matched) {
        const key = kw.toLowerCase().trim();
        const currentCount = weights[key]?.count || 0;
        const newCount = currentCount + 1;
        // Diminishing returns weight formula: capped at 2.4 so no single keyword ever exceeds diversity limits
        const calculatedWeight = Math.min(2.4, 1.0 + Math.log10(newCount + 1) * 1.2);
        weights[key] = {
          count: newCount,
          weight: Number(calculatedWeight.toFixed(2)),
          lastWatched: Date.now()
        };
      }
      chrome.storage.local.set({ keywordWeights: weights }, () => {
        sendResponse({ success: true, weights });
      });
    });
    return true;
  }

  if (message.action === 'RESET_KEYWORD_WEIGHTS') {
    chrome.storage.local.set({ keywordWeights: {} }, () => {
      sendResponse({ success: true });
    });
    return true;
  }

  if (message.action === 'INCREMENT_FILTER_COUNT') {
    const increment = Number(message.amount) || 1;
    chrome.storage.local.get(['stats'], (data) => {
      const stats = data.stats || { totalFiltered: 0, sessionFiltered: 0 };
      stats.totalFiltered = (stats.totalFiltered || 0) + increment;
      stats.sessionFiltered = (stats.sessionFiltered || 0) + increment;
      chrome.storage.local.set({ stats });
    });
    sendResponse({ success: true });
    return true;
  }
});
