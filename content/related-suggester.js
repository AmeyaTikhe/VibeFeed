/**
 * VibeFeed - Related Keyword Suggester Engine
 * Intelligently suggests related keywords, topics, and hashtags based on
 * the user's active preference list.
 */

(function () {
  'use strict';

  const TOPIC_GRAPH = {
    ai: {
      tags: ['#ai', '#machinelearning', 'Deep Learning', 'Python AI', 'Autonomous Agents', 'Neural Networks', 'LangChain', 'OpenAI', 'Computer Vision', 'LLM Development', 'Generative AI', 'Robotics'],
      triggers: ['ai', 'artificial intelligence', 'machine learning', 'deep learning', 'gpt', 'llm', 'neural', 'openai', 'agent', 'langchain']
    },
    coding: {
      tags: ['#coding', '#python', 'Rust Programming', 'System Architecture', 'Web Development', 'Clean Code', 'TypeScript', 'DevOps & Linux', 'Data Structures', 'Open Source', 'Software Engineering', 'Backend APIs'],
      triggers: ['coding', 'code', 'programming', 'developer', 'software', 'python', 'javascript', 'typescript', 'rust', 'linux', 'github', 'dev']
    },
    minimalism: {
      tags: ['Minimal Desk Setup', 'Mechanical Keyboards', 'EDC Gear', 'Aesthetic Workspace', 'Digital Minimalism', 'Productive Habits', 'Ergonomics', 'Clean Aesthetic', 'Smart Home Setup', 'Studio Tour'],
      triggers: ['minimalism', 'minimalist', 'desk setup', 'workspace', 'setup', 'keyboard', 'edc', 'aesthetic']
    },
    productivity: {
      tags: ['#productivity', 'Deep Work', 'Habit Building', 'Time Blocking', 'Notion Workflow', 'Stoicism', 'Second Brain', 'Dopamine Detox', 'Morning Routine', 'Peak Performance', 'Focus Flow'],
      triggers: ['productivity', 'habits', 'deep work', 'notion', 'routine', 'focus', 'time management', 'stoicism', 'workflow', 'study']
    },
    lofi: {
      tags: ['#lofi', '#ambientmusic', 'Chillhop Beats', 'Retrowave', 'Focus Music', 'Cyberpunk Ambience', 'Coffee Shop Lofi', 'Dark Ambient', 'Study Beats', 'Downtempo', 'Synthwave Radio'],
      triggers: ['lofi', 'ambient', 'synthwave', 'chill', 'beats', 'music', 'study music', 'focus music', 'relaxing', 'instrumental', 'soundscape']
    },
    gaming: {
      tags: ['Indie Game Dev', 'Retro Gaming', 'Speedrunning', 'Unreal Engine 5', 'Pixel Art', 'Game Design Analysis', 'RPG Deep Dives', 'Cyberpunk 2077', 'Nintendo Modding', 'Steam Deck'],
      triggers: ['gaming', 'game', 'gameplay', 'walkthrough', 'speedrun', 'rpg', 'nintendo', 'playstation', 'steam', 'indie game']
    },
    science: {
      tags: ['#science', 'Astrophysics', 'Quantum Mechanics', 'NASA Discoveries', 'Cosmology', 'SpaceX Updates', 'Theoretical Physics', 'Brain & Neuroscience', 'Biology & Evolution', 'Documentaries'],
      triggers: ['science', 'physics', 'quantum', 'space', 'astronomy', 'nasa', 'spacex', 'biology', 'neuroscience', 'universe', 'documentary']
    },
    fitness: {
      tags: ['#fitness', 'Calisthenics', 'Mobility Routine', 'Strength Training', 'Clean Nutrition', 'Biohacking', 'Sleep Optimization', 'Longevity Protocol', 'Zone 2 Cardio', 'Gym Workouts'],
      triggers: ['fitness', 'workout', 'calisthenics', 'gym', 'health', 'longevity', 'nutrition', 'running', 'mobility', 'biohacking']
    },
    finance: {
      tags: ['#finance', 'Index Funds', 'Macro Economics', 'Personal Finance', 'Real Estate Investing', 'Dividend Growth', 'Crypto Tech', 'Venture Capital', 'Startup Building', 'Passive Income'],
      triggers: ['finance', 'investing', 'stocks', 'etf', 'crypto', 'bitcoin', 'real estate', 'economy', 'startup', 'money']
    },
    design: {
      tags: ['#design', 'UI/UX Design', '3D Blender', 'Typography', 'Color Grading', 'Motion Graphics', 'Figma Pro', 'Cinematography', 'Industrial Design', 'Visual Aesthetics'],
      triggers: ['design', 'ui', 'ux', 'blender', '3d', 'figma', 'typography', 'graphic design', 'cinematography', 'architecture']
    }
  };

  const DEFAULT_STARTER_VIBES = [
    '#ai',
    '#coding',
    'Deep Work',
    '#lofi',
    'Machine Learning',
    'Minimal Desk Setup',
    'Python AI',
    'Synthwave Beats',
    'Astrophysics',
    'Calisthenics'
  ];

  class RelatedSuggester {
    /**
     * Get related keywords based on user's active keyword list
     */
    static getSuggestions(currentKeywords = [], limit = 8) {
      const activeNormalized = new Set(currentKeywords.map(k => k.trim().toLowerCase()));
      const matchedDomainTags = new Set();

      // If user has no keywords yet, return curated starters
      if (currentKeywords.length === 0) {
        return DEFAULT_STARTER_VIBES.slice(0, limit);
      }

      // 1. Analyze user keywords and detect relevant domains
      for (const kw of currentKeywords) {
        const lowerKw = kw.toLowerCase().replace('#', '');
        for (const [domainKey, domain] of Object.entries(TOPIC_GRAPH)) {
          const isMatch = domain.triggers.some(trig => {
            const regex = new RegExp(`(^|\\W)${trig}(\\W|$)`, 'i');
            return regex.test(lowerKw) || lowerKw.includes(trig) || trig.includes(lowerKw);
          });

          if (isMatch) {
            domain.tags.forEach(t => matchedDomainTags.add(t));
          }
        }
      }

      // Filter out tags the user already has in their preference list
      const candidates = Array.from(matchedDomainTags).filter(t => {
        const norm = t.trim().toLowerCase();
        return !activeNormalized.has(norm);
      });

      // If we don't have enough candidates from direct domain matches, supplement with high-value starters
      if (candidates.length < limit) {
        for (const fallback of DEFAULT_STARTER_VIBES) {
          if (!activeNormalized.has(fallback.toLowerCase()) && !candidates.includes(fallback)) {
            candidates.push(fallback);
          }
        }
      }

      // Shuffle slightly for fresh suggestions
      return RelatedSuggester.shuffle(candidates).slice(0, limit);
    }

    /**
     * Fisher-Yates array shuffle
     */
    static shuffle(array) {
      const arr = [...array];
      for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
      }
      return arr;
    }
  }

  // Export globally
  if (typeof window !== 'undefined') {
    window.VibeFeedRelatedSuggester = RelatedSuggester;
  }
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = RelatedSuggester;
  }
})();
