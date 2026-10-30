/**
 * VibeFeed - Options Page Controller
 * Manages full settings, starter packs, import/export backup, and storage metrics.
 */

document.addEventListener('DOMContentLoaded', async () => {
  // Navigation
  const navItems = document.querySelectorAll('.nav-item');
  const sections = document.querySelectorAll('.settings-section');

  // Controls
  const masterToggle = document.getElementById('opt-master-toggle');
  const visualStyle = document.getElementById('opt-visual-style');
  const hideShorts = document.getElementById('opt-hide-shorts');
  const floatingBadge = document.getElementById('opt-floating-badge');
  const watchSuggest = document.getElementById('opt-watch-suggest');
  const feedCuration = document.getElementById('opt-feed-curation');
  const unrestrictedSearch = document.getElementById('opt-unrestricted-search');
  const watchWeights = document.getElementById('opt-watch-weights');
  const diversityGuard = document.getElementById('opt-diversity-guard');
  
  const matchTitle = document.getElementById('opt-match-title');
  const matchChannel = document.getElementById('opt-match-channel');
  const matchDesc = document.getElementById('opt-match-desc');

  const exportBtn = document.getElementById('btn-export-json');
  const importTrigger = document.getElementById('btn-import-trigger');
  const importInput = document.getElementById('file-import-input');
  const resetBtn = document.getElementById('btn-reset-defaults');
  const toast = document.getElementById('toast');
  const storageFootprint = document.getElementById('storage-footprint-text');

  // Starter Packs definition
  const STARTER_PACKS = {
    code: ['#coding', '#ai', 'python', 'rust', 'system design', 'minimalism', 'software architecture', 'linux'],
    lofi: ['#lofi', 'ambient music', 'synthwave', 'chillhop', 'focus beats', 'downtempo', 'peaceful piano'],
    science: ['#science', 'astronomy', 'quantum physics', 'nasa', 'spacex', 'neuroscience', 'documentary'],
    mindset: ['#productivity', 'habits', 'deep work', 'stoicism', 'calisthenics', 'mindset', 'fitness routine']
  };

  // Load preferences
  let prefs = await new Promise((resolve) => {
    chrome.storage.local.get(null, resolve);
  });

  // Keep options page in sync when storage changes elsewhere (e.g. popup or another tab)
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local') {
      for (const [key, change] of Object.entries(changes)) {
        prefs[key] = change.newValue;
      }
      init();
    }
  });

  function save(slice) {
    prefs = { ...prefs, ...slice };
    chrome.storage.local.set(slice, () => {
      showToast('Preferences updated');
      calculateStorageUsage();
    });
  }

  function showToast(msg) {
    toast.textContent = msg;
    toast.classList.add('show');
    setTimeout(() => toast.classList.remove('show'), 2200);
  }

  function init() {
    masterToggle.checked = prefs.enabled !== false;
    visualStyle.value = prefs.visualStyle || 'hide';
    hideShorts.checked = Boolean(prefs.hideShorts);
    floatingBadge.checked = prefs.showFloatingBadge !== false;
    watchSuggest.checked = prefs.autoSuggestOnWatch !== false;
    if (feedCuration) feedCuration.checked = prefs.feedCuration !== false;
    if (unrestrictedSearch) unrestrictedSearch.checked = !prefs.filterScope?.search;
    if (watchWeights) watchWeights.checked = prefs.adaptiveWatchWeights !== false;
    if (diversityGuard) diversityGuard.checked = prefs.diversityGuardrail !== false;

    const targets = prefs.matchTarget || {};
    matchTitle.checked = targets.title !== false;
    matchChannel.checked = targets.channel !== false;
    matchDesc.checked = targets.description !== false;

    calculateStorageUsage();
  }

  function calculateStorageUsage() {
    if (chrome.storage.local.getBytesInUse) {
      chrome.storage.local.getBytesInUse(null, (bytes) => {
        storageFootprint.textContent = `${(bytes / 1024).toFixed(2)} KB of local storage used`;
      });
    } else {
      const json = JSON.stringify(prefs);
      storageFootprint.textContent = `~${(json.length / 1024).toFixed(2)} KB storage used`;
    }
  }

  // Sidebar navigation
  navItems.forEach(item => {
    item.addEventListener('click', (e) => {
      e.preventDefault();
      const secId = item.getAttribute('data-section');

      navItems.forEach(i => i.classList.remove('active'));
      sections.forEach(s => s.classList.remove('active'));

      item.classList.add('active');
      const targetSec = document.getElementById(`sec-${secId}`);
      if (targetSec) targetSec.classList.add('active');
    });
  });

  // Settings change listeners
  masterToggle.addEventListener('change', () => save({ enabled: masterToggle.checked }));
  visualStyle.addEventListener('change', () => save({ visualStyle: visualStyle.value }));
  hideShorts.addEventListener('change', () => save({ hideShorts: hideShorts.checked }));
  floatingBadge.addEventListener('change', () => save({ showFloatingBadge: floatingBadge.checked }));
  watchSuggest.addEventListener('change', () => save({ autoSuggestOnWatch: watchSuggest.checked }));
  if (feedCuration) {
    feedCuration.addEventListener('change', () => save({ feedCuration: feedCuration.checked }));
  }
  if (watchWeights) {
    watchWeights.addEventListener('change', () => save({ adaptiveWatchWeights: watchWeights.checked }));
  }
  if (diversityGuard) {
    diversityGuard.addEventListener('change', () => save({ diversityGuardrail: diversityGuard.checked }));
  }
  if (unrestrictedSearch) {
    unrestrictedSearch.addEventListener('change', () => {
      const scope = prefs.filterScope || { homeFeed: true, subscriptions: false, search: false, sidebar: true };
      scope.search = !unrestrictedSearch.checked;
      save({ filterScope: scope });
    });
  }

  function updateMatchTargets() {
    const updated = {
      title: matchTitle.checked,
      channel: matchChannel.checked,
      description: matchDesc.checked,
      hashtags: true
    };
    save({ matchTarget: updated });
  }

  matchTitle.addEventListener('change', updateMatchTargets);
  matchChannel.addEventListener('change', updateMatchTargets);
  matchDesc.addEventListener('change', updateMatchTargets);

  // Starter Packs Apply
  document.querySelectorAll('.starter-apply-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const packKey = btn.getAttribute('data-pack');
      const tags = STARTER_PACKS[packKey] || [];

      // Cleanly replace keywords with starter pack tags (clearing previous preferences)
      save({
        keywords: [...tags],
        keywordWeights: {}
      });

      btn.textContent = '✓ Applied';
      btn.style.background = '#FFFFFF';
      btn.style.color = '#000000';
      setTimeout(() => {
        btn.textContent = 'Apply Starter Pack';
        btn.style.background = '';
        btn.style.color = '';
      }, 2000);
    });
  });

  // Export JSON
  exportBtn.addEventListener('click', () => {
    const backupData = {
      version: '1.0.0',
      exportedAt: new Date().toISOString(),
      preferences: prefs
    };

    const blob = new Blob([JSON.stringify(backupData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `vibefeed-preferences-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    showToast('Preferences exported to file');
  });

  // Import JSON
  importTrigger.addEventListener('click', () => importInput.click());
  importInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const parsed = JSON.parse(event.target.result);
        const importedPrefs = parsed.preferences || parsed;

        if (Array.isArray(importedPrefs.keywords)) {
          chrome.storage.local.set(importedPrefs, () => {
            prefs = importedPrefs;
            init();
            showToast('Preferences successfully imported!');
          });
        } else {
          alert('Invalid format: File does not contain valid VibeFeed preferences.');
        }
      } catch (err) {
        alert('Failed to parse JSON file.');
      }
    };
    reader.readAsText(file);
    importInput.value = '';
  });

  // Reset to Defaults
  resetBtn.addEventListener('click', () => {
    if (confirm('Reset all VibeFeed preferences to initial factory defaults?')) {
      const defaults = {
        enabled: true,
        filterMode: 'whitelist',
        visualStyle: 'hide',
        keywords: ['#ai', 'coding', 'productivity', 'minimalism', 'synthwave'],
        negativeKeywords: ['clickbait', 'prank', 'drama'],
        matchTarget: { title: true, channel: true, hashtags: true, description: true },
        hideShorts: false,
        showFloatingBadge: true,
        autoSuggestOnWatch: true,
        recentVibes: []
      };
      chrome.storage.local.set(defaults, () => {
        prefs = defaults;
        init();
        showToast('Reset to defaults');
      });
    }
  });

  init();
});
