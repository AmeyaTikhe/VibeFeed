/**
 * VibeFeed - Filter Engine
 * Core matching logic and DOM manipulation for filtering YouTube feeds.
 */

(function () {
  'use strict';

  function escapeRegex(str) {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  class FilterEngine {
    constructor() {
      this.preferences = {
        enabled: true,
        filterMode: 'whitelist', // 'whitelist' | 'blacklist'
        visualStyle: 'hide',     // 'hide' | 'blur'
        keywords: [],
        negativeKeywords: [],
        matchTarget: {
          title: true,
          channel: true,
          hashtags: true,
          description: true
        },
        filterScope: {
          homeFeed: true,
          subscriptions: false, // Don't block subscriptions
          search: false,        // Don't block explicit search results
          sidebar: true         // Filter sidebar recommendations
        },
        hideShorts: false
      };

      this.sessionFilteredCount = 0;
      this.filteredElements = new WeakSet();
    }

    setPreferences(prefs) {
      this.preferences = { ...this.preferences, ...prefs };
    }

    /**
     * Extracts readable text attributes from a YouTube card element
     */
    extractCardData(card) {
      if (!card) return null;

      // Extract title
      const titleElem = card.querySelector('#video-title, #video-title-link, yt-formatted-string#video-title, span#video-title, h3');
      const title = titleElem ? (titleElem.textContent || titleElem.getAttribute('title') || '').trim() : '';

      // Extract channel name
      const channelElem = card.querySelector('ytd-channel-name, #channel-name, #text.ytd-channel-name, #byline');
      const channel = channelElem ? channelElem.textContent.trim() : '';

      // Extract metadata snippet / badges
      const metaElem = card.querySelector('#metadata-line, #description-text, #channel-info');
      const metaSnippet = metaElem ? metaElem.textContent.trim() : '';

      // Detect if card is a YouTube Short
      const isShort = card.matches('ytd-reel-item-renderer, ytd-rich-section-renderer, [is-short]') ||
                      Boolean(card.querySelector('a[href*="/shorts/"]'));

      return {
        title,
        channel,
        metaSnippet,
        isShort
      };
    }

    /**
     * Checks if target text matches a given keyword
     * Handles exact hashtags (#word), multi-word phrases, and single words.
     */
    matchesKeyword(text, keyword) {
      if (!text || !keyword) return false;
      const cleanText = text.toLowerCase();
      const cleanKw = keyword.trim().toLowerCase();

      if (!cleanKw) return false;

      // If keyword is a hashtag (e.g. #ai)
      if (cleanKw.startsWith('#')) {
        const tagWord = cleanKw.slice(1);
        // Look for literal hashtag or word boundary
        if (cleanText.includes(cleanKw)) return true;
        const tagRegex = new RegExp(`(^|\\W)${escapeRegex(tagWord)}(\\W|$)`, 'i');
        return tagRegex.test(cleanText);
      }

      // If multi-word phrase or single keyword: check substring with word boundary flexibility
      if (cleanKw.includes(' ')) {
        return cleanText.includes(cleanKw);
      } else {
        const wordRegex = new RegExp(`(^|\\W)${escapeRegex(cleanKw)}(\\W|$)`, 'i');
        return wordRegex.test(cleanText) || cleanText.includes(cleanKw);
      }
    }

    /**
     * Determines whether a card should be ALLOWED or FILTERED
     */
    shouldShowCard(cardData, cardElement) {
      // If extension is toggled OFF: always show
      if (!this.preferences.enabled) return true;

      const path = window.location.pathname;
      const scope = this.preferences.filterScope || { homeFeed: true, subscriptions: false, search: false, sidebar: true };

      // 1. Never filter explicit search results unless user opted-in
      if (path === '/results' && !scope.search) {
        return true;
      }

      // 2. Never filter subscription feed unless user opted-in
      if (path.startsWith('/feed/subscriptions') && !scope.subscriptions) {
        return true;
      }

      // 3. Never filter channel page videos (e.g. /@username/videos)
      if (path.startsWith('/@') || path.startsWith('/c/') || path.startsWith('/channel/')) {
        return true;
      }

      // 4. On Watch page: NEVER touch the primary player or video details
      if (path === '/watch') {
        const isSidebar = cardElement && (cardElement.matches('ytd-compact-video-renderer') || cardElement.closest('#related'));
        if (!isSidebar) {
          return true; // Not a sidebar recommendation (e.g. main video or playlist header)
        }
        if (!scope.sidebar) {
          return true; // Sidebar filtering disabled
        }
      }

      // If hideShorts is ON and card is a Short: filter it
      if (this.preferences.hideShorts && cardData.isShort) {
        return false;
      }

      const { title, channel, metaSnippet } = cardData;
      const targets = [];
      if (this.preferences.matchTarget.title && title) targets.push(title);
      if (this.preferences.matchTarget.channel && channel) targets.push(channel);
      if (this.preferences.matchTarget.description && metaSnippet) targets.push(metaSnippet);

      const combinedText = targets.join(' ');
      if (!combinedText) return true; // Don't filter empty placeholder skeletons

      // 1. Check Negative Keywords / Blacklist first
      const negativeList = this.preferences.negativeKeywords || [];
      for (const neg of negativeList) {
        if (this.matchesKeyword(combinedText, neg)) {
          return false; // Instant block
        }
      }

      // 2. Main Filtering Evaluation
      const keywords = (this.preferences.keywords || []).filter(k => k && k.trim().length > 0);

      // If in whitelist mode, but user has zero keywords configured yet:
      // Don't hide their entire feed; allow feed until they add keywords
      if (this.preferences.filterMode === 'whitelist') {
        if (keywords.length === 0) {
          return true;
        }

        // Must match AT LEAST ONE keyword in whitelist
        const matchesAny = keywords.some(kw => this.matchesKeyword(combinedText, kw));
        return matchesAny;
      }

      // In blacklist mode: hide if matches any keyword
      if (this.preferences.filterMode === 'blacklist') {
        const matchesAny = keywords.some(kw => this.matchesKeyword(combinedText, kw));
        return !matchesAny;
      }

      return true;
    }

    /**
     * Filters an individual card DOM node
     */
    filterCard(card) {
      if (!card || !card.nodeType) return false;

      // Check if this is a Shorts shelf container
      if (card.matches('ytd-rich-section-renderer, ytd-reel-shelf-renderer')) {
        if (this.preferences.enabled && this.preferences.hideShorts) {
          card.style.display = 'none';
          card.setAttribute('data-vibefeed-state', 'hidden');
          return true;
        } else {
          card.style.display = '';
          card.removeAttribute('data-vibefeed-state');
          return false;
        }
      }

      const cardData = this.extractCardData(card);
      if (!cardData || (!cardData.title && !cardData.isShort)) {
        return false; // Still loading
      }

      const allow = this.shouldShowCard(cardData, card);

      if (allow) {
        // Show video card cleanly
        this.unfilterCard(card);
        card.setAttribute('data-vibefeed-state', 'allowed');
        return false;
      } else {
        // Apply filter styling
        this.applyFilterStyle(card);
        card.setAttribute('data-vibefeed-state', 'filtered');

        if (!this.filteredElements.has(card)) {
          this.filteredElements.add(card);
          this.sessionFilteredCount++;
        }
        return true;
      }
    }

    applyFilterStyle(card) {
      if (this.preferences.visualStyle === 'blur') {
        // Apple Frosted Glass Blur Mode
        card.style.display = '';
        card.classList.add('vibefeed-frosted-card');

        // Ensure badge overlay exists
        if (!card.querySelector('.vibefeed-frosted-badge')) {
          const badge = document.createElement('div');
          badge.className = 'vibefeed-frosted-badge';
          badge.innerHTML = `
            <div class="vibefeed-badge-pill">
              <span class="vibefeed-sparkle">✦</span>
              <span>Filtered by VibeFeed</span>
            </div>
          `;
          card.appendChild(badge);
        }
      } else {
        // Strict Hide Mode (default Apple clean)
        card.style.display = 'none';
        card.classList.remove('vibefeed-frosted-card');
        const badge = card.querySelector('.vibefeed-frosted-badge');
        if (badge) badge.remove();
      }
    }

    unfilterCard(card) {
      card.style.display = '';
      card.classList.remove('vibefeed-frosted-card');
      const badge = card.querySelector('.vibefeed-frosted-badge');
      if (badge) badge.remove();
    }

    /**
     * Resets all cards back to visible state
     */
    resetAllCards() {
      const cards = document.querySelectorAll('[data-vibefeed-state]');
      cards.forEach(card => this.unfilterCard(card));
      this.filteredElements = new WeakSet();
      this.sessionFilteredCount = 0;
    }
  }

  window.VibeFeedFilterEngine = FilterEngine;
})();
