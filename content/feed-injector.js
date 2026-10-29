/**
 * VibeFeed - Feed Injector Engine (Enhanced V2)
 * Actively fetches and injects large batches of preference-matching videos
 * directly into the YouTube home feed with query expansion and pagination.
 */

(function () {
  'use strict';

  class FeedInjector {
    constructor() {
      this.cachedVideos = new Map(); // query -> array of video objects
      this.injectedIds = new Set();
      this.currentVideoPool = [];
      this.displayedCount = 18; // Generous default: show 18-24 videos
      this.shelfElement = null;
      this.currentFilterTab = 'all';
      this.preferences = null;
      this.isLoadingMore = false;
    }

    setPreferences(prefs) {
      this.preferences = prefs;
    }

    /**
     * Expand a keyword into multiple high-signal query variations
     */
    expandKeywordQueries(keyword) {
      const clean = (keyword || '').trim().replace(/^#+/, '');
      if (!clean) return [];

      const lower = clean.toLowerCase();
      const variations = [clean];

      // Smart semantic query expansion
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
    async fetchVideosForQuery(query, originalTag) {
      const cleanQ = (query || '').trim();
      if (!cleanQ) return [];

      // Check cache (cached for 15 minutes)
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
        const videos = this.parseVideosFromHtml(html, originalTag || cleanQ);

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
    parseVideosFromHtml(html, tagSource) {
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
            // Direct videoRenderer
            if (item.videoRenderer) {
              this.extractVideoObject(item.videoRenderer, tagSource, results, seenIds);
            }
            // ShelfRenderer contents (e.g. "Latest from...", "People also watched")
            if (item.shelfRenderer?.content?.verticalListRenderer?.items) {
              for (const subItem of item.shelfRenderer.content.verticalListRenderer.items) {
                if (subItem.videoRenderer) {
                  this.extractVideoObject(subItem.videoRenderer, tagSource, results, seenIds);
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

    extractVideoObject(v, tagSource, resultsList, seenIds) {
      if (!v || !v.videoId || seenIds.has(v.videoId)) return;

      const title = v.title?.runs?.[0]?.text || '';
      if (!title) return;

      seenIds.add(v.videoId);

      // Best thumbnail
      const thumbList = v.thumbnail?.thumbnails || [];
      const bestThumb = thumbList.length > 0 ? thumbList[thumbList.length - 1].url : `https://i.ytimg.com/vi/${v.videoId}/hqdefault.jpg`;

      // Avatar
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
        matchedKeyword: tagSource
      });
    }

    /**
     * Fetch a large, diverse pool of preference-matching videos
     */
    async fetchAllPreferenceVideos() {
      if (!this.preferences || !this.preferences.keywords || this.preferences.keywords.length === 0) {
        return [];
      }

      const activeKeywords = this.preferences.keywords.slice(0, 8);
      const queryPromises = [];

      for (const kw of activeKeywords) {
        const expanded = this.expandKeywordQueries(kw);
        // Take top 2 query variations per keyword
        for (const q of expanded.slice(0, 2)) {
          queryPromises.push(this.fetchVideosForQuery(q, kw));
        }
      }

      const resultsArray = await Promise.all(queryPromises);

      // Interleave results so topics are well distributed
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
              <div class="vf-shelf-sub" id="vf-shelf-counter">Actively matching your preferences</div>
            </div>
          </div>
          <div class="vf-shelf-actions">
            <div class="vf-filter-tabs" id="vf-shelf-tabs">
              <button class="vf-tab-btn active" data-kw="all">All Vibes</button>
              ${(this.preferences.keywords || []).slice(0, 6).map(k => `
                <button class="vf-tab-btn" data-kw="${escapeAttr(k)}">${escapeHtml(k)}</button>
              `).join('')}
            </div>
            <button class="vf-refresh-btn" id="vf-shelf-refresh" title="Refresh Vibe Recommendations">↻ Refresh</button>
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

      this.attachShelfEventListeners();
      await this.refreshShelfVideos();
    }

    attachShelfEventListeners() {
      if (!this.shelfElement) return;

      const refreshBtn = this.shelfElement.querySelector('#vf-shelf-refresh');
      if (refreshBtn) {
        refreshBtn.addEventListener('click', async () => {
          refreshBtn.classList.add('spinning');
          this.cachedVideos.clear();
          this.displayedCount = 18;
          await this.refreshShelfVideos();
          setTimeout(() => refreshBtn.classList.remove('spinning'), 600);
        });
      }

      const tabs = this.shelfElement.querySelectorAll('.vf-tab-btn');
      tabs.forEach(tab => {
        tab.addEventListener('click', async (e) => {
          e.stopPropagation();
          tabs.forEach(t => t.classList.remove('active'));
          tab.classList.add('active');

          const kw = tab.getAttribute('data-kw');
          this.currentFilterTab = kw;
          this.displayedCount = 18;
          await this.renderCardsForCurrentTab();
        });
      });

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
        counter.textContent = `${list.length} videos matching your vibe`;
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

      // Show/hide Load More button
      if (footer) {
        footer.style.display = list.length > this.displayedCount ? 'flex' : 'none';
      }
    }

    buildCardHtml(video) {
      this.injectedIds.add(video.id);
      return `
        <div class="vf-video-card" data-video-id="${escapeAttr(video.id)}">
          <div class="vf-thumb-wrapper">
            <img class="vf-thumbnail" src="${escapeAttr(video.thumbnail)}" alt="${escapeAttr(video.title)}" loading="lazy">
            ${video.duration ? `<span class="vf-duration-badge">${escapeHtml(video.duration)}</span>` : ''}
            <div class="vf-vibe-tag">✦ ${escapeHtml(video.matchedKeyword)}</div>
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
