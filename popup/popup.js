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

  const toggleHideShorts = document.getElementById('toggle-hide-shorts');
  const toggleMatchChannel = document.getElementById('toggle-match-channel');
  const toggleWatchHud = document.getElementById('toggle-watch-hud');
  const toggleFeedCuration = document.getElementById('toggle-feed-curation');
  const toggleUnrestrictedSearch = document.getElementById('toggle-unrestricted-search');

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

    // Render Lists
    renderKeywordsList();
    renderRelatedSuggestions();
    renderNegativeChips();
    renderVibeRadar();
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
      const chip = document.createElement('div');
      chip.className = `preference-chip ${isHashtag ? 'is-hashtag' : ''}`;
      chip.innerHTML = `
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
   * Render Suggested Related Keywords below the preference list
   */
  function renderRelatedSuggestions() {
    if (!relatedSuggestionsList || !window.VibeFeedRelatedSuggester) return;
    relatedSuggestionsList.innerHTML = '';

    const suggestions = window.VibeFeedRelatedSuggester.getSuggestions(preferences.keywords || [], 8);

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
        setTimeout(() => {
          renderRelatedSuggestions();
        }, 400);
      });

      relatedSuggestionsList.appendChild(chip);
    });
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
