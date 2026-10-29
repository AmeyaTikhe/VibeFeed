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
      statusText.textContent = 'Active Filter';
      statusText.classList.remove('disabled');
      footerStats.textContent = 'Filtering active';
    } else {
      statusText.textContent = 'Paused';
      statusText.classList.add('disabled');
      footerStats.textContent = 'Filtering paused';
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

  /**
   * Render Suggested Related Keywords
   * Routes through service worker (which can reach suggestqueries.google.com),
   * because the popup page CSP blocks direct cross-origin fetches.
   */
  async function renderRelatedSuggestions(showLoading = true) {
    if (!relatedSuggestionsList) return;

    if (showLoading) {
      relatedSuggestionsList.innerHTML = `<span class="suggestions-loading">✦ Fetching related vibes...</span>`;
    }

    const keywords = preferences.keywords || [];

    // Ask service worker to proxy the autocomplete fetch
    let suggestions = await new Promise((resolve) => {
      chrome.runtime.sendMessage(
        { action: 'FETCH_SUGGESTIONS', keywords, limit: 8 },
        (resp) => {
          if (chrome.runtime.lastError || !resp?.success || !resp.suggestions?.length) {
            // Fallback: mirror keywords with simple suffix hints
            resolve(getFallbackSuggestions(keywords));
          } else {
            resolve(resp.suggestions);
          }
        }
      );
    });

    // Last-resort guard
    if (!suggestions || suggestions.length === 0) {
      suggestions = getFallbackSuggestions(keywords);
    }

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

  /**
   * Offline fallback: generate reasonable suggestions by appending sub-topic suffixes
   */
  function getFallbackSuggestions(keywords) {
    if (!keywords || keywords.length === 0) return [];
    const QUICK_MAP = {
      ielts: ['IELTS Speaking', 'IELTS Writing', 'IELTS Listening', 'IELTS Reading Tips', 'English Proficiency'],
      toefl: ['TOEFL Speaking', 'TOEFL Writing', 'Academic English'],
      coding: ['System Design', 'Clean Code', 'Open Source', 'DevOps'],
      python: ['Data Structures', 'FastAPI', 'Django Framework', 'NumPy'],
      ai: ['LangChain', 'Prompt Engineering', 'AI Agents', 'Vector Databases'],
      synthwave: ['Retrowave Mix', 'Dark Ambient', 'Outrun Music'],
      lofi: ['Study Beats', 'Jazz Hop', 'Focus Instrumentals'],
      minimalism: ['Desk Setup', 'Digital Declutter', 'Simple Living'],
      productivity: ['Deep Work', 'Time Blocking', 'Second Brain', 'Notion Setup'],
      fitness: ['Calisthenics', 'Mobility Routine', 'Zone 2 Cardio'],
    };
    const activeNorm = new Set(keywords.map(k => k.toLowerCase().replace(/^#+/, '')));
    const out = [];
    const seen = new Set();
    for (const kw of keywords) {
      const norm = kw.toLowerCase().replace(/^#+/, '');
      const matchKey = Object.keys(QUICK_MAP).find(k => norm.includes(k) || k.includes(norm));
      if (matchKey) {
        for (const tag of QUICK_MAP[matchKey]) {
          const tn = tag.toLowerCase();
          if (!activeNorm.has(tn) && !seen.has(tn)) { seen.add(tn); out.push(tag); }
        }
      } else {
        // Generic suffix hints
        for (const suffix of [' explained', ' tutorial', ' deep dive']) {
          const tag = kw.replace(/^#+/, '') + suffix;
          const tn = tag.toLowerCase();
          if (!activeNorm.has(tn) && !seen.has(tn)) { seen.add(tn); out.push(tag); }
        }
      }
    }
    return out.slice(0, 8);
  }

  // ============================================================
  // Auto Mode
  // ============================================================

  function updateAutoModeUI(isActive) {
    if (!autoModeBody) return;
    autoModeBody.style.display = isActive ? 'block' : 'none';
    renderAutoModeLog();
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
    const existingNorm = new Set(kws.map(k => k.toLowerCase()));

    for (const tag of newTags) {
      if (!existingNorm.has(tag.toLowerCase())) {
        addKeyword(tag);
        existingNorm.add(tag.toLowerCase());
        added.push(tag);
      }
    }

    // Record to auto mode log
    if (added.length > 0) {
      const log = Array.isArray(preferences.autoModeLog) ? preferences.autoModeLog : [];
      const newEntries = added.map(tag => ({
        tag,
        source: kws[0] || 'your vibes',
        timestamp: Date.now()
      }));
      const updatedLog = [...newEntries, ...log].slice(0, 20);
      save({ autoModeLog: updatedLog, autoModeLastRun: Date.now() });
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

  function addKeyword(rawText) {
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
      renderRelatedSuggestions();
      updateFooterStats();
      renderVibeRadar(); // Refresh radar added states
    }

    keywordInput.value = '';
    keywordInput.focus();
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
  addKeywordBtn.addEventListener('click', () => addKeyword(keywordInput.value));
  keywordInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      addKeyword(keywordInput.value);
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

  // Auto Mode Toggle
  if (toggleAutoMode) {
    toggleAutoMode.addEventListener('change', () => {
      const isOn = toggleAutoMode.checked;
      save({ autoMode: isOn });
      updateAutoModeUI(isOn);
      if (isOn) runAutoDiscovery(false);
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
