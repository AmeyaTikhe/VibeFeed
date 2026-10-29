/**
 * VibeFeed - Feed Injector Engine (Adaptive V4)
 * - Multi-select keyword dropdown (replaces tabs)
 * - "All" option with prev-selection memory
 * - Auto-refreshes on any preference change
 * - Weighted diversity-guarded curated pool
 */

(function () {
  'use strict';

  class FeedInjector {
    constructor() {
      this.cachedVideos = new Map();
      this.injectedIds = new Set();
      this.currentVideoPool = [];
      this.activeFilteredPool = [];
      this.displayedCount = 18;
      this.shelfElement = null;
      this.preferences = null;

      // Dropdown state
      this.selectedKeywords = new Set(); // 'all' means every keyword is active
      this.isAllSelected = true;
      this.prevSelectedKeywords = new Set(); // memory for when "All" is deselected
      this.dropdownOpen = false;

      // Debounce for auto-refresh
      this._refreshDebounceTimer = null;
    }

    setPreferences(prefs) {
      this.preferences = prefs || {};

      // Sync selectedKeywords: remove any that were deleted from prefs
      const kwSet = new Set((this.preferences.keywords || []).map(k => k.toLowerCase()));
      for (const sel of this.selectedKeywords) {
        if (!kwSet.has(sel.toLowerCase())) this.selectedKeywords.delete(sel);
      }
      if (this.isAllSelected) {
        this.selectedKeywords = new Set(this.preferences.keywords || []);
      }
    }

    /**
     * Called by content.js whenever storage changes - auto-refreshes shelf
     */
    onPreferencesChanged(newPrefs) {
      const oldKeywords = JSON.stringify(this.preferences?.keywords || []);
      this.setPreferences(newPrefs);
      const newKeywords = JSON.stringify(newPrefs?.keywords || []);

      if (!this.shelfElement) return;

      // Rebuild dropdown options to reflect new keywords
      this.renderDropdown();

      // Debounced refresh so rapid adds don't trigger a flood of fetches
      if (this._refreshDebounceTimer) clearTimeout(this._refreshDebounceTimer);
      this._refreshDebounceTimer = setTimeout(async () => {
        // Invalidate cache only if keywords changed
        if (oldKeywords !== newKeywords) {
          this.cachedVideos.clear();
          this.displayedCount = 18;
        }
        await this.refreshShelfVideos();
      }, 600);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Dropdown rendering
    // ─────────────────────────────────────────────────────────────────────────

    renderDropdown() {
      if (!this.shelfElement) return;
      const wrapper = this.shelfElement.querySelector('#vf-dropdown-wrapper');
      if (!wrapper) return;

      const keywords = this.preferences?.keywords || [];

      // Determine label for button
      const label = this.isAllSelected
        ? 'All Vibes'
        : this.selectedKeywords.size === 0
          ? 'None selected'
          : this.selectedKeywords.size === 1
            ? [...this.selectedKeywords][0]
            : `${this.selectedKeywords.size} topics`;

      wrapper.innerHTML = `
        <button class="vf-dropdown-btn" id="vf-dropdown-trigger" title="Filter by topic">
          <span class="vf-dropdown-label">${escapeHtml(label)}</span>
          <span class="vf-dropdown-caret">${this.dropdownOpen ? '▲' : '▼'}</span>
        </button>
        ${this.dropdownOpen ? this.buildDropdownPanel(keywords) : ''}
      `;

      this.attachDropdownEvents(wrapper, keywords);
    }

    buildDropdownPanel(keywords) {
      const weightsMap = this.preferences?.keywordWeights || {};
      const allChecked = this.isAllSelected;

      const keywordItems = keywords.map(kw => {
        const isChecked = this.isAllSelected || this.selectedKeywords.has(kw);
        const weightInfo = weightsMap[kw.toLowerCase()];
        const isPriority = weightInfo && weightInfo.weight > 1.3;
        return `
          <label class="vf-dropdown-item ${isPriority ? 'is-priority' : ''}" title="${escapeAttr(kw)}">
            <input type="checkbox" class="vf-kw-checkbox" data-kw="${escapeAttr(kw)}"
              ${isChecked ? 'checked' : ''}>
            ${isPriority ? '<span class="vf-item-sparkle">✦</span>' : ''}
            <span class="vf-item-label">${escapeHtml(kw)}</span>
          </label>
        `;
      }).join('');

      return `
        <div class="vf-dropdown-panel" id="vf-dropdown-panel">
          <div class="vf-dropdown-panel-header">
            <span class="vf-dropdown-panel-title">Filter by Vibe</span>
            <button class="vf-dropdown-close-btn" id="vf-dropdown-close" title="Close">✕</button>
          </div>
          <label class="vf-dropdown-item vf-all-item">
            <input type="checkbox" id="vf-all-checkbox" ${allChecked ? 'checked' : ''}>
            <span class="vf-item-label vf-all-label">All Vibes</span>
          </label>
          <div class="vf-dropdown-divider"></div>
          <div class="vf-dropdown-items-scroll">
            ${keywordItems}
          </div>
        </div>
      `;
    }

    attachDropdownEvents(wrapper, keywords) {
      const trigger = wrapper.querySelector('#vf-dropdown-trigger');
      if (trigger) {
        trigger.addEventListener('click', (e) => {
          e.stopPropagation();
          this.dropdownOpen = !this.dropdownOpen;
          this.renderDropdown();
        });
      }

      const panel = wrapper.querySelector('#vf-dropdown-panel');
      if (!panel) return;

      // Prevent panel clicks closing it
      panel.addEventListener('click', e => e.stopPropagation());

      // ✕ Close button inside panel header
      const closeBtn = panel.querySelector('#vf-dropdown-close');
      if (closeBtn) {
        closeBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          this.dropdownOpen = false;
          this.renderDropdown();
        });
      }

      // "All Vibes" master checkbox
      const allCb = panel.querySelector('#vf-all-checkbox');
      if (allCb) {
        allCb.addEventListener('change', () => {
          if (allCb.checked) {
            // Remember what was selected before going to All
            this.prevSelectedKeywords = new Set(this.selectedKeywords);
            this.isAllSelected = true;
            this.selectedKeywords = new Set(keywords);
          } else {
            // Fall back to previously selected subset (or all if prev was empty)
            this.isAllSelected = false;
            this.selectedKeywords = this.prevSelectedKeywords.size > 0
              ? new Set(this.prevSelectedKeywords)
              : new Set(keywords); // can't leave nothing selected; revert to all
          }
          this.renderDropdown();
          this.triggerAutoRefresh();
        });
      }

      // Individual keyword checkboxes
      panel.querySelectorAll('.vf-kw-checkbox').forEach(cb => {
        cb.addEventListener('change', () => {
          const kw = cb.getAttribute('data-kw');
          if (cb.checked) {
            this.selectedKeywords.add(kw);
          } else {
            this.selectedKeywords.delete(kw);
          }
          // If all are manually checked, flip to All mode
          this.isAllSelected = (this.selectedKeywords.size === keywords.length);
          this.prevSelectedKeywords = new Set(this.selectedKeywords);
          this.renderDropdown();
          this.triggerAutoRefresh();
        });
      });
    }

    triggerAutoRefresh() {
      if (this._refreshDebounceTimer) clearTimeout(this._refreshDebounceTimer);
      this._refreshDebounceTimer = setTimeout(async () => {
        this.displayedCount = 18;
        await this.renderCardsForCurrentTab();
      }, 300);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Query Expansion
    // ─────────────────────────────────────────────────────────────────────────

    expandKeywordQueries(keyword) {
      const clean = (keyword || '').trim().replace(/^#+/, '');
      if (!clean) return [];

      const lower = clean.toLowerCase();
      const variations = [clean];

      if (lower.includes('ai') || lower.includes('artificial')) {
        variations.push('machine learning tutorial', 'ai agents langchain');
      } else if (lower.includes('code') || lower.includes('program') || lower.includes('python') || lower.includes('dev')) {
        variations.push(`${clean} project tutorial`, 'software engineering workflow');
      } else if (lower.includes('synthwave') || lower.includes('lofi') || lower.includes('ambient') || lower.includes('music')) {
        variations.push(`${clean} radio beats`, 'ambient soundscape deep work');
      } else if (lower.includes('minimal') || lower.includes('desk') || lower.includes('setup')) {
        variations.push('minimal desk setup tour', 'aesthetic workspace productivity');
      } else if (lower.includes('productiv') || lower.includes('habit') || lower.includes('work')) {
        variations.push('deep work habits routine', 'notion second brain workflow');
      } else if (lower.includes('science') || lower.includes('space') || lower.includes('physics')) {
        variations.push(`${clean} discovery documentary`, 'space exploration cosmos');
      } else if (lower.includes('game') || lower.includes('gaming')) {
        variations.push(`${clean} deep dive analysis`, 'indie game development showcase');
      } else {
        variations.push(`${clean} deep dive`, `${clean} guide`);
      }

      return variations;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Fetching
    // ─────────────────────────────────────────────────────────────────────────

    async fetchVideosForQuery(query, tagSource, isExplore = false) {
      const cleanQ = (query || '').trim();
      if (!cleanQ) return [];

      const cached = this.cachedVideos.get(cleanQ);
      if (cached && (Date.now() - cached.timestamp < 15 * 60 * 1000)) {
        return cached.videos;
      }

      try {
        const url = `/results?search_query=${encodeURIComponent(cleanQ)}`;
        const response = await fetch(url, {
          headers: {
            'X-YouTube-Client-Name': '1',
            'X-YouTube-Client-Version': '2.20240101.00.00'
          }
        });
        if (!response.ok) return [];

        const html = await response.text();
        const videos = this.parseVideosFromHtml(html, tagSource || cleanQ, isExplore);
        this.cachedVideos.set(cleanQ, { videos, timestamp: Date.now() });
        return videos;
      } catch (err) {
        console.warn('[VibeFeed] Error fetching videos for query:', cleanQ, err);
        return [];
      }
    }

    parseVideosFromHtml(html, tagSource, isExplore) {
      try {
        const match = html.match(/var ytInitialData = ({.*?});<\/script>/s) ||
                      html.match(/ytInitialData\s*=\s*({.+?});/);
        if (!match) return [];

        const data = JSON.parse(match[1]);
        const sections = data.contents?.twoColumnSearchResultsRenderer?.primaryContents?.sectionListRenderer?.contents || [];
        const results = [];
        const seenIds = new Set();

        for (const section of sections) {
          const items = section.itemSectionRenderer?.contents || [];
          for (const item of items) {
            if (item.videoRenderer) {
              this.extractVideoObject(item.videoRenderer, tagSource, results, seenIds, isExplore);
            }
            if (item.shelfRenderer?.content?.verticalListRenderer?.items) {
              for (const sub of item.shelfRenderer.content.verticalListRenderer.items) {
                if (sub.videoRenderer) {
                  this.extractVideoObject(sub.videoRenderer, tagSource, results, seenIds, isExplore);
                }
              }
            }
          }
        }
        return results;
      } catch (err) {
        console.warn('[VibeFeed] Failed to parse YouTube search data:', err);
        return [];
      }
    }

    extractVideoObject(v, tagSource, resultsList, seenIds, isExplore) {
      if (!v || !v.videoId || seenIds.has(v.videoId)) return;
      const title = v.title?.runs?.[0]?.text || '';
      if (!title) return;

      seenIds.add(v.videoId);
      const thumbList = v.thumbnail?.thumbnails || [];
      const bestThumb = thumbList.length > 0 ? thumbList[thumbList.length - 1].url : `https://i.ytimg.com/vi/${v.videoId}/hqdefault.jpg`;
      const avatar = v.channelThumbnailSupportedRenderers?.channelThumbnailWithLinkRenderer?.thumbnail?.thumbnails?.[0]?.url || '';

      resultsList.push({
        id: v.videoId,
        title,
        channel: v.ownerText?.runs?.[0]?.text || '',
        duration: v.lengthText?.simpleText || (v.badges?.some(b => b.metadataBadgeRenderer?.style?.includes('LIVE')) ? 'LIVE' : ''),
        views: v.viewCountText?.simpleText || '',
        published: v.publishedTimeText?.simpleText || '',
        thumbnail: bestThumb,
        avatar,
        matchedKeyword: tagSource,
        isExplore: Boolean(isExplore)
      });
    }

    async fetchAllPreferenceVideos() {
      // Use only the currently selected keywords for fetching
      const allKeywords = this.preferences?.keywords || [];
      const activeKeywords = this.isAllSelected
        ? allKeywords.slice(0, 8)
        : [...this.selectedKeywords].slice(0, 8);

      if (activeKeywords.length === 0) return [];

      const weightsMap = this.preferences?.keywordWeights || {};

      const keywordWeightList = activeKeywords.map(kw => ({
        keyword: kw,
        weight: weightsMap[kw.toLowerCase()]?.weight || 1.0
      }));

      const totalWeight = keywordWeightList.reduce((acc, i) => acc + i.weight, 0);
      const queryPromises = [];

      for (const item of keywordWeightList) {
        const rawShare = item.weight / (totalWeight || 1);
        const cappedShare = Math.min(0.35, Math.max(0.12, rawShare));
        const numVariations = cappedShare > 0.22 ? 2 : 1;
        const expanded = this.expandKeywordQueries(item.keyword);
        for (let i = 0; i < numVariations && i < expanded.length; i++) {
          queryPromises.push(this.fetchVideosForQuery(expanded[i], item.keyword, false));
        }
      }

      // Exploration / serendipity quota
      if (window.VibeFeedRelatedSuggester) {
        const expTopics = window.VibeFeedRelatedSuggester.getSuggestionsFallback(allKeywords, 2);
        for (const t of expTopics) {
          queryPromises.push(this.fetchVideosForQuery(t, t, true));
        }
      }

      const resultsArray = await Promise.all(queryPromises);
      const merged = [];
      const seenIds = new Set();
      const maxLen = Math.max(...resultsArray.map(a => a.length), 0);

      for (let i = 0; i < maxLen; i++) {
        for (const arr of resultsArray) {
          const v = arr[i];
          if (v && !seenIds.has(v.id)) {
            seenIds.add(v.id);
            merged.push(v);
          }
        }
      }

      return merged;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Shelf Injection
    // ─────────────────────────────────────────────────────────────────────────

    async injectCuratedShelf() {
      const isHome = window.location.pathname === '/' || window.location.pathname === '';
      if (!isHome || !this.preferences?.enabled || this.preferences?.feedCuration === false) {
        this.removeCuratedShelf();
        return;
      }

      if (document.getElementById('vibefeed-curated-shelf')) return;

      const gridContainer = document.querySelector('ytd-rich-grid-renderer #contents, ytd-browse[page-subtype="home"] #contents');
      if (!gridContainer) {
        setTimeout(() => this.injectCuratedShelf(), 800);
        return;
      }

      // Initialise selection to all
      if (this.selectedKeywords.size === 0) {
        this.isAllSelected = true;
        this.selectedKeywords = new Set(this.preferences.keywords || []);
      }

      this.shelfElement = document.createElement('div');
      this.shelfElement.id = 'vibefeed-curated-shelf';
      this.shelfElement.innerHTML = `
        <div class="vf-shelf-header">
          <div class="vf-shelf-title-wrap">
            <div class="vf-shelf-icon">✦</div>
            <div>
              <div class="vf-shelf-title">Curated For Your Vibe</div>
              <div class="vf-shelf-sub" id="vf-shelf-counter">Weighted by your watch habits • Diverse feed</div>
            </div>
          </div>
          <div class="vf-shelf-actions">
            <div class="vf-dropdown-wrapper" id="vf-dropdown-wrapper">
              <!-- Dropdown injected by renderDropdown() -->
            </div>
            <button class="vf-refresh-btn" id="vf-shelf-refresh" title="Refresh feed">↻ Refresh</button>
          </div>
        </div>
        <div class="vf-shelf-grid" id="vf-shelf-cards">
          <div class="vf-loading-skeleton">
            <span class="vf-pulse-sparkle">✦</span>
            <span>Curating rich feed of videos matching your preferences...</span>
          </div>
        </div>
        <div class="vf-shelf-footer" id="vf-shelf-footer" style="display: none;">
          <button class="vf-load-more-btn" id="vf-load-more">✦ Load More Curated Videos ↓</button>
        </div>
      `;

      gridContainer.insertBefore(this.shelfElement, gridContainer.firstChild);
      this.renderDropdown();
      this.attachShelfEventListeners();

      await this.refreshShelfVideos();

      // Close dropdown when clicking outside the wrapper
      document.addEventListener('click', (e) => {
        if (!this.dropdownOpen) return;
        const wrapper = this.shelfElement?.querySelector('#vf-dropdown-wrapper');
        if (wrapper && wrapper.contains(e.target)) return; // click inside — leave open
        this.dropdownOpen = false;
        this.renderDropdown();
      });
    }

    attachShelfEventListeners() {
      if (!this.shelfElement) return;

      const refreshBtn = this.shelfElement.querySelector('#vf-shelf-refresh');
      if (refreshBtn) {
        refreshBtn.addEventListener('click', async () => {
          refreshBtn.classList.add('spinning');
          const latestPrefs = await new Promise(res => chrome.storage.local.get(null, res));
          this.setPreferences(latestPrefs);
          this.cachedVideos.clear();
          this.displayedCount = 18;
          this.renderDropdown();
          await this.refreshShelfVideos();
          setTimeout(() => refreshBtn.classList.remove('spinning'), 600);
        });
      }

      const loadMoreBtn = this.shelfElement.querySelector('#vf-load-more');
      if (loadMoreBtn) {
        loadMoreBtn.addEventListener('click', () => {
          this.displayedCount += 12;
          this.renderCardsFromPool();
        });
      }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Card Rendering
    // ─────────────────────────────────────────────────────────────────────────

    async refreshShelfVideos() {
      const cardsContainer = document.getElementById('vf-shelf-cards');
      if (!cardsContainer) return;

      cardsContainer.innerHTML = `
        <div class="vf-loading-skeleton">
          <span class="vf-pulse-sparkle">✦</span>
          <span>Gathering videos for your vibe...</span>
        </div>
      `;

      this.currentVideoPool = await this.fetchAllPreferenceVideos();
      await this.renderCardsForCurrentTab();
    }

    async renderCardsForCurrentTab() {
      const cardsContainer = document.getElementById('vf-shelf-cards');
      const footer = document.getElementById('vf-shelf-footer');
      const counter = document.getElementById('vf-shelf-counter');
      if (!cardsContainer) return;

      // Filter pool to only selected keywords
      let list;
      if (this.isAllSelected || this.selectedKeywords.size === 0) {
        list = this.currentVideoPool;
      } else {
        const selLower = new Set([...this.selectedKeywords].map(k => k.toLowerCase()));
        list = this.currentVideoPool.filter(v =>
          selLower.has(v.matchedKeyword?.toLowerCase()) || v.isExplore
        );
        // If filtered list is too small, fetch fresh for selected keywords
        if (list.length < 6) {
          const fetchPromises = [];
          for (const kw of this.selectedKeywords) {
            const expanded = this.expandKeywordQueries(kw);
            fetchPromises.push(this.fetchVideosForQuery(expanded[0], kw, false));
          }
          const results = await Promise.all(fetchPromises);
          const seenIds = new Set(list.map(v => v.id));
          for (const arr of results) {
            for (const v of arr) {
              if (!seenIds.has(v.id)) {
                seenIds.add(v.id);
                list.push(v);
              }
            }
          }
        }
      }

      this.activeFilteredPool = list;

      if (!list || list.length === 0) {
        cardsContainer.innerHTML = `<div class="vf-empty-shelf"><span>No videos found for selected topics. Try different keywords or click Refresh!</span></div>`;
        if (footer) footer.style.display = 'none';
        return;
      }

      if (counter) {
        const selLabel = this.isAllSelected ? 'all vibes' : `${this.selectedKeywords.size} selected`;
        counter.textContent = `${list.length} videos curated • ${selLabel} • diverse`;
      }

      this.renderCardsFromPool();
    }

    renderCardsFromPool() {
      const cardsContainer = document.getElementById('vf-shelf-cards');
      const footer = document.getElementById('vf-shelf-footer');
      if (!cardsContainer) return;

      const list = this.activeFilteredPool || this.currentVideoPool || [];
      const visible = list.slice(0, this.displayedCount);

      cardsContainer.innerHTML = visible.map(v => this.buildCardHtml(v)).join('');
      this.attachVideoCardClicks(cardsContainer);

      if (footer) {
        footer.style.display = list.length > this.displayedCount ? 'flex' : 'none';
      }
    }

    buildCardHtml(video) {
      this.injectedIds.add(video.id);
      const isExplore = video.isExplore;
      const tagText = isExplore ? `✦ Explore: ${video.matchedKeyword}` : `✦ ${video.matchedKeyword}`;
      const tagClass = isExplore ? 'vf-vibe-tag is-explore' : 'vf-vibe-tag';

      return `
        <div class="vf-video-card" data-video-id="${escapeAttr(video.id)}">
          <div class="vf-thumb-wrapper">
            <img class="vf-thumbnail" src="${escapeAttr(video.thumbnail)}" alt="${escapeAttr(video.title)}" loading="lazy">
            ${video.duration ? `<span class="vf-duration-badge">${escapeHtml(video.duration)}</span>` : ''}
            <div class="${tagClass}">${escapeHtml(tagText)}</div>
          </div>
          <div class="vf-card-details">
            ${video.avatar ? `<img class="vf-channel-avatar" src="${escapeAttr(video.avatar)}" alt="" loading="lazy">` : ''}
            <div class="vf-meta-text">
              <a href="/watch?v=${escapeAttr(video.id)}" class="vf-card-title" title="${escapeAttr(video.title)}">
                ${escapeHtml(video.title)}
              </a>
              <div class="vf-channel-name">${escapeHtml(video.channel)}</div>
              <div class="vf-video-stats">
                ${video.views ? `<span>${escapeHtml(video.views)}</span>` : ''}
                ${video.published ? `<span>• ${escapeHtml(video.published)}</span>` : ''}
              </div>
            </div>
          </div>
        </div>
      `;
    }

    attachVideoCardClicks(container) {
      container.querySelectorAll('.vf-video-card').forEach(card => {
        card.addEventListener('click', () => {
          const videoId = card.getAttribute('data-video-id');
          if (videoId) window.location.href = `/watch?v=${videoId}`;
        });
      });
    }

    removeCuratedShelf() {
      const existing = document.getElementById('vibefeed-curated-shelf');
      if (existing) existing.remove();
      this.shelfElement = null;
    }
  }

  function escapeHtml(str) {
    return (str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  function escapeAttr(str) {
    return (str || '').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  window.VibeFeedInjector = FeedInjector;
})();
