/**
 * VibeFeed - Feed Injector Engine
 * Actively fetches and injects preference-matching videos into the YouTube feed
 * so your feed is always populated with content matching your vibe.
 */

(function () {
  'use strict';

  class FeedInjector {
    constructor() {
      this.cachedVideos = new Map(); // keyword -> array of video objects
      this.injectedIds = new Set();
      this.isFetching = false;
      this.shelfElement = null;
      this.currentFilterTab = 'all';
      this.preferences = null;
      this.lastFetchTime = 0;
    }

    setPreferences(prefs) {
      this.preferences = prefs;
    }

    /**
     * Query YouTube internal search for a specific keyword/topic
     */
    async fetchVideosForKeyword(keyword) {
      const cleanKw = (keyword || '').trim();
      if (!cleanKw) return [];

      // Check in-memory cache first (cached for 15 minutes)
      const cached = this.cachedVideos.get(cleanKw);
      if (cached && (Date.now() - cached.timestamp < 15 * 60 * 1000)) {
        return cached.videos;
      }

      try {
        const query = cleanKw.startsWith('#') ? cleanKw.slice(1) : cleanKw;
        // Search query with video filter
        const url = `/results?search_query=${encodeURIComponent(query)}&sp=EgIQAQ%253D%253D`;
        
        const response = await fetch(url, {
          headers: {
            'X-YouTube-Client-Name': '1',
            'X-YouTube-Client-Version': '2.20240101.00.00'
          }
        });

        if (!response.ok) return [];

        const html = await response.text();
        const videos = this.parseVideosFromHtml(html, cleanKw);

        this.cachedVideos.set(cleanKw, {
          videos,
          timestamp: Date.now()
        });

        return videos;
      } catch (err) {
        console.warn('[VibeFeed] Error fetching videos for keyword:', cleanKw, err);
        return [];
      }
    }

    /**
     * Parse ytInitialData from YouTube search response HTML
     */
    parseVideosFromHtml(html, tagSource) {
      try {
        const match = html.match(/var ytInitialData = ({.*?});<\/script>/s) ||
                      html.match(/ytInitialData\s*=\s*({.+?});/);
        if (!match) return [];

        const data = JSON.parse(match[1]);
        const sections = data.contents?.twoColumnSearchResultsRenderer?.primaryContents?.sectionListRenderer?.contents || [];
        const items = sections[0]?.itemSectionRenderer?.contents || [];

        const results = [];
        for (const item of items) {
          const v = item.videoRenderer;
          if (!v || !v.videoId) continue;

          // Extract best thumbnail
          const thumbList = v.thumbnail?.thumbnails || [];
          const bestThumb = thumbList.length > 0 ? thumbList[thumbList.length - 1].url : `https://i.ytimg.com/vi/${v.videoId}/hqdefault.jpg`;

          // Extract channel avatar
          const avatar = v.channelThumbnailSupportedRenderers?.channelThumbnailWithLinkRenderer?.thumbnail?.thumbnails?.[0]?.url || '';

          // Extract metadata
          const title = v.title?.runs?.[0]?.text || '';
          const channel = v.ownerText?.runs?.[0]?.text || '';
          const duration = v.lengthText?.simpleText || (v.badges?.some(b => b.metadataBadgeRenderer?.style?.includes('LIVE')) ? 'LIVE' : '');
          const views = v.viewCountText?.simpleText || '';
          const published = v.publishedTimeText?.simpleText || '';

          results.push({
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

          if (results.length >= 10) break;
        }

        return results;
      } catch (err) {
        console.warn('[VibeFeed] Failed to parse YouTube search data:', err);
        return [];
      }
    }

    /**
     * Fetch videos across all active preference keywords
     */
    async fetchAllPreferenceVideos() {
      if (!this.preferences || !this.preferences.keywords || this.preferences.keywords.length === 0) {
        return [];
      }

      const keywords = this.preferences.keywords.slice(0, 6); // Fetch top 6 active keywords
      const promises = keywords.map(kw => this.fetchVideosForKeyword(kw));
      const resultsArray = await Promise.all(promises);

      // Merge and interleave results for rich diversity
      const merged = [];
      const maxLength = Math.max(...resultsArray.map(arr => arr.length), 0);

      for (let i = 0; i < maxLength; i++) {
        for (const arr of resultsArray) {
          if (arr[i] && !merged.some(m => m.id === arr[i].id)) {
            merged.push(arr[i]);
          }
        }
      }

      return merged;
    }

    /**
     * Injects the Apple-style "Curated Vibe Feed" shelf directly into YouTube Home
     */
    async injectCuratedShelf() {
      // Only inject on YouTube Home feed
      const isHome = window.location.pathname === '/' || window.location.pathname === '';
      if (!isHome || !this.preferences?.enabled) {
        this.removeCuratedShelf();
        return;
      }

      // Check if shelf already exists in DOM
      if (document.getElementById('vibefeed-curated-shelf')) {
        return;
      }

      // Find the YouTube rich grid container
      const gridContainer = document.querySelector('ytd-rich-grid-renderer #contents, ytd-browse[page-subtype="home"] #contents');
      if (!gridContainer) {
        setTimeout(() => this.injectCuratedShelf(), 800);
        return;
      }

      // Create placeholder shelf with Apple dark glass styling
      this.shelfElement = document.createElement('div');
      this.shelfElement.id = 'vibefeed-curated-shelf';
      this.shelfElement.innerHTML = `
        <div class="vf-shelf-header">
          <div class="vf-shelf-title-wrap">
            <div class="vf-shelf-icon">✦</div>
            <div>
              <div class="vf-shelf-title">Curated For Your Vibe</div>
              <div class="vf-shelf-sub">Active matching from your preference list</div>
            </div>
          </div>
          <div class="vf-shelf-actions">
            <div class="vf-filter-tabs" id="vf-shelf-tabs">
              <button class="vf-tab-btn active" data-kw="all">All Vibes</button>
              ${(this.preferences.keywords || []).slice(0, 5).map(k => `
                <button class="vf-tab-btn" data-kw="${escapeAttr(k)}">${escapeHtml(k)}</button>
              `).join('')}
            </div>
            <button class="vf-refresh-btn" id="vf-shelf-refresh" title="Refresh Vibe Recommendations">↻ Refresh</button>
          </div>
        </div>
        <div class="vf-shelf-grid" id="vf-shelf-cards">
          <div class="vf-loading-skeleton">Loading videos matching your vibe...</div>
        </div>
      `;

      // Insert at the very top of YouTube contents
      gridContainer.insertBefore(this.shelfElement, gridContainer.firstChild);

      // Attach refresh and tab click events
      this.attachShelfEventListeners();

      // Fetch and populate videos
      await this.refreshShelfVideos();
    }

    attachShelfEventListeners() {
      if (!this.shelfElement) return;

      const refreshBtn = this.shelfElement.querySelector('#vf-shelf-refresh');
      if (refreshBtn) {
        refreshBtn.addEventListener('click', async () => {
          refreshBtn.classList.add('spinning');
          this.cachedVideos.clear();
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
          await this.renderCardsForCurrentTab();
        });
      });
    }

    async refreshShelfVideos() {
      const cardsContainer = document.getElementById('vf-shelf-cards');
      if (!cardsContainer) return;

      cardsContainer.innerHTML = `
        <div class="vf-loading-skeleton">
          <span class="vf-pulse-sparkle">✦</span>
          <span>Curating high-vibe videos for you...</span>
        </div>
      `;

      const allVideos = await this.fetchAllPreferenceVideos();
      await this.renderCardsForCurrentTab(allVideos);
    }

    async renderCardsForCurrentTab(providedVideos) {
      const cardsContainer = document.getElementById('vf-shelf-cards');
      if (!cardsContainer) return;

      let list = [];
      if (this.currentFilterTab === 'all') {
        list = providedVideos || await this.fetchAllPreferenceVideos();
      } else {
        list = await this.fetchVideosForKeyword(this.currentFilterTab);
      }

      if (!list || list.length === 0) {
        cardsContainer.innerHTML = `
          <div class="vf-empty-shelf">
            <span>No videos found for this topic yet. Add more keywords or click refresh!</span>
          </div>
        `;
        return;
      }

      cardsContainer.innerHTML = list.slice(0, 8).map(v => this.buildCardHtml(v)).join('');
      this.attachVideoCardClicks(cardsContainer);
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
