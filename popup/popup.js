/**
 * VibeFeed - Popup Controller
 * Manages preferences, real-time list curation, and watch-vibe history.
 */

document.addEventListener('DOMContentLoaded', async () => {
  // DOM Elements
  const masterToggle = document.getElementById('master-toggle');
  const statusText = document.getElementById('status-text');
  const keywordInput = document.getElementById('keyword-input');
  const addKeywordBtn = document.getElementById('add-keyword-btn');
  const keywordsList = document.getElementById('keywords-list');
  const keywordsCount = document.getElementById('keywords-count');
  const emptyKeywordsHint = document.getElementById('empty-keywords-hint');
  const clearAllKeywordsBtn = document.getElementById('clear-all-keywords');
  
  const visualStyleGroup = document.getElementById('visual-style-group');
  const filterModeGroup = document.getElementById('filter-mode-group');
  
  const negativeInput = document.getElementById('negative-input');
  const addNegativeBtn = document.getElementById('add-negative-btn');
  const negativeChipsList = document.getElementById('negative-chips-list');
  const negativeCount = document.getElementById('negative-count');

  const relatedSuggestionsList = document.getElementById('related-suggestions-list');
  const refreshSuggestionsBtn = document.getElementById('refresh-suggestions-btn');
  const toggleAutoMode = document.getElementById('toggle-auto-mode');
  const autoModeBody = document.getElementById('auto-mode-body');
  const autoModeStatusText = document.getElementById('auto-mode-status-text');
  const autoModeLog = document.getElementById('auto-mode-log');
  const autoRunNowBtn = document.getElementById('auto-run-now-btn');

  const toggleHideShorts = document.getElementById('toggle-hide-shorts');
  const toggleMatchChannel = document.getElementById('toggle-match-channel');
  const toggleWatchHud = document.getElementById('toggle-watch-hud');
  const toggleFeedCuration = document.getElementById('toggle-feed-curation');
  const toggleUnrestrictedSearch = document.getElementById('toggle-unrestricted-search');
  const toggleWatchWeights = document.getElementById('toggle-watch-weights');
  const toggleDiversityGuard = document.getElementById('toggle-diversity-guard');
  const btnResetWeights = document.getElementById('btn-reset-weights');
  const toggleKeywordDecay = document.getElementById('toggle-keyword-decay');
  const decayLogPreview = document.getElementById('decay-log-preview');
  const btnRestoreDecayed = document.getElementById('btn-restore-decayed');

  const vibeHistoryContainer = document.getElementById('vibe-history-container');
  const emptyRadarHint = document.getElementById('empty-radar-hint');
  const clearRadarBtn = document.getElementById('clear-radar-history');
  const radarCount = document.getElementById('radar-count');
  const radarBadge = document.getElementById('radar-badge');

  const segmentBtns = document.querySelectorAll('.segment-btn');
  const tabContents = document.querySelectorAll('.tab-content');
  const openOptionsBtn = document.getElementById('open-options-btn');
  const footerStats = document.getElementById('footer-stats');

  // Load preferences from storage
  let preferences = await new Promise((resolve) => {
    chrome.storage.local.get(null, resolve);
  });

  // Default fallback safety
  preferences = {
    enabled: preferences.enabled !== false,
    filterMode: preferences.filterMode || 'whitelist',
    visualStyle: preferences.visualStyle || 'hide',
    keywords: Array.isArray(preferences.keywords) ? preferences.keywords : ['#ai', 'coding', 'minimalism'],
    negativeKeywords: Array.isArray(preferences.negativeKeywords) ? preferences.negativeKeywords : ['clickbait', 'prank'],
    matchTarget: preferences.matchTarget || { title: true, channel: true, hashtags: true, description: true },
    hideShorts: Boolean(preferences.hideShorts),
    autoSuggestOnWatch: preferences.autoSuggestOnWatch !== false,
    recentVibes: Array.isArray(preferences.recentVibes) ? preferences.recentVibes : [],
    ...preferences
  };

  /**
   * Save preference slice to chrome.storage.local
   */
  function save(slice) {
    preferences = { ...preferences, ...slice };
    chrome.storage.local.set(slice);
  }

  /**
   * Initialize UI states
   */
  function initUI() {
    // Master Switch
    masterToggle.checked = preferences.enabled;
    updateStatusLabel(preferences.enabled);

    // Visual Style Selector
    visualStyleGroup.querySelectorAll('.pill-btn').forEach(btn => {
      btn.classList.toggle('active', btn.getAttribute('data-style') === preferences.visualStyle);
    });

    // Filter Mode Selector
    filterModeGroup.querySelectorAll('.pill-btn').forEach(btn => {
      btn.classList.toggle('active', btn.getAttribute('data-mode') === preferences.filterMode);
    });

    // Rules Toggles
    toggleHideShorts.checked = preferences.hideShorts;
    toggleMatchChannel.checked = preferences.matchTarget.channel;
    toggleWatchHud.checked = preferences.autoSuggestOnWatch;
    if (toggleFeedCuration) toggleFeedCuration.checked = preferences.feedCuration !== false;
    if (toggleUnrestrictedSearch) toggleUnrestrictedSearch.checked = !preferences.filterScope?.search;
    if (toggleWatchWeights) toggleWatchWeights.checked = preferences.adaptiveWatchWeights !== false;
    if (toggleDiversityGuard) toggleDiversityGuard.checked = preferences.diversityGuardrail !== false;

    // Auto Mode
    if (toggleAutoMode) {
      toggleAutoMode.checked = preferences.autoMode === true;
      updateAutoModeUI(preferences.autoMode === true);
    }

    // Keyword Decay
    if (toggleKeywordDecay) toggleKeywordDecay.checked = preferences.keywordDecay !== false;
    renderDecayLog();

    // Render Lists
    renderKeywordsList();
    renderRelatedSuggestions();
    renderNegativeChips();
    renderVibeRadar();
    renderAutoModeLog();
    updateFooterStats();
  }

  function updateStatusLabel(enabled) {
    if (enabled) {
      statusText.innerHTML = '<span class="status-indicator"></span>ONLINE';
      statusText.classList.remove('disabled');
      footerStats.textContent = 'SYSTEM ACTIVE';
    } else {
      statusText.innerHTML = '<span class="status-indicator"></span>PAUSED';
      statusText.classList.add('disabled');
      footerStats.textContent = 'SYSTEM PAUSED';
    }
  }

  function updateFooterStats() {
    const total = preferences.keywords.length;
    footerStats.textContent = preferences.enabled
      ? `${total} active ${total === 1 ? 'rule' : 'rules'} running`
      : 'Filtering paused';
  }

  /**
   * Render Preference Keywords Chips
   */
  function renderKeywordsList() {
    keywordsList.innerHTML = '';
    const keywords = preferences.keywords || [];
    keywordsCount.textContent = keywords.length;

    if (keywords.length === 0) {
      emptyKeywordsHint.style.display = 'flex';
      return;
    }
    emptyKeywordsHint.style.display = 'none';

    keywords.forEach((kw, index) => {
      const isHashtag = kw.startsWith('#');
      const record = preferences.keywordWeights?.[kw.toLowerCase()];
      const isHighAffinity = record && record.weight > 1.3;

      const chip = document.createElement('div');
      chip.className = `preference-chip ${isHashtag ? 'is-hashtag' : ''} ${isHighAffinity ? 'is-elevated' : ''}`;
      chip.innerHTML = `
        ${isHighAffinity ? '<span class="chip-affinity-sparkle" title="High watch affinity (frequently watched)">✦</span>' : ''}
        <span class="chip-text">${escapeHtml(kw)}</span>
        <button class="chip-remove-btn" title="Remove" data-index="${index}">✕</button>
      `;

      chip.querySelector('.chip-remove-btn').addEventListener('click', (e) => {
        e.stopPropagation();
        removeKeyword(index);
      });

      keywordsList.appendChild(chip);
    });
  }

  // ── Suggestion helpers ────────────────────────────────────────────────────

  const SUGG_FILLER = new Set([
    'full','course','tutorial','how','to','the','a','an','in','for','and','or',
    'beginners','advanced','complete','guide','tips','tricks','best','top',
    'new','latest','free','2024','2025','2026','2027','video','channel',
    'playlist','watch','learn','learning','official','part','episode','with','is','are'
  ]);

  // Normalise: strip #, split camelCase, lowercase
  function suggNormalise(kw) {
    return kw.replace(/^#+/, '').trim()
      .replace(/([a-z])([A-Z])/g, '$1 $2')
      .replace(/([a-zA-Z])(\d)/g, '$1 $2')
      .toLowerCase().trim();
  }

  // Fetch one autocomplete query with a hard per-request timeout
  async function fetchAutocompleteDirect(query, timeoutMs = 3000) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const url = `https://suggestqueries.google.com/complete/search?client=youtube&ds=yt&q=${encodeURIComponent(query)}`;
      const res = await fetch(url, { signal: controller.signal });
      if (!res.ok) return [];
      const text = await res.text();
      const match = text.match(/\[.*\]/s);
      if (!match) return [];
      const parsed = JSON.parse(match[0]);
      return (parsed[1] || []).map(s => s[0]).filter(Boolean).slice(0, 10);
    } catch { return []; }
    finally { clearTimeout(timer); }
  }

  // Extract a clean tag from a raw autocomplete suggestion
  function suggExtractTag(raw, baseQuery) {
    const esc  = baseQuery.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    let   text = raw.replace(new RegExp('^' + esc + '\\s*', 'i'), '').trim();
    if (!text || text.length < 2) text = raw.trim();
    text = text.replace(/\b(20\d{2})\b/g, '').trim();
    const words = text.split(/\s+/).filter(w => w.length > 1 && !SUGG_FILLER.has(w.toLowerCase())).slice(0, 5);
    if (words.length === 0) return null;
    const tag = words.map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
    return tag.length >= 3 ? tag : null;
  }

  /**
   * Fetch live suggestions directly from suggestqueries.google.com.
   * The popup has host_permissions for this URL so no SW proxy needed.
   * Each request has a 3s timeout; total wall-clock cap is 8s.
   */
  async function fetchLiveSuggestions(keywords, limit = 12) {
    if (!keywords || keywords.length === 0) return [];

    const weightsMap = preferences.keywordWeights || {};
    const activeNorm = new Set(keywords.map(k => suggNormalise(k)));

    // Cluster by first word (max 5 chars) to find dominant theme
    const clusters = new Map();
    for (const kw of keywords) {
      const norm      = suggNormalise(kw);
      const firstWord = norm.split(/\s+/)[0];
      const ck        = firstWord.length > 5 ? firstWord.slice(0, 5) : firstWord;
      const wt        = weightsMap[norm]?.weight || 1.0;
      if (!clusters.has(ck)) {
        clusters.set(ck, { baseQuery: firstWord, members: [], totalWeight: 0 });
      }
      const cl = clusters.get(ck);
      cl.members.push(kw);
      cl.totalWeight += wt;
      // Keep baseQuery as shortest first-word (most general)
      if (firstWord.length <= cl.baseQuery.length) cl.baseQuery = firstWord;
    }

    // Build query plan: dominant cluster gets proportionally more slots (max 6 total)
    const totalWeight = [...clusters.values()].reduce((s, c) => s + c.totalWeight, 0);
    const rawPlan = [];
    for (const cl of clusters.values()) {
      const budget = Math.max(1, Math.round((cl.totalWeight / (totalWeight || 1)) * 6));
      rawPlan.push({ query: cl.baseQuery, baseQuery: cl.baseQuery, clusterWeight: cl.totalWeight });
      if (budget >= 2) {
        for (const kw of cl.members.slice(0, budget - 1)) {
          const q = suggNormalise(kw);
          if (q !== cl.baseQuery) {
            rawPlan.push({ query: q, baseQuery: cl.baseQuery, clusterWeight: cl.totalWeight });
          }
        }
      }
    }

    // Deduplicate
    const seenQ = new Set();
    const queryPlan = rawPlan.filter(p => seenQ.has(p.query) ? false : (seenQ.add(p.query), true));

    // Fetch all in parallel — all have per-request 3s timeouts, plus an 8s total cap
    let results;
    try {
      results = await Promise.race([
        Promise.all(queryPlan.map(p => fetchAutocompleteDirect(p.query).then(raws => ({ ...p, raws })))),
        new Promise(resolve => setTimeout(() => resolve(null), 8000))
      ]);
    } catch { results = null; }

    if (!results) return []; // timed out

    // Score by co-occurrence + cluster weight
    const seenNorms = new Set(activeNorm);
    const coScore   = new Map();
    for (const { raws, baseQuery, clusterWeight } of results) {
      const seenInQ = new Set();
      for (const raw of raws) {
        if (!raw.toLowerCase().trim().startsWith(baseQuery.toLowerCase().trim())) continue;
        const tag = suggExtractTag(raw, baseQuery);
        if (!tag) continue;
        const norm = tag.toLowerCase();
        if ([...seenNorms].some(a => norm === a || norm.includes(a) || a.includes(norm))) continue;
        if (seenInQ.has(norm)) continue;
        seenInQ.add(norm);
        const ex = coScore.get(norm) || { tag, score: 0, count: 0 };
        coScore.set(norm, { tag, score: ex.score + clusterWeight, count: ex.count + 1 });
      }
    }

    const ranked = [...coScore.values()].sort((a, b) =>
      b.score !== a.score ? b.score - a.score : b.count - a.count
    );
    // Light shuffle within top tier for freshness
    const top = ranked.slice(0, limit * 2);
    for (let i = top.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [top[i], top[j]] = [top[j], top[i]];
    }
    return top.slice(0, limit).map(c => c.tag);
  }

  /**
   * Instant offline fallback — shown if live fetch fails or returns nothing
   */
  function getFallbackSuggestions(keywords) {
    if (!keywords || keywords.length === 0) return [];
    const QUICK_MAP = {
      ielts: ['Band Score', 'Academic Module', 'General Training', 'Reading Strategies', 'Exam Prep'],
      toefl: ['TOEFL Speaking', 'TOEFL Writing', 'Academic English', 'Integrated Task'],
      coding: ['System Design', 'Clean Code', 'Open Source', 'DevOps', 'Algorithms'],
      python: ['Data Structures', 'FastAPI', 'Django', 'NumPy', 'Automation Scripts'],
      ai: ['LangChain', 'Prompt Engineering', 'AI Agents', 'Vector Databases', 'Fine-tuning'],
      synthwave: ['Retrowave Mix', 'Dark Ambient', 'Outrun Music', 'Chillwave'],
      lofi: ['Study Beats', 'Jazz Hop', 'Focus Instrumentals', 'Ambient Chill'],
      minimalism: ['Desk Setup', 'Digital Declutter', 'Simple Living', 'Capsule Wardrobe'],
      productivity: ['Deep Work', 'Time Blocking', 'Second Brain', 'Notion Setup', 'Focus Flow'],
      fitness: ['Calisthenics', 'Mobility Routine', 'Zone 2 Cardio', 'Strength Training'],
      music: ['Music Theory', 'Ear Training', 'Composition', 'DAW Tutorial'],
      design: ['UI Design', 'Typography', 'Color Theory', 'Figma Tutorial'],
      finance: ['Personal Finance', 'Investing Basics', 'Stock Market', 'Budgeting'],
    };
    const activeNorm = new Set(keywords.map(k => suggNormalise(k)));
    const out = []; const seen = new Set();

    // Weight by cluster: keywords that appear more get their fallbacks first
    const clusterCounts = new Map();
    for (const kw of keywords) {
      const norm = suggNormalise(kw);
      const matchKey = Object.keys(QUICK_MAP).find(k => norm.includes(k) || k.includes(norm.split(' ')[0]));
      if (matchKey) clusterCounts.set(matchKey, (clusterCounts.get(matchKey) || 0) + 1);
    }
    const sortedKeys = [...clusterCounts.entries()].sort((a, b) => b[1] - a[1]).map(e => e[0]);

    for (const matchKey of sortedKeys) {
      for (const tag of QUICK_MAP[matchKey]) {
        const tn = tag.toLowerCase();
        if (!activeNorm.has(tn) && !seen.has(tn)) { seen.add(tn); out.push(tag); }
      }
    }
    // Generic hints for unmatched keywords
    for (const kw of keywords) {
      const norm = suggNormalise(kw);
      if (![...clusterCounts.keys()].some(k => norm.includes(k) || k.includes(norm.split(' ')[0]))) {
        for (const suffix of [' practice', ' techniques', ' strategies']) {
          const tag = norm.charAt(0).toUpperCase() + norm.slice(1) + suffix;
          const tn = tag.toLowerCase();
          if (!activeNorm.has(tn) && !seen.has(tn)) { seen.add(tn); out.push(tag); }
        }
      }
    }
    return out.slice(0, 12);
  }

  /**
   * Render Suggested Related Keywords — fetches live, falls back instantly
   */
  async function renderRelatedSuggestions(showLoading = true) {
    if (!relatedSuggestionsList) return;

    if (showLoading) {
      relatedSuggestionsList.innerHTML = `
        <div class="nothing-fizz-wrapper">
          <div class="nothing-fizz-particles"></div>
          <div class="nothing-fizz-dots"></div>
          <div class="nothing-fizz-gradient"></div>
          <div class="nothing-fizz-content">
            <div class="nothing-fizz-badge">
              <span class="nothing-fizz-pulse"></span>
              <span>SYNTHESIZING VIBES</span>
            </div>
            <div class="nothing-fizz-sub">Reading semantic frequency...</div>
          </div>
        </div>
      `;
    }

    const keywords = preferences.keywords || [];

    // Show fallback immediately after 1s if live fetch hasn't resolved yet
    let resolved = false;
    const fallbackTimer = setTimeout(() => {
      if (!resolved) {
        const fb = getFallbackSuggestions(keywords);
        if (fb.length > 0) renderSuggestionChips(fb);
      }
    }, 1500);

    let suggestions = [];
    try {
      suggestions = await fetchLiveSuggestions(keywords, 12);
    } catch { /* ignore */ }
    finally { clearTimeout(fallbackTimer); }

    resolved = true;

    if (!suggestions || suggestions.length === 0) {
      suggestions = getFallbackSuggestions(keywords);
    }

    renderSuggestionChips(suggestions);
  }

  function renderSuggestionChips(suggestions) {
    relatedSuggestionsList.innerHTML = '';
    if (!suggestions || suggestions.length === 0) {
      relatedSuggestionsList.innerHTML = `<span class="suggestions-empty">Add some keywords first to see suggestions!</span>`;
      return;
    }
    suggestions.forEach(vibe => {
      const isHashtag = vibe.startsWith('#');
      const chip = document.createElement('button');
      chip.className = `suggested-vibe-chip ${isHashtag ? 'is-hashtag' : ''}`;
      chip.setAttribute('data-vibe', vibe);
      chip.innerHTML = `
        <span class="chip-plus">+</span>
        <span class="chip-text">${escapeHtml(vibe)}</span>
      `;
      chip.addEventListener('click', (e) => {
        e.stopPropagation();
        addKeyword(vibe);
        chip.classList.add('added');
        chip.querySelector('.chip-plus').textContent = '✓';
        setTimeout(() => renderRelatedSuggestions(), 500);
      });
      relatedSuggestionsList.appendChild(chip);
    });
  }

  // ============================================================
  // Auto Mode
  // ============================================================

  function updateAutoModeUI(isActive) {
    if (!autoModeBody) return;
    autoModeBody.style.display = isActive ? 'block' : 'none';
    if (isActive) renderAutoModeLog();
  }

  function renderAutoModeLog() {
    if (!autoModeLog) return;
    const log = Array.isArray(preferences.autoModeLog) ? preferences.autoModeLog : [];
    if (log.length === 0) {
      autoModeLog.innerHTML = '<div class="auto-log-empty">No auto-discoveries yet. Run discovery to start.</div>';
      return;
    }
    autoModeLog.innerHTML = log.slice(0, 8).map(entry => `
      <div class="auto-log-entry">
        <span class="auto-log-sparkle">✦</span>
        <span class="auto-log-tag">${escapeHtml(entry.tag)}</span>
        <span class="auto-log-source">via "${escapeHtml(entry.source)}"</span>
        <span class="auto-log-time">${formatRelativeTime(entry.timestamp)}</span>
      </div>
    `).join('');
  }

  async function runAutoDiscovery(isManual = false) {
    if (!window.VibeFeedRelatedSuggester) return;
    const kws = preferences.keywords || [];
    if (kws.length === 0) return;

    if (autoModeStatusText) autoModeStatusText.textContent = isManual ? '✦ Discovering...' : 'Running scheduled discovery...';
    if (autoRunNowBtn) { autoRunNowBtn.disabled = true; autoRunNowBtn.textContent = '✦ Discovering...'; }

    let newTags = [];
    try {
      newTags = await window.VibeFeedRelatedSuggester.autoDiscoverKeywords(kws);
    } catch {
      newTags = [];
    }

    const added = [];
    const existingNorm = new Set((preferences.keywords || []).map(k => k.toLowerCase()));
    const updatedKeywords = [...(preferences.keywords || [])];

    for (const tag of newTags) {
      if (!existingNorm.has(tag.toLowerCase())) {
        existingNorm.add(tag.toLowerCase());
        updatedKeywords.push(tag);
        added.push(tag);
      }
    }

    // Record to auto mode log and batch save
    if (added.length > 0) {
      preferences.keywords = updatedKeywords;
      const log = Array.isArray(preferences.autoModeLog) ? preferences.autoModeLog : [];
      const newEntries = added.map(tag => ({
        tag,
        source: kws[0] || 'your vibes',
        timestamp: Date.now()
      }));
      const updatedLog = [...newEntries, ...log].slice(0, 20);
      save({ keywords: updatedKeywords, autoModeLog: updatedLog, autoModeLastRun: Date.now() });
      renderKeywordsList();
      updateFooterStats();
      renderVibeRadar();
    } else {
      save({ autoModeLastRun: Date.now() });
    }

    if (autoModeStatusText) {
      autoModeStatusText.textContent = added.length > 0
        ? `✓ Added: ${added.join(', ')}`
        : 'Nothing new to add right now.';
    }
    if (autoRunNowBtn) { autoRunNowBtn.disabled = false; autoRunNowBtn.textContent = '✦ Run Discovery Now'; }
    renderAutoModeLog();
    renderRelatedSuggestions(false);
  }

  function formatRelativeTime(ts) {
    if (!ts) return '';
    const diff = Date.now() - ts;
    if (diff < 60000) return 'just now';
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
    return `${Math.floor(diff / 86400000)}d ago`;
  }

  function addKeyword(rawText, shouldFocusInput = false) {
    let kw = (rawText || '').trim();
    if (!kw) return;

    // Remove leading excessive hashes
    if (kw.startsWith('##')) kw = '#' + kw.replace(/^#+/, '');

    const lower = kw.toLowerCase();
    const existing = (preferences.keywords || []).map(k => k.toLowerCase());

    if (!existing.includes(lower)) {
      const updated = [...preferences.keywords, kw];
      save({ keywords: updated });
      renderKeywordsList();
      renderRelatedSuggestions(false);
      updateFooterStats();
      renderVibeRadar(); // Refresh radar added states
    }

    if (shouldFocusInput && keywordInput) {
      keywordInput.value = '';
      keywordInput.focus();
    }
  }

  function removeKeyword(index) {
    const updated = [...preferences.keywords];
    updated.splice(index, 1);
    save({ keywords: updated });
    renderKeywordsList();
    renderRelatedSuggestions();
    updateFooterStats();
    renderVibeRadar();
  }

  /**
   * Render Negative Keywords (Anti-Clickbait)
   */
  function renderNegativeChips() {
    negativeChipsList.innerHTML = '';
    const negs = preferences.negativeKeywords || [];
    negativeCount.textContent = negs.length;

    negs.forEach((neg, index) => {
      const chip = document.createElement('div');
      chip.className = 'preference-chip is-negative';
      chip.innerHTML = `
        <span class="chip-text">${escapeHtml(neg)}</span>
        <button class="chip-remove-btn" title="Remove" data-index="${index}">✕</button>
      `;

      chip.querySelector('.chip-remove-btn').addEventListener('click', () => {
        const updated = [...preferences.negativeKeywords];
        updated.splice(index, 1);
        save({ negativeKeywords: updated });
        renderNegativeChips();
      });

      negativeChipsList.appendChild(chip);
    });
  }

  function addNegativeKeyword(rawText) {
    const text = (rawText || '').trim().toLowerCase();
    if (!text) return;

    const existing = (preferences.negativeKeywords || []).map(k => k.toLowerCase());
    if (!existing.includes(text)) {
      const updated = [...preferences.negativeKeywords, text];
      save({ negativeKeywords: updated });
      renderNegativeChips();
    }
    negativeInput.value = '';
  }

  /**
   * Render Vibe Radar (Extracted from Watch History)
   */
  function renderVibeRadar() {
    vibeHistoryContainer.innerHTML = '';
    const recent = preferences.recentVibes || [];
    radarCount.textContent = recent.length;

    if (recent.length === 0) {
      emptyRadarHint.style.display = 'flex';
      radarBadge.classList.remove('show');
      return;
    }
    emptyRadarHint.style.display = 'none';
    radarBadge.classList.add('show');

    const activeSet = new Set((preferences.keywords || []).map(k => k.toLowerCase()));

    recent.forEach(item => {
      const card = document.createElement('div');
      card.className = 'radar-video-card';

      const pillsHtml = (item.vibes || []).map(vibe => {
        const isAdded = activeSet.has(vibe.toLowerCase());
        return `
          <button class="radar-vibe-pill ${isAdded ? 'added' : ''}" data-vibe="${escapeHtml(vibe)}">
            <span>${isAdded ? '✓' : '+'}</span>
            <span>${escapeHtml(vibe)}</span>
          </button>
        `;
      }).join('');

      card.innerHTML = `
        <div class="radar-video-title" title="${escapeHtml(item.videoTitle)}">${escapeHtml(item.videoTitle)}</div>
        <div class="radar-video-channel">${escapeHtml(item.channelName || 'YouTube')}</div>
        <div class="radar-chips-wrap">
          ${pillsHtml}
        </div>
      `;

      // Attach pill click events
      card.querySelectorAll('.radar-vibe-pill:not(.added)').forEach(pill => {
        pill.addEventListener('click', (e) => {
          e.stopPropagation();
          const tag = pill.getAttribute('data-vibe');
          addKeyword(tag);
          pill.classList.add('added');
          pill.querySelector('span').textContent = '✓';
        });
      });

      vibeHistoryContainer.appendChild(card);
    });
  }

  // Segment Navigation Tabs
  segmentBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const tabId = btn.getAttribute('data-tab');

      segmentBtns.forEach(b => b.classList.remove('active'));
      tabContents.forEach(t => t.classList.remove('active'));

      btn.classList.add('active');
      const target = document.getElementById(tabId);
      if (target) target.classList.add('active');

      if (tabId === 'tab-vibe') {
        radarBadge.classList.remove('show');
      }
    });
  });

  /**
   * Render Keyword Decay log preview in Rules tab
   */
  function renderDecayLog() {
    if (!decayLogPreview) return;
    const log = Array.isArray(preferences.decayLog) ? preferences.decayLog : [];
    if (log.length === 0) {
      decayLogPreview.textContent = 'None removed yet';
      if (btnRestoreDecayed) btnRestoreDecayed.style.display = 'none';
      return;
    }
    const recent = log.slice(0, 3).map(e => e.kw).join(', ');
    decayLogPreview.textContent = `Removed: ${recent}`;
    if (btnRestoreDecayed) btnRestoreDecayed.style.display = 'inline';
  }

  // Master Switch Event
  masterToggle.addEventListener('change', () => {
    const isEnabled = masterToggle.checked;
    save({ enabled: isEnabled });
    updateStatusLabel(isEnabled);
  });

  // Visual Style Event (Hide vs Blur)
  visualStyleGroup.addEventListener('click', (e) => {
    const btn = e.target.closest('.pill-btn');
    if (!btn) return;
    visualStyleGroup.querySelectorAll('.pill-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    save({ visualStyle: btn.getAttribute('data-style') });
  });

  // Filter Mode Event (Whitelist vs Blacklist)
  filterModeGroup.addEventListener('click', (e) => {
    const btn = e.target.closest('.pill-btn');
    if (!btn) return;
    filterModeGroup.querySelectorAll('.pill-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    save({ filterMode: btn.getAttribute('data-mode') });
  });

  // Add Keyword Listeners
  addKeywordBtn.addEventListener('click', () => addKeyword(keywordInput.value, true));
  keywordInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      addKeyword(keywordInput.value, true);
    }
  });

  // Add Negative Keyword Listeners
  addNegativeBtn.addEventListener('click', () => addNegativeKeyword(negativeInput.value));
  negativeInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      addNegativeKeyword(negativeInput.value);
    }
  });

  // Refresh Suggestions Button
  if (refreshSuggestionsBtn) {
    refreshSuggestionsBtn.addEventListener('click', () => {
      renderRelatedSuggestions();
    });
  }

  // Auto Mode Toggle (smooth preference toggle, no UI jumping or re-render loops)
  if (toggleAutoMode) {
    toggleAutoMode.addEventListener('change', () => {
      const isOn = toggleAutoMode.checked;
      save({ autoMode: isOn });
      updateAutoModeUI(isOn);
    });
  }

  // Run Discovery Now button
  if (autoRunNowBtn) {
    autoRunNowBtn.addEventListener('click', () => {
      runAutoDiscovery(true);
    });
  }

  if (toggleWatchWeights) {
    toggleWatchWeights.addEventListener('change', () => {
      save({ adaptiveWatchWeights: toggleWatchWeights.checked });
    });
  }

  if (toggleDiversityGuard) {
    toggleDiversityGuard.addEventListener('change', () => {
      save({ diversityGuardrail: toggleDiversityGuard.checked });
    });
  }

  if (btnResetWeights) {
    btnResetWeights.addEventListener('click', () => {
      chrome.runtime.sendMessage({ action: 'RESET_KEYWORD_WEIGHTS' }, () => {
        preferences.keywordWeights = {};
        renderKeywordsList();
        btnResetWeights.textContent = '✓ Done';
        setTimeout(() => btnResetWeights.textContent = 'Reset', 1500);
      });
    });
  }

  // Keyword Decay Toggle
  if (toggleKeywordDecay) {
    toggleKeywordDecay.addEventListener('change', () => {
      save({ keywordDecay: toggleKeywordDecay.checked });
    });
  }

  // Restore Decayed Keywords
  if (btnRestoreDecayed) {
    btnRestoreDecayed.addEventListener('click', () => {
      const log = Array.isArray(preferences.decayLog) ? preferences.decayLog : [];
      const toRestore = log.slice(0, 3).map(e => e.kw);
      for (const kw of toRestore) addKeyword(kw);
      save({ decayLog: log.slice(3) });
      renderDecayLog();
    });
  }

  // Clear All Keywords
  clearAllKeywordsBtn.addEventListener('click', () => {
    if (confirm('Clear all keywords from your preference list?')) {
      save({ keywords: [] });
      renderKeywordsList();
      renderRelatedSuggestions();
      updateFooterStats();
      renderVibeRadar();
    }
  });

  // Clear Radar History
  clearRadarBtn.addEventListener('click', () => {
    save({ recentVibes: [] });
    renderVibeRadar();
  });

  // Rules Toggles Listeners
  toggleHideShorts.addEventListener('change', () => {
    save({ hideShorts: toggleHideShorts.checked });
  });

  toggleMatchChannel.addEventListener('change', () => {
    const updated = { ...preferences.matchTarget, channel: toggleMatchChannel.checked };
    save({ matchTarget: updated });
  });

  toggleWatchHud.addEventListener('change', () => {
    save({ autoSuggestOnWatch: toggleWatchHud.checked });
  });

  if (toggleFeedCuration) {
    toggleFeedCuration.addEventListener('change', () => {
      save({ feedCuration: toggleFeedCuration.checked });
    });
  }

  if (toggleUnrestrictedSearch) {
    toggleUnrestrictedSearch.addEventListener('change', () => {
      const scope = preferences.filterScope || { homeFeed: true, subscriptions: false, search: false, sidebar: true };
      scope.search = !toggleUnrestrictedSearch.checked;
      save({ filterScope: scope });
    });
  }

  // Options Page button
  openOptionsBtn.addEventListener('click', () => {
    if (chrome.runtime.openOptionsPage) {
      chrome.runtime.openOptionsPage();
    } else {
      window.open(chrome.runtime.getURL('options/options.html'));
    }
  });

  function escapeHtml(str) {
    return (str || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  // Initialize
  initUI();
});
