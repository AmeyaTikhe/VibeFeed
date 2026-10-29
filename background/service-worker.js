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

  // Schedule auto-mode alarm (every 4 hours)
  chrome.alarms.create('vibefeed-auto-discover', { periodInMinutes: 240 });
  // Schedule keyword decay check (every 24 hours)
  chrome.alarms.create('vibefeed-keyword-decay', { periodInMinutes: 1440 });
});

// Auto Mode & Keyword Decay Alarm Handler
chrome.alarms.onAlarm.addListener(async (alarm) => {
  // ── Auto-Discovery ──────────────────────────────────────────────────────
  if (alarm.name === 'vibefeed-auto-discover') {
    const prefs = await chrome.storage.local.get(null);
    if (!prefs.autoMode) return;

    const keywords = prefs.keywords || [];
    if (keywords.length === 0) return;

    const lastRun = prefs.autoModeLastRun || 0;
    if (Date.now() - lastRun < 3 * 60 * 60 * 1000) return;

    const tabs = await chrome.tabs.query({ url: '*://*.youtube.com/*', active: true });
    for (const tab of tabs) {
      try { await chrome.tabs.sendMessage(tab.id, { action: 'AUTO_DISCOVER' }); } catch {}
    }
  }

  // ── Keyword Decay ───────────────────────────────────────────────────────
  // Remove keywords that have low engagement over time.
  // Rules:
  //   - Keyword must have been added at least 7 days ago (tracked via keywordAddedAt)
  //   - Weight < 1.05 (barely watched) AND last watched > 14 days ago (or never)
  //   - Auto-added keywords (autoAdded: true) have lower tolerance (7 days no watch)
  //   - Manually added keywords are given a longer grace period (21 days)
  //   - Never remove a keyword if it's the ONLY one in the list
  if (alarm.name === 'vibefeed-keyword-decay') {
    const prefs = await chrome.storage.local.get(null);

    // Skip if user disabled decay
    if (prefs.keywordDecay === false) return;

    const keywords = Array.isArray(prefs.keywords) ? [...prefs.keywords] : [];
    if (keywords.length <= 1) return; // Never auto-remove the last keyword

    const weights = prefs.keywordWeights || {};
    const addedAt = prefs.keywordAddedAt || {};
    const now = Date.now();
    const DAY = 86400000;

    const decayed = [];
    const surviving = [];

    for (const kw of keywords) {
      const norm = kw.toLowerCase().trim();
      const record = weights[norm] || {};
      const weight = record.weight || 1.0;
      const lastWatched = record.lastWatched || 0;
      const addedTime = addedAt[norm] || now; // Default: pretend just added
      const ageMs = now - addedTime;
      const sinceWatched = lastWatched > 0 ? now - lastWatched : Infinity;
      const isAutoAdded = record.autoAdded === true;

      // Grace period: auto-added = 7 days, manual = 21 days
      const gracePeriod = isAutoAdded ? 7 * DAY : 21 * DAY;

      // Minimum age before decay can kick in
      if (ageMs < gracePeriod) {
        surviving.push(kw);
        continue;
      }

      // Low-engagement threshold: weight barely above baseline AND not recently watched
      const inactivityThreshold = isAutoAdded ? 7 * DAY : 14 * DAY;
      const isLowEngagement = weight < 1.05 && sinceWatched > inactivityThreshold;

      if (isLowEngagement) {
        decayed.push(kw);
      } else {
        surviving.push(kw);
      }
    }

    // Guard: always keep at least 1 keyword
    if (surviving.length === 0) {
      surviving.push(keywords[0]);
      decayed.splice(decayed.indexOf(keywords[0]), 1);
    }

    if (decayed.length > 0) {
      // Record decay log and update keywords
      const decayLog = Array.isArray(prefs.decayLog) ? prefs.decayLog : [];
      for (const kw of decayed) {
        decayLog.unshift({ kw, reason: 'low_engagement', timestamp: now });
      }
      await chrome.storage.local.set({
        keywords: surviving,
        decayLog: decayLog.slice(0, 30)
      });
      console.log('[VibeFeed] Keyword decay removed:', decayed);
    }
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
    const isAutoAdded = Boolean(message.autoAdded);
    if (!keyword) {
      sendResponse({ success: false, reason: 'Empty keyword' });
      return true;
    }

    chrome.storage.local.get(['keywords', 'keywordAddedAt', 'keywordWeights'], (data) => {
      let keywords = Array.isArray(data.keywords) ? data.keywords : [];
      const lower = keyword.toLowerCase();

      const exists = keywords.some(k => k.toLowerCase() === lower);
      if (!exists) {
        keywords.push(keyword);
        // Record when it was added
        const addedAt = data.keywordAddedAt || {};
        addedAt[lower] = Date.now();
        // Mark auto-added keywords in weights so decay knows the tolerance
        const weights = data.keywordWeights || {};
        if (!weights[lower]) {
          weights[lower] = { count: 0, weight: 1.0, lastWatched: 0, autoAdded: isAutoAdded };
        } else {
          weights[lower].autoAdded = weights[lower].autoAdded || isAutoAdded;
        }
        chrome.storage.local.set({ keywords, keywordAddedAt: addedAt, keywordWeights: weights }, () => {
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

  // Proxy: fetch YouTube autocomplete suggestions (popup/options can't reach cross-origin)
  if (message.action === 'FETCH_SUGGESTIONS') {
    const keywords = Array.isArray(message.keywords) ? message.keywords : [];
    const limit = Number(message.limit) || 12;
    // keywordWeights passed from popup so higher-affinity keywords rank higher
    const weightsMap = message.keywordWeights || {};

    async function fetchForQuery(query) {
      try {
        const url = `https://suggestqueries.google.com/complete/search?client=youtube&ds=yt&q=${encodeURIComponent(query)}`;
        const res = await fetch(url);
        if (!res.ok) return [];
        const text = await res.text();
        const match = text.match(/\[.*\]/s);
        if (!match) return [];
        const parsed = JSON.parse(match[0]);
        return (parsed[1] || []).map(s => s[0]).filter(Boolean).slice(0, 10);
      } catch { return []; }
    }

    const FILLER = new Set([
      'full','course','tutorial','how','to','the','a','an','in','for','and','or',
      'beginners','advanced','complete','guide','tips','tricks','best','top',
      'new','latest','free','2024','2025','2026','2027','video','channel',
      'playlist','watch','learn','learning','official','part','episode','with'
    ]);

    // Only accept suggestions that genuinely EXTEND the seed keyword
    // (i.e. the raw autocomplete starts with the seed) — filters out garbage
    // like "chemistry of alcohols" appearing in "ielts" completions.
    function isRelevant(raw, kw) {
      const kwClean = kw.replace(/^#+/, '').trim().toLowerCase();
      const rawLower = raw.toLowerCase().trim();
      return rawLower.startsWith(kwClean);
    }

    // Extract the differentiating part after the seed keyword
    function extractTag(raw, kw) {
      const kwClean = kw.replace(/^#+/, '').trim().toLowerCase();
      const escKw = kwClean.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      // Strip the seed keyword from the front
      let text = raw.replace(new RegExp('^#?' + escKw + '\\s*', 'i'), '').trim();
      // If nothing useful left after stripping (single-word keyword = the whole suggestion),
      // fall back to using the full raw phrase
      if (!text || text.length < 2) text = raw.trim();
      // Drop trailing years
      text = text.replace(/\b(20\d{2})\b/g, '').trim();
      // Filter filler, cap at 5 words
      const words = text.split(/\s+/).filter(w => w.length > 1 && !FILLER.has(w.toLowerCase())).slice(0, 5);
      if (words.length === 0) return null;
      const tag = words.map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
      return tag.length >= 3 ? tag : null;
    }

    (async () => {
      if (keywords.length === 0) {
        sendResponse({ success: true, suggestions: [
          'Productivity', 'Deep Work', 'Minimalism', 'Coding', 'AI Tools',
          'Science Documentaries', 'Fitness', 'Lo-fi Music', 'Design', 'Philosophy'
        ].slice(0, limit) });
        return;
      }

      // Pre-seed the exclusion set with all current keywords (don't suggest what's already there)
      const activeNorm = new Set(keywords.map(k => k.trim().toLowerCase().replace(/^#+/, '')));

      // co-occurrence map: tagNorm -> { tag, score, count }
      // score = sum of keyword watch-weights for each keyword that produced this suggestion
      // count = number of distinct keywords that generated it (co-occurrence bonus)
      const coScore = new Map();

      // Fetch all keywords in parallel
      const results = await Promise.all(
        keywords.slice(0, 8).map(kw =>
          fetchForQuery(kw.replace(/^#+/, '').trim()).then(raws => ({ kw, raws }))
        )
      );

      for (const { kw, raws } of results) {
        const kwNorm = kw.toLowerCase().replace(/^#+/, '').trim();
        // Keyword's watch weight (default 1.0 for unweighted keywords)
        const kwWeight = (weightsMap[kwNorm]?.weight) || 1.0;

        const seenInQuery = new Set(); // avoid double-counting within same keyword

        for (const raw of raws) {
          // Hard relevance gate: raw must start with the keyword
          if (!isRelevant(raw, kw)) continue;

          const tag = extractTag(raw, kw);
          if (!tag) continue;

          const norm = tag.toLowerCase();

          // Skip if identical/too similar to an existing preference keyword
          if ([...activeNorm].some(a => norm === a || norm.includes(a) || a.includes(norm))) continue;
          if (seenInQuery.has(norm)) continue;
          seenInQuery.add(norm);

          const existing = coScore.get(norm) || { tag, score: 0, count: 0 };
          coScore.set(norm, {
            tag,
            score: existing.score + kwWeight, // higher-weight keywords boost the score
            count: existing.count + 1          // co-occurrence across keywords
          });
        }
      }

      // Sort: primarily by score (watch-weight sum), secondarily by co-occurrence count
      const sorted = [...coScore.values()].sort((a, b) =>
        b.score !== a.score ? b.score - a.score : b.count - a.count
      );

      // Shuffle the top tier slightly (top 2× limit) for freshness, then trim
      const topTier = sorted.slice(0, limit * 2);
      for (let i = topTier.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [topTier[i], topTier[j]] = [topTier[j], topTier[i]];
      }

      sendResponse({ success: true, suggestions: topTier.slice(0, limit).map(c => c.tag) });
    })();
    return true; // async
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
