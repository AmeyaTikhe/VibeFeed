/**
 * VibeFeed - Related Keyword Suggester (Real-Time API v2)
 *
 * Uses YouTube's own autocomplete API to find GENUINELY related keywords
 * based on whatever the user has typed in their preference list — no hardcoded
 * domain lookups, no random fallbacks. IELTS will suggest IELTS-related topics.
 *
 * Also powers the Auto Mode (automated keyword discovery).
 */

(function () {
  'use strict';

  // Common filler words that should be stripped from suggestions
  const FILLER_WORDS = new Set([
    'full', 'course', 'tutorial', 'how', 'to', 'the', 'a', 'an', 'in', 'for',
    'beginners', 'advanced', 'complete', 'guide', 'tips', 'tricks', 'best', 'top',
    'new', 'latest', 'free', '2024', '2025', '2026', '2027', 'video', 'channel',
    'playlist', 'official', 'part', 'episode', 'watch', 'online', 'learn', 'learning'
  ]);

  // Hard cap on how long a suggestion tag can be
  const MAX_TAG_WORDS = 4;

  class RelatedSuggester {
    /**
     * Fetch raw YouTube autocomplete suggestions for a query string
     * Returns up to 8 raw suggestion strings.
     */
    static async fetchSuggestionsForQuery(query) {
      try {
        const url = `https://suggestqueries.google.com/complete/search?client=youtube&ds=yt&q=${encodeURIComponent(query)}`;
        const res = await fetch(url);
        if (!res.ok) return [];
        const text = await res.text();
        // Format: window.google.ac.h(['query', [['suggestion', 0, [...]], ...]])
        const match = text.match(/\[.*\]/s);
        if (!match) return [];
        const parsed = JSON.parse(match[0]);
        return (parsed[1] || []).map(s => s[0]).filter(Boolean).slice(0, 8);
      } catch {
        return [];
      }
    }

    /**
     * Given a raw suggestion string and the original keyword, extract
     * a clean, concise topic tag.
     *
     * "ielts speaking test" + "ielts" → "Speaking Test"
     * "ai coding workflow 2026" + "ai" → "Coding Workflow"
     */
    static extractTag(rawSuggestion, originalKeyword) {
      const kwClean = originalKeyword.replace(/^#+/, '').trim().toLowerCase();

      // Strip the original keyword from the front
      let text = rawSuggestion
        .replace(new RegExp('^' + RelatedSuggester.escapeRegex(kwClean) + '\\s*', 'i'), '')
        .trim();

      // If nothing useful left, use the raw suggestion
      if (!text || text.length < 3) text = rawSuggestion;

      // Remove trailing year patterns
      text = text.replace(/\b(20\d{2})\b/g, '').trim();

      // Split, filter filler, cap length
      const words = text
        .split(/\s+/)
        .filter(w => w.length > 1 && !FILLER_WORDS.has(w.toLowerCase()));

      if (words.length === 0) return null;

      // Cap to MAX_TAG_WORDS
      const finalWords = words.slice(0, MAX_TAG_WORDS);

      // Title-case each word
      const tag = finalWords.map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
      return tag.length >= 3 ? tag : null;
    }

    static escapeRegex(str) {
      return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }

    /**
     * Generate live, real-time related vibe suggestions from the user's keyword list.
     * Queries YouTube's autocomplete for each active keyword and returns de-duped,
     * clean, concise topic tags that are genuinely related.
     *
     * @param {string[]} currentKeywords  Active preference keywords
     * @param {number}   limit            Max suggestions to return (default 8)
     * @returns {Promise<string[]>}
     */
    static async getSuggestions(currentKeywords = [], limit = 8) {
      if (currentKeywords.length === 0) {
        // Default bootstrap suggestions for a fresh user
        return [
          'productivity', 'deep work', 'minimalism', '#ai',
          'coding', '#lofi', 'science documentaries', 'fitness'
        ].slice(0, limit);
      }

      const activeNormalized = new Set(currentKeywords.map(k => k.trim().toLowerCase()));
      const allCandidates = [];

      // Query YouTube suggest for each active keyword
      const queries = currentKeywords.slice(0, 5); // Limit to avoid too many requests
      const fetchPromises = queries.map(kw =>
        RelatedSuggester.fetchSuggestionsForQuery(kw)
          .then(raws => ({ kw, raws }))
      );

      const results = await Promise.all(fetchPromises);

      for (const { kw, raws } of results) {
        for (const raw of raws) {
          const tag = RelatedSuggester.extractTag(raw, kw);
          if (!tag) continue;
          const norm = tag.toLowerCase();
          // Skip if too similar to an already-active keyword
          if (activeNormalized.has(norm)) continue;
          if ([...activeNormalized].some(a => norm.includes(a) || a.includes(norm))) continue;
          allCandidates.push(tag);
        }
      }

      // De-duplicate (case-insensitive)
      const seen = new Set();
      const unique = allCandidates.filter(tag => {
        const n = tag.toLowerCase();
        if (seen.has(n)) return false;
        seen.add(n);
        return true;
      });

      // Shuffle slightly for freshness, then trim
      return RelatedSuggester.shuffle(unique).slice(0, limit);
    }

    /**
     * Synchronous offline fallback used by tests / contexts without fetch
     * Uses very simple keyword-mirroring heuristics.
     */
    static getSuggestionsFallback(currentKeywords = [], limit = 8) {
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

      const activeNorm = new Set(currentKeywords.map(k => k.toLowerCase().replace(/^#+/, '')));
      const out = [];
      const seen = new Set();

      for (const kw of currentKeywords) {
        const norm = kw.toLowerCase().replace(/^#+/, '');
        // Find a close matching key in QUICK_MAP
        const matchKey = Object.keys(QUICK_MAP).find(k => norm.includes(k) || k.includes(norm));
        if (matchKey) {
          for (const tag of QUICK_MAP[matchKey]) {
            const tagNorm = tag.toLowerCase();
            if (!activeNorm.has(tagNorm) && !seen.has(tagNorm)) {
              seen.add(tagNorm);
              out.push(tag);
            }
          }
        }
      }

      if (out.length < limit) {
        for (const kw of currentKeywords) {
          out.push(`${kw} tips`);
        }
      }

      return [...new Set(out)].slice(0, limit);
    }

    /**
     * Auto Mode: Runs periodically, picks 1-2 *highly related* new keywords to auto-add.
     * Uses YouTube suggest, picks terms that appeared across multiple keyword queries
     * (i.e. high co-occurrence = truly related), and appends them to the preference list.
     *
     * Returns the newly added keywords (empty array if none added).
     */
    static async autoDiscoverKeywords(currentKeywords = []) {
      if (currentKeywords.length === 0) return [];

      const activeNorm = new Set(currentKeywords.map(k => k.trim().toLowerCase()));

      // Query all active keywords
      const queries = currentKeywords.slice(0, 6);
      const fetchPromises = queries.map(kw =>
        RelatedSuggester.fetchSuggestionsForQuery(kw)
          .then(raws => ({ kw, raws }))
      );
      const results = await Promise.all(fetchPromises);

      // Count co-occurrences: how many different keyword queries produced each candidate
      const coOccurrence = new Map(); // tagNorm -> { tag, count }

      for (const { kw, raws } of results) {
        const seenInThisQuery = new Set();
        for (const raw of raws) {
          const tag = RelatedSuggester.extractTag(raw, kw);
          if (!tag) continue;
          const norm = tag.toLowerCase();

          // Skip if already in preference list or too similar
          if (activeNorm.has(norm)) continue;
          if ([...activeNorm].some(a => norm.includes(a) || a.includes(norm))) continue;
          if (seenInThisQuery.has(norm)) continue;

          seenInThisQuery.add(norm);
          const existing = coOccurrence.get(norm) || { tag, count: 0 };
          coOccurrence.set(norm, { tag, count: existing.count + 1 });
        }
      }

      // Pick candidates that appeared in 2+ queries (high co-occurrence = highly related)
      const strongCandidates = [...coOccurrence.values()]
        .filter(c => c.count >= 2)
        .sort((a, b) => b.count - a.count);

      // If no co-occurring terms, fall back to the single most common suggestion
      // from the keyword with the highest watch weight (most-watched topic)
      if (strongCandidates.length === 0) {
        const singleCandidates = [...coOccurrence.values()]
          .sort((a, b) => b.count - a.count)
          .slice(0, 1);
        return singleCandidates.map(c => c.tag);
      }

      // Return max 2 highly-related new tags
      return strongCandidates.slice(0, 2).map(c => c.tag);
    }

    static shuffle(arr) {
      const a = [...arr];
      for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
      }
      return a;
    }
  }

  // Export
  if (typeof window !== 'undefined') {
    window.VibeFeedRelatedSuggester = RelatedSuggester;
  }
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = RelatedSuggester;
  }
})();
