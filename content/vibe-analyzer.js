/**
 * VibeFeed - Vibe Analyzer
 * Extracts video metadata, hashtags, keyphrases, and thematic "vibes"
 * to suggest curated interests as the user watches YouTube videos.
 */

(function () {
  'use strict';

  // Comprehensive stop words list for video titles & descriptions
  const STOP_WORDS = new Set([
    'a', 'about', 'above', 'after', 'again', 'against', 'all', 'am', 'an', 'and', 'any', 'are', 'aren\'t', 'as', 'at',
    'be', 'because', 'been', 'before', 'being', 'below', 'between', 'both', 'but', 'by', 'can', 'can\'t', 'cannot',
    'could', 'couldn\'t', 'did', 'didn\'t', 'do', 'does', 'doesn\'t', 'doing', 'don\'t', 'down', 'during', 'each',
    'few', 'for', 'from', 'further', 'had', 'hadn\'t', 'has', 'hasn\'t', 'have', 'haven\'t', 'having', 'he', 'he\'d',
    'he\'ll', 'he\'s', 'her', 'here', 'here\'s', 'hers', 'herself', 'him', 'himself', 'his', 'how', 'how\'s', 'i',
    'i\'d', 'i\'ll', 'i\'m', 'i\'ve', 'if', 'in', 'into', 'is', 'isn\'t', 'it', 'it\'s', 'its', 'itself', 'let\'s',
    'me', 'more', 'most', 'mustn\'t', 'my', 'myself', 'no', 'nor', 'not', 'of', 'off', 'on', 'once', 'only', 'or',
    'other', 'ought', 'our', 'ours', 'ourselves', 'out', 'over', 'own', 'same', 'shan\'t', 'she', 'she\'d', 'she\'ll',
    'she\'s', 'should', 'shouldn\'t', 'so', 'some', 'such', 'than', 'that', 'that\'s', 'the', 'their', 'theirs',
    'them', 'themselves', 'then', 'there', 'there\'s', 'these', 'they', 'they\'d', 'they\'ll', 'they\'re', 'they\'ve',
    'this', 'those', 'through', 'to', 'too', 'under', 'until', 'up', 'very', 'was', 'wasn\'t', 'we', 'we\'d', 'we\'ll',
    'we\'re', 'we\'ve', 'were', 'weren\'t', 'what', 'what\'s', 'when', 'when\'s', 'where', 'where\'s', 'which', 'while',
    'who', 'who\'s', 'whom', 'why', 'why\'s', 'with', 'won\'t', 'would', 'wouldn\'t', 'you', 'you\'d', 'you\'ll',
    'you\'re', 'you\'ve', 'your', 'yours', 'yourself', 'yourselves',
    // Video-specific noise words
    'video', 'official', 'full', 'episode', 'ep', 'part', 'review', 'tutorial', 'guide', 'best', 'top',
    'new', 'update', 'latest', 'first', 'first look', 'hands on', 'vs', 'versus', 'live', 'stream',
    'reaction', 'reacts', 'unboxing', 'explained', 'explaining', 'breakdown', 'day in the life', 'vlog',
    'must watch', 'honest', 'every', 'everything', 'know', 'thing', 'things', 'years', 'year', '2024',
    '2025', '2026', '2027', 'shorts', 'short', 'reel', 'clips', 'clip', 'hd', '4k', '1080p'
  ]);

  // Curated Domain / Vibe Archetypes
  const VIBE_CATEGORIES = [
    {
      label: 'AI & Intelligence',
      tag: '#ai',
      triggers: ['ai', 'artificial intelligence', 'machine learning', 'deep learning', 'gpt', 'llm', 'claude', 'neural', 'gemini', 'openai', 'agent', 'langchain']
    },
    {
      label: 'Coding & Dev',
      tag: '#coding',
      triggers: ['python', 'javascript', 'typescript', 'rust', 'react', 'code', 'programming', 'software engineer', 'developer', 'github', 'backend', 'frontend', 'docker', 'kubernetes', 'linux', 'c++']
    },
    {
      label: 'Ambient & Lo-Fi',
      tag: '#lofi',
      triggers: ['lofi', 'ambient', 'synthwave', 'chill', 'beats', 'study music', 'focus music', 'relaxing', 'cyberpunk music', 'soundscape', 'drone', 'jazz hop']
    },
    {
      label: 'Design & Aesthetics',
      tag: '#design',
      triggers: ['ui/ux', 'minimalism', 'industrial design', 'interior design', 'typography', 'architecture', 'blender', '3d art', 'figma', 'cinematography', 'aesthetic']
    },
    {
      label: 'Productivity & Focus',
      tag: '#productivity',
      triggers: ['productivity', 'habits', 'deep work', 'notion', 'routine', 'focus', 'time management', 'desk setup', 'workspace', 'stoicism', 'workflow']
    },
    {
      label: 'Science & Cosmos',
      tag: '#science',
      triggers: ['physics', 'quantum', 'space', 'astronomy', 'nasa', 'spacex', 'biology', 'neuroscience', 'mathematics', 'documentary', 'universe', 'black hole']
    },
    {
      label: 'Gaming & Interactive',
      tag: '#gaming',
      triggers: ['gameplay', 'walkthrough', 'speedrun', 'rpg', 'nintendo', 'playstation', 'steam deck', 'cyberpunk 2077', 'indie game', 'elden ring', 'game dev', 'esports']
    },
    {
      label: 'Finance & Markets',
      tag: '#finance',
      triggers: ['investing', 'stocks', 'etf', 'crypto', 'bitcoin', 'passive income', 'real estate', 'personal finance', 'macroeconomics', 'startup', 'venture capital']
    },
    {
      label: 'Hardware & Gear',
      tag: '#tech',
      triggers: ['apple', 'macbook', 'iphone', 'ipad', 'nvidia', 'gpu', 'mechanical keyboard', 'audio gear', 'headphones', 'camera', 'oled', 'smart home']
    },
    {
      label: 'Health & Movement',
      tag: '#fitness',
      triggers: ['workout', 'calisthenics', 'longevity', 'nutrition', 'running', 'gym', 'mobility', 'biohacking', 'sleep optimization']
    }
  ];

  function escapeRegex(str) {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  class VibeAnalyzer {
    /**
     * Extracts current YouTube video metadata from the DOM
     */
    static getVideoMetadata() {
      const url = new URL(window.location.href);
      const videoId = url.searchParams.get('v');
      if (!videoId) return null;

      // Extract Title
      const titleElem = document.querySelector('h1.ytd-watch-metadata yt-formatted-string, h1.title yt-formatted-string, ytd-watch-metadata #title h1');
      const videoTitle = titleElem ? titleElem.textContent.trim() : document.title.replace(' - YouTube', '').trim();

      // Extract Channel
      const channelElem = document.querySelector('ytd-watch-metadata #owner #channel-name yt-formatted-string, #owner #channel-name a, ytd-channel-name yt-formatted-string');
      const channelName = channelElem ? channelElem.textContent.trim() : '';

      // Extract Description snippet
      const descElem = document.querySelector('ytd-watch-metadata #description-inline-expander, #description yt-formatted-string, #description-text');
      const description = descElem ? descElem.textContent.trim().slice(0, 1000) : '';

      // Extract on-page hashtag links: e.g. a[href*="/hashtag/"]
      const hashtagElems = Array.from(document.querySelectorAll('a[href*="/hashtag/"]'));
      const explicitHashtags = hashtagElems
        .map(el => el.textContent.trim().toLowerCase())
        .filter(t => t.startsWith('#') && t.length > 2);

      // Extract meta tags if available
      const metaKeywordsElem = document.querySelector('meta[name="keywords"]');
      const metaKeywords = metaKeywordsElem ? metaKeywordsElem.getAttribute('content') : '';

      return {
        videoId,
        videoTitle,
        channelName,
        description,
        explicitHashtags: Array.from(new Set(explicitHashtags)),
        metaKeywords
      };
    }

    /**
     * Cleans titles and tokenizes text
     */
    static cleanText(text) {
      if (!text) return '';
      return text
        .replace(/\[.*?\]|\(.*?\)/g, ' ') // Remove bracketed content like [4K], (Official)
        .replace(/[\u{1F600}-\u{1F6FF}|[\u{2600}-\u{26FF}]/gu, '') // Remove emojis
        .replace(/[|•–—:!?,/\\#@$%^&*~_+=]/g, ' ') // Replace punctuation with space
        .replace(/\s+/g, ' ')
        .trim();
    }

    /**
     * Extract significant keyphrases and individual words
     */
    static extractPhrases(title, description = '') {
      const cleaned = VibeAnalyzer.cleanText(title);
      const words = cleaned
        .split(' ')
        .map(w => w.trim().toLowerCase())
        .filter(w => w.length > 1);

      const phrases = [];
      const significantWords = [];

      // Extract 2-word n-grams (meaningful bigrams)
      for (let i = 0; i < words.length - 1; i++) {
        const w1 = words[i];
        const w2 = words[i + 1];

        if (!STOP_WORDS.has(w1) && !STOP_WORDS.has(w2) && w1.length > 2 && w2.length > 2) {
          // Capitalize for sleek Apple pill look
          const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
          phrases.push(`${cap(w1)} ${cap(w2)}`);
        }
      }

      // Significant single words
      for (const w of words) {
        if (!STOP_WORDS.has(w) && w.length > 3 && !/^\d+$/.test(w)) {
          significantWords.push(w.charAt(0).toUpperCase() + w.slice(1));
        }
      }

      return { phrases, significantWords };
    }

    /**
     * Matches text against curated Vibe categories
     */
    static matchVibeCategories(fullText) {
      const lower = fullText.toLowerCase();
      const matched = [];

      for (const cat of VIBE_CATEGORIES) {
        let score = 0;
        for (const trigger of cat.triggers) {
          // Safe word boundary regex with escaped regex characters
          const escaped = escapeRegex(trigger);
          const regex = new RegExp(`(^|\\W)${escaped}(\\W|$)`, 'i');
          if (regex.test(lower)) {
            score++;
          }
        }
        if (score > 0) {
          matched.push({ category: cat.label, tag: cat.tag, score });
        }
      }

      // Sort by score descending
      return matched.sort((a, b) => b.score - a.score);
    }

    /**
     * Synthesizes 4-8 curated, distinct vibe tags for the current video
     */
    static analyze(meta) {
      if (!meta || !meta.videoTitle) return [];

      const fullContext = `${meta.videoTitle} ${meta.channelName} ${meta.description} ${meta.metaKeywords}`;
      const { phrases, significantWords } = VibeAnalyzer.extractPhrases(meta.videoTitle, meta.description);
      const categoryMatches = VibeAnalyzer.matchVibeCategories(fullContext);

      const suggestions = [];
      const seen = new Set();

      function add(tag, type = 'keyword') {
        const cleanTag = tag.trim();
        const norm = cleanTag.toLowerCase();
        if (!norm || seen.has(norm) || norm.length < 2) return;
        seen.add(norm);
        suggestions.push({
          text: cleanTag,
          type
        });
      }

      // 1. Explicit hashtags found on the video (highest fidelity)
      for (const ht of meta.explicitHashtags) {
        add(ht, 'hashtag');
        if (suggestions.length >= 3) break;
      }

      // 2. High scoring Vibe Categories (e.g. AI & Intelligence, Coding & Dev)
      for (const cm of categoryMatches) {
        add(cm.tag, 'hashtag');
        add(cm.category, 'category');
        if (suggestions.length >= 5) break;
      }

      // 3. Multi-word keyphrases (e.g. "Ambient Lo-Fi", "Mechanical Keyboard")
      for (const phrase of phrases) {
        add(phrase, 'phrase');
        if (suggestions.length >= 7) break;
      }

      // 4. Standout single keywords from the title
      for (const word of significantWords) {
        add(word, 'keyword');
        if (suggestions.length >= 8) break;
      }

      // 5. Channel Name if informative
      if (meta.channelName && !meta.channelName.toLowerCase().includes('youtube')) {
        add(meta.channelName, 'channel');
      }

      return suggestions.slice(0, 8);
    }
  }

  // Expose globally to extension content context
  window.VibeFeedAnalyzer = VibeAnalyzer;
})();
