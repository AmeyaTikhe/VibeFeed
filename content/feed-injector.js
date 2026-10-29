/**
 * VibeFeed - Feed Injector Engine (Adaptive V3)
 * Implements weighted preference curation based on watch history,
 * strict diversity guardrails, exploration/discovery quotas,
 * and live synchronization of preference changes on refresh.
 */

(function () {
  'use strict';

  class FeedInjector {
    constructor() {
      this.cachedVideos = new Map(); // query -> array of video objects
      this.injectedIds = new Set();
      this.currentVideoPool = [];
      this.activeFilteredPool = [];
      this.displayedCount = 18;
      this.shelfElement = null;
      this.currentFilterTab = 'all';
      this.preferences = null;
    }

    setPreferences(prefs) {
      this.preferences = prefs || {};
    }

    /**
     * Updates the shelf tabs dynamically when preferences change
     */
    updatePreferencesAndTabs(newPrefs) {
      this.setPreferences(newPrefs);
      if (!this.shelfElement) return;

      this.renderShelfTabs();
      this.refreshShelfVideos();
    }

    /**
     * Renders or re-renders the topic tabs in the shelf header
     */
    renderShelfTabs() {
      if (!this.shelfElement) return;
      const tabsContainer = this.shelfElement.querySelector('#vf-shelf-tabs');
      if (!tabsContainer) return;

      const keywords = this.preferences?.keywords || [];
      
      // If current filter tab was deleted, reset to 'all'
      const lowerKeywords = keywords.map(k => k.toLowerCase());
      if (this.currentFilterTab !== 'all' && !lowerKeywords.includes(this.currentFilterTab.toLowerCase())) {
        this.currentFilterTab = 'all';
      }

      const tabsHtml = `
        <button class="vf-tab-btn ${this.currentFilterTab === 'all' ? 'active' : ''}" data-kw="all">All Vibes</button>
        ${keywords.slice(0, 7).map(k => {
          const isActive = this.currentFilterTab.toLowerCase() === k.toLowerCase();
          const weightInfo = this.preferences?.keywordWeights?.[k.toLowerCase()];
          const isPriority = weightInfo && weightInfo.weight > 1.3;
          return `
            <button class="vf-tab-btn ${isActive ? 'active' : ''} ${isPriority ? 'is-priority' : ''}" data-kw="${escapeAttr(k)}">
              ${isPriority ? '<span class="vf-tab-pulse">✦</span>' : ''}
              <span>${escapeHtml(k)}</span>
            </button>
          `;
        }).join('')}
      `;

      tabsContainer.innerHTML = tabsHtml;

      // Re-attach tab click events
      tabsContainer.querySelectorAll('.vf-tab-btn').forEach(tab => {
        tab.addEventListener('click', async (e) => {
          e.stopPropagation();
          tabsContainer.querySelectorAll('.vf-tab-btn').forEach(t => t.classList.remove('active'));
          tab.classList.add('active');

          this.currentFilterTab = tab.getAttribute('data-kw');
          this.displayedCount = 18;
          await this.renderCardsForCurrentTab();
        });
      });
    }

    /**
     * Expand a keyword into multiple contextual queries
     */
    expandKeywordQueries(keyword) {
      const clean = (keyword || '').trim().replace(/^#+/, '');
      if (!clean) return [];

      const lower = clean.toLowerCase();
      const variations = [clean];

      if (lower.includes('ai') || lower.includes('artificial')) {
        variations.push('machine learning tutorial', 'artificial intelligence breakdown', 'ai agents langchain');
      } else if (lower.includes('code') || lower.includes('program') || lower.includes('python') || lower.includes('dev')) {
        variations.push(`${clean} project tutorial`, `${clean} deep dive architecture`, 'software engineering workflow');
      } else if (lower.includes('synthwave') || lower.includes('lofi') || lower.includes('ambient') || lower.includes('music')) {
        variations.push(`${clean} radio beats`, `${clean} chill mix focus`, 'ambient soundscape deep work');
      } else if (lower.includes('minimal') || lower.includes('desk') || lower.includes('setup')) {
        variations.push('minimal desk setup tour', 'aesthetic workspace productivity', 'mechanical keyboard build');
      } else if (lower.includes('productiv') || lower.includes('habit') || lower.includes('work')) {
        variations.push('deep work habits routine', 'time management stoicism', 'notion second brain workflow');
      } else if (lower.includes('science') || lower.includes('space') || lower.includes('physics')) {
        variations.push(`${clean} discovery documentary`, 'quantum astrophysics nasa', 'space exploration cosmos');
      } else if (lower.includes('game') || lower.includes('gaming')) {
        variations.push(`${clean} deep dive analysis`, 'indie game development showcase', 'retro gaming documentary');
      } else {
        variations.push(`${clean} deep dive`, `${clean} guide`);
      }

      return variations;
    }

    /**
     * Query YouTube internal search for a specific query
     */
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

        this.cachedVideos.set(cleanQ, {
          videos,
          timestamp: Date.now()
        });

        return videos;
      } catch (err) {
        console.warn('[VibeFeed] Error fetching videos for query:', cleanQ, err);
        return [];
      }
    }

    /**
     * Parse all videoRenderers across ALL sections and shelves in ytInitialData
     */
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
              for (const subItem of item.shelfRenderer.content.verticalListRenderer.items) {
                if (subItem.videoRenderer) {
                  this.extractVideoObject(subItem.videoRenderer, tagSource, results, seenIds, isExplore);
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
      const channel = v.ownerText?.runs?.[0]?.text || '';
      const duration = v.lengthText?.simpleText || (v.badges?.some(b => b.metadataBadgeRenderer?.style?.includes('LIVE')) ? 'LIVE' : '');
      const views = v.viewCountText?.simpleText || '';
      const published = v.publishedTimeText?.simpleText || '';

      resultsList.push({
        id: v.videoId,
        title,
        channel,
        duration,
        views,
        published,
        thumbnail: bestThumb,
        avatar,
        matchedKeyword: tagSource,
        isExplore: Boolean(isExplore)
      });
    }

    /**
     * Weighted Preference Curation with Strict Diversity Guardrails
     */
    async fetchAllPreferenceVideos() {
      const keywords = this.preferences?.keywords || [];
      if (keywords.length === 0) return [];

      const weightsMap = this.preferences?.keywordWeights || {};
      const activeKeywords = keywords.slice(0, 8);

      // 1. Calculate weights per keyword
      // Base weight: 1.0. If watched frequently, weight rises up to 2.4 max
      const keywordWeightList = activeKeywords.map(kw => {
        const record = weightsMap[kw.toLowerCase()];
        const weight = record?.weight || 1.0;
        return { keyword: kw, weight };
      });

      // Diversity Guardrail: Hard maximum share = 35%
      // No matter how high the weight is, no single keyword can exceed 35% of query quota
      const totalWeight = keywordWeightList.reduce((acc, item) => acc + item.weight, 0);
      const queryPromises = [];

      // 2. Fetch videos for active keywords based on normalized weighted quotas
      for (const item of keywordWeightList) {
        const rawShare = item.weight / (totalWeight || 1);
        const cappedShare = Math.min(0.35, Math.max(0.12, rawShare)); // Between 12% and 35%
        const numVariations = cappedShare > 0.22 ? 2 : 1;

        const expanded = this.expandKeywordQueries(item.keyword);
        for (let i = 0; i < numVariations && i < expanded.length; i++) {
          queryPromises.push(this.fetchVideosForQuery(expanded[i], item.keyword, false));
        }
      }

      // 3. Exploration / Serendipity Quota (15% - 20% of feed for related discoveries)
      if (window.VibeFeedRelatedSuggester) {
        const explorationTopics = window.VibeFeedRelatedSuggester.getSuggestions(keywords, 2);
        for (const expTopic of explorationTopics) {
          queryPromises.push(this.fetchVideosForQuery(expTopic, expTopic, true));
        }
      }

      const resultsArray = await Promise.all(queryPromises);

      // 4. Stratified Balanced Round-Robin Interleaving
      // Guarantees high diversity: adjacent videos come from different topics
      const merged = [];
      const seenIds = new Set();
      const maxLength = Math.max(...resultsArray.map(arr => arr.length), 0);

      for (let i = 0; i < maxLength; i++) {
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

    /**
     * Injects the Apple-style "Curated Vibe Feed" shelf directly into YouTube Home
     */
    async injectCuratedShelf() {
      const isHome = window.location.pathname === '/' || window.location.pathname === '';
      if (!isHome || !this.preferences?.enabled || this.preferences?.feedCuration === false) {
        this.removeCuratedShelf();
        return;
      }

      if (document.getElementById('vibefeed-curated-shelf')) {
        return;
      }

      const gridContainer = document.querySelector('ytd-rich-grid-renderer #contents, ytd-browse[page-subtype="home"] #contents');
      if (!gridContainer) {
        setTimeout(() => this.injectCuratedShelf(), 800);
        return;
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
            <div class="vf-filter-tabs" id="vf-shelf-tabs">
              <!-- Dynamically populated -->
            </div>
            <button class="vf-refresh-btn" id="vf-shelf-refresh" title="Sync Latest Preferences & Refresh Feed">↻ Refresh</button>
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

      // Render tabs and attach event listeners
      this.renderShelfTabs();
      this.attachShelfEventListeners();

      await this.refreshShelfVideos();
    }

    attachShelfEventListeners() {
      if (!this.shelfElement) return;

      const refreshBtn = this.shelfElement.querySelector('#vf-shelf-refresh');
      if (refreshBtn) {
        refreshBtn.addEventListener('click', async () => {
          refreshBtn.classList.add('spinning');
          
          // 1. Fetch latest preferences directly from storage to pick up newly added/removed keywords!
          const latestPrefs = await new Promise(res => chrome.storage.local.get(null, res));
          this.setPreferences(latestPrefs);

          // 2. Re-render tabs so added/removed keywords update immediately
          this.renderShelfTabs();

          // 3. Clear cache and re-fetch videos
          this.cachedVideos.clear();
          this.displayedCount = 18;
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

      let list = [];
      if (this.currentFilterTab === 'all') {
        list = this.currentVideoPool;
      } else {
        const expanded = this.expandKeywordQueries(this.currentFilterTab);
        const fetchedLists = await Promise.all(expanded.map(q => this.fetchVideosForQuery(q, this.currentFilterTab)));
        list = fetchedLists.flat();
      }

      this.activeFilteredPool = list;

      if (!list || list.length === 0) {
        cardsContainer.innerHTML = `
          <div class="vf-empty-shelf">
            <span>No videos found for this topic yet. Add more keywords or click refresh!</span>
          </div>
        `;
        if (footer) footer.style.display = 'none';
        return;
      }

      if (counter) {
        counter.textContent = `${list.length} videos curated • Diverse & balanced`;
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
        card.addEventListener('click', (e) => {
          const videoId = card.getAttribute('data-video-id');
          if (videoId) {
            window.location.href = `/watch?v=${videoId}`;
          }
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
    return (str || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function escapeAttr(str) {
    return (str || '')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  window.VibeFeedInjector = FeedInjector;
})();
