// Unit tests for VibeFeed FilterEngine and VibeAnalyzer
const fs = require('fs');

// Mock window and browser globals
global.window = {};

// Load VibeAnalyzer
eval(fs.readFileSync('content/vibe-analyzer.js', 'utf8'));
const VibeAnalyzer = global.window.VibeFeedAnalyzer;

// Load FilterEngine
eval(fs.readFileSync('content/filter-engine.js', 'utf8'));
const FilterEngine = global.window.VibeFeedFilterEngine;

console.log('--- Testing FilterEngine ---');
const engine = new FilterEngine();
engine.setPreferences({
  enabled: true,
  filterMode: 'whitelist',
  keywords: ['#ai', 'coding', 'ambient music', 'apple'],
  negativeKeywords: ['prank', 'gossip'],
  matchTarget: { title: true, channel: true, description: true }
});

const testCases = [
  {
    data: { title: 'Building an Autonomous AI Agent with Python', channel: 'TechGuy', metaSnippet: '', isShort: false },
    expected: true,
    reason: 'Matches AI and coding'
  },
  {
    data: { title: 'EXTREME 24 HOUR PRANK IN STORE', channel: 'Joker', metaSnippet: '', isShort: false },
    expected: false,
    reason: 'Contains negative keyword prank'
  },
  {
    data: { title: 'Celebrity Hollywood Drama and gossip', channel: 'PopNews', metaSnippet: '', isShort: false },
    expected: false,
    reason: 'Contains gossip / no whitelist match'
  },
  {
    data: { title: 'Deep Ambient Music for Focus & Flow State', channel: 'SoundScape', metaSnippet: '', isShort: false },
    expected: true,
    reason: 'Matches ambient music'
  },
  {
    data: { title: 'New M4 MacBook Pro Review - The Real Story #apple #tech', channel: 'MKBHD', metaSnippet: '', isShort: false },
    expected: true,
    reason: 'Matches apple'
  },
  {
    data: { title: 'Random Cat Doing Cat Things', channel: 'Kittens', metaSnippet: '', isShort: false },
    expected: false,
    reason: 'No keywords matched'
  }
];

let failed = 0;
for (const tc of testCases) {
  const result = engine.shouldShowCard(tc.data);
  const pass = result === tc.expected;
  if (!pass) failed++;
  console.log(`[${pass ? 'PASS' : 'FAIL'}] "${tc.data.title}" -> got ${result ? 'SHOW' : 'FILTER'}, expected ${tc.expected ? 'SHOW' : 'FILTER'} (${tc.reason})`);
}

console.log('\n--- Testing VibeAnalyzer ---');
const sampleMeta = {
  videoId: 'dQw4w9WgXcQ',
  videoTitle: 'How to Build an Autonomous AI Agent in Python (2026 Tutorial)',
  channelName: 'ArjanCodes',
  description: 'In this video we explore machine learning, langchain and neural networks for autonomous development.',
  explicitHashtags: ['#python', '#ai'],
  metaKeywords: 'ai, python, machine learning'
};

const vibes = VibeAnalyzer.analyze(sampleMeta);
console.log('Extracted vibes for video:');
vibes.forEach(v => console.log(` - [${v.type}] ${v.text}`));

const vibeTexts = vibes.map(v => v.text.toLowerCase());
const hasAi = vibeTexts.some(t => t.includes('ai'));
const hasPython = vibeTexts.some(t => t.includes('python'));

if (hasAi && hasPython) {
  console.log('[PASS] VibeAnalyzer extracted expected AI and Python tags.');
} else {
  console.log('[FAIL] VibeAnalyzer missed core topics.');
  failed++;
}

if (failed === 0) {
  console.log('\nAll tests passed successfully!');
  process.exit(0);
} else {
  console.error(`\n${failed} tests failed.`);
  process.exit(1);
}
