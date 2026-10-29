/**
 * VibeFeed - YouTube Content Script
 * Manages DOM observation, feed filtering, and on-watch vibe suggestion HUD.
 */

(function () {
  'use strict';

  let filterEngine = null;
  let feedInjector = null;
  let observer = null;
  let currentVideoId = null;
  let lastAnalyzedVideoId = null;
  let isThrottled = false;
  let preferences = null;

  // Initialize Filter & Feed Engines
  filterEngine = new window.VibeFeedFilterEngine();
  feedInjector = new window.VibeFeedInjector();

  // Load preferences from local storage
  async function initPreferences() {
    return new Promise((resolve) => {
      chrome.storage.local.get(null, (data) => {
        preferences = data || {};
        filterEngine.setPreferences(preferences);
        feedInjector.setPreferences(preferences);
        resolve(preferences);
      });
    });
  }

  // React to preference updates from popup or options page
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local') {
      for (const [key, change] of Object.entries(changes)) {
        preferences[key] = change.newValue;
      }
      filterEngine.setPreferences(preferences);
      feedInjector.setPreferences(preferences);
      
      // Re-filter or reset
      if (preferences.enabled === false) {
        filterEngine.resetAllCards();
        feedInjector.removeCuratedShelf();
      } else {
        processAllCards();
        if (window.location.pathname === '/' || window.location.pathname === '') {
          feedInjector.injectCuratedShelf();
        }
      }
      updateFloatingFeedPill();
    }
  });

  /**
   * Scan and filter all video cards in the DOM
   */
  function processAllCards() {
    if (!preferences || !preferences.enabled) {
      if (preferences && !preferences.enabled) {
        filterEngine.resetAllCards();
      }
      return;
    }

    const cardSelectors = [
      'ytd-rich-item-renderer',
      'ytd-video-renderer',
      'ytd-compact-video-renderer',
      'ytd-grid-video-renderer',
      'ytd-rich-section-renderer',
      'ytd-reel-shelf-renderer'
    ];

    const cards = document.querySelectorAll(cardSelectors.join(', '));
    let filteredCount = 0;

    for (let i = 0; i < cards.length; i++) {
      const card = cards[i];
      const isFiltered = filterEngine.filterCard(card);
      if (isFiltered) filteredCount++;
    }

    // Report filtered count to background for toolbar badge
    chrome.runtime.sendMessage({
      action: 'UPDATE_BADGE',
      count: filteredCount
    }).catch(() => {});

    updateFloatingFeedPill(filteredCount);
  }

  /**
   * RequestAnimationFrame throttle for MutationObserver
   */
  function scheduleFilterPass() {
    if (isThrottled) return;
    isThrottled = true;

    requestAnimationFrame(() => {
      processAllCards();
      isThrottled = false;
    });
  }

  /**
   * Set up DOM mutation observer for YouTube infinite scroll
   */
  function setupObserver() {
    if (observer) observer.disconnect();

    const targetNode = document.querySelector('ytd-app') || document.body;
    if (!targetNode) {
      setTimeout(setupObserver, 500);
      return;
    }

    observer = new MutationObserver((mutations) => {
      let shouldProcess = false;
      for (let i = 0; i < mutations.length; i++) {
        const addedNodes = mutations[i].addedNodes;
        if (addedNodes && addedNodes.length > 0) {
          shouldProcess = true;
          break;
        }
      }
      if (shouldProcess) {
        scheduleFilterPass();
      }
    });

    observer.observe(targetNode, {
      childList: true,
      subtree: true
    });
  }

  /**
   * Detect YouTube route / video ID
   */
  function checkNavigation() {
    const url = new URL(window.location.href);
    const isWatchPage = url.pathname === '/watch' && url.searchParams.get('v');
    const isHomePage = url.pathname === '/' || url.pathname === '';

    if (isWatchPage) {
      currentVideoId = url.searchParams.get('v');
      removeFloatingFeedPill();
      feedInjector.removeCuratedShelf();
      handleWatchPage(currentVideoId);
    } else {
      currentVideoId = null;
      removeWatchHud();
      if (isHomePage) {
        feedInjector.injectCuratedShelf();
      } else {
        feedInjector.removeCuratedShelf();
      }
      updateFloatingFeedPill();
      scheduleFilterPass();
    }
  }

  /**
   * Extract vibes and render floating suggestion HUD on video watch pages
   */
  function handleWatchPage(videoId) {
    if (!preferences.autoSuggestOnWatch) return;
    if (videoId === lastAnalyzedVideoId) return;

    // Give YouTube DOM 1.5 seconds to populate video metadata
    setTimeout(() => {
      const meta = window.VibeFeedAnalyzer.getVideoMetadata();
      if (!meta || !meta.videoTitle) {
        // Retry once if title is not ready yet
        setTimeout(() => handleWatchPage(videoId), 1500);
        return;
      }

      lastAnalyzedVideoId = videoId;
      const vibes = window.VibeFeedAnalyzer.analyze(meta);

      if (vibes && vibes.length > 0) {
        // Record vibe in recent watch history
        chrome.runtime.sendMessage({
          action: 'RECORD_VIBE',
          vibe: {
            videoId,
            videoTitle: meta.videoTitle,
            channelName: meta.channelName,
            vibes: vibes.map(v => v.text),
            timestamp: Date.now()
          }
        }).catch(() => {});

        renderWatchHud(meta, vibes);
      }
    }, 1500);
  }

  /**
   * Render Apple Dark Mode Floating HUD for Vibe suggestions
   */
  function renderWatchHud(meta, vibes) {
    removeWatchHud();

    const activeKeywords = new Set((preferences.keywords || []).map(k => k.toLowerCase()));

    const hud = document.createElement('div');
    hud.id = 'vibefeed-watch-hud';

    // Generate chips HTML
    const chipsHtml = vibes.map(v => {
      const isAlreadyAdded = activeKeywords.has(v.text.toLowerCase());
      const chipClass = `vibefeed-chip ${v.type === 'hashtag' ? 'vibefeed-chip-hashtag' : ''} ${isAlreadyAdded ? 'vibefeed-chip-added' : ''}`;
      return `
        <button class="${chipClass}" data-vibe="${escapeHtml(v.text)}">
          <span class="vibefeed-chip-plus">${isAlreadyAdded ? '✓' : '+'}</span>
          <span>${escapeHtml(v.text)}</span>
        </button>
      `;
    }).join('');

    hud.innerHTML = `
      <div class="vibefeed-hud-header">
        <div class="vibefeed-hud-title-wrap">
          <div class="vibefeed-hud-icon">✦</div>
          <span class="vibefeed-hud-title">Vibe Detected</span>
        </div>
        <div class="vibefeed-hud-controls">
          <button class="vibefeed-hud-btn" id="vibefeed-btn-min" title="Minimize">−</button>
          <button class="vibefeed-hud-btn" id="vibefeed-btn-close" title="Dismiss">✕</button>
        </div>
      </div>
      <div class="vibefeed-hud-body">
        <div class="vibefeed-hud-subtitle">Add interests from this video to curate your feed:</div>
        <div class="vibefeed-chips-container">
          ${chipsHtml}
        </div>
      </div>
      <div class="vibefeed-hud-footer">
        <span class="vibefeed-hud-status">${vibes.length} vibes found</span>
        <button class="vibefeed-add-all-btn" id="vibefeed-add-all">+ Add All</button>
      </div>
    `;

    document.body.appendChild(hud);

    // Attach Chip Click Listeners
    const chipBtns = hud.querySelectorAll('.vibefeed-chip:not(.vibefeed-chip-added)');
    chipBtns.forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const tag = btn.getAttribute('data-vibe');
        addKeywordToPreferences(tag);
        btn.classList.add('vibefeed-chip-added');
        btn.querySelector('.vibefeed-chip-plus').textContent = '✓';
      });
    });

    // Add All button listener
    const addAllBtn = hud.querySelector('#vibefeed-add-all');
    if (addAllBtn) {
      addAllBtn.addEventListener('click', () => {
        const unaddedChips = hud.querySelectorAll('.vibefeed-chip:not(.vibefeed-chip-added)');
        unaddedChips.forEach(btn => {
          const tag = btn.getAttribute('data-vibe');
          addKeywordToPreferences(tag);
          btn.classList.add('vibefeed-chip-added');
          btn.querySelector('.vibefeed-chip-plus').textContent = '✓';
        });
        addAllBtn.textContent = '✓ Added All';
        addAllBtn.style.background = '#30D158';
      });
    }

    // Minimize toggle
    const minBtn = hud.querySelector('#vibefeed-btn-min');
    if (minBtn) {
      minBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        hud.classList.toggle('vibefeed-minimized');
        minBtn.textContent = hud.classList.contains('vibefeed-minimized') ? '+' : '−';
      });
    }

    // Dismiss button
    const closeBtn = hud.querySelector('#vibefeed-btn-close');
    if (closeBtn) {
      closeBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        removeWatchHud();
      });
    }
  }

  function removeWatchHud() {
    const existing = document.getElementById('vibefeed-watch-hud');
    if (existing) existing.remove();
  }

  /**
   * Add a keyword to persistent storage
   */
  function addKeywordToPreferences(newKeyword) {
    if (!newKeyword) return;
    chrome.runtime.sendMessage({
      action: 'ADD_KEYWORD',
      keyword: newKeyword
    }, (res) => {
      if (res && res.keywords) {
        preferences.keywords = res.keywords;
        filterEngine.setPreferences(preferences);
      }
    });
  }

  /**
   * Floating Feed Pill on YouTube Home Page
   */
  function updateFloatingFeedPill(count) {
    if (!preferences || !preferences.showFloatingBadge || currentVideoId) {
      removeFloatingFeedPill();
      return;
    }

    let pill = document.getElementById('vibefeed-feed-pill');
    if (!pill) {
      pill = document.createElement('div');
      pill.id = 'vibefeed-feed-pill';
      pill.title = 'Click to open VibeFeed preferences';
      pill.innerHTML = `
        <span class="vibefeed-pill-dot ${preferences.enabled ? '' : 'disabled'}"></span>
        <span class="vibefeed-pill-text">VibeFeed</span>
        <span class="vibefeed-pill-count">${count || 0}</span>
      `;
      pill.addEventListener('click', () => {
        // Send message to open options or toggle
        if (chrome.runtime.openOptionsPage) {
          chrome.runtime.openOptionsPage();
        }
      });
      document.body.appendChild(pill);
    } else {
      const dot = pill.querySelector('.vibefeed-pill-dot');
      const countElem = pill.querySelector('.vibefeed-pill-count');
      if (dot) {
        if (preferences.enabled) dot.classList.remove('disabled');
        else dot.classList.add('disabled');
      }
      if (countElem && count !== undefined) {
        countElem.textContent = count;
      }
    }
  }

  function removeFloatingFeedPill() {
    const pill = document.getElementById('vibefeed-feed-pill');
    if (pill) pill.remove();
  }

  function escapeHtml(str) {
    return (str || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  // YouTube SPA Navigation Hooks
  window.addEventListener('yt-navigate-finish', checkNavigation);
  window.addEventListener('yt-page-data-updated', checkNavigation);
  window.addEventListener('popstate', checkNavigation);

  // Initialize on script injection
  (async function start() {
    await initPreferences();
    setupObserver();
    checkNavigation();
    processAllCards();
  })();
})();
