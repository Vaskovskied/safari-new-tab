/* ============================================================
   macOS New Tab — Logic
   ============================================================ */

'use strict';

// ─── Constants ───────────────────────────────────────────────
const HIDDEN_TABS_KEY = 'hiddenClosedTabs';
const MAX_CLOSED_TABS = 9; // show up to 9 recently closed tabs (3 rows × 3 cols)

// Palette for letter-fallback icons (deterministic by char code)
const ICON_COLORS = [
  '#5E5CE6', '#007AFF', '#34C759', '#FF9F0A',
  '#FF375F', '#BF5AF2', '#32ADE6', '#FF6B35',
  '#30B0C7', '#AC8E68',
];

// ─── Utilities ───────────────────────────────────────────────

/**
 * Get a favicon URL via Google's S2 service.
 * Falls back gracefully if the domain can't be parsed.
 */
function faviconUrl(url, size = 64) {
  try {
    const domain = new URL(url).hostname;
    return `https://www.google.com/s2/favicons?domain=${domain}&sz=${size}`;
  } catch {
    return null;
  }
}

/**
 * Pick a deterministic background color for a letter icon.
 */
function letterColor(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) hash = str.charCodeAt(i) + ((hash << 5) - hash);
  return ICON_COLORS[Math.abs(hash) % ICON_COLORS.length];
}

/**
 * Return the first character of a string, uppercased.
 */
function firstChar(str) {
  return (str || '?').trim().charAt(0).toUpperCase();
}

// ─── Search ──────────────────────────────────────────────────

document.getElementById('searchForm').addEventListener('submit', (e) => {
  e.preventDefault();
  const query = document.getElementById('searchInput').value.trim();
  if (!query) return;

  // If it looks like a URL, navigate directly; otherwise Google search
  const isUrl = /^(https?:\/\/|www\.)/i.test(query) || /^[a-z0-9-]+\.[a-z]{2,}/i.test(query);
  if (isUrl) {
    const url = /^https?:\/\//i.test(query) ? query : `https://${query}`;
    window.location.href = url;
  } else {
    window.location.href = `https://www.google.com/search?q=${encodeURIComponent(query)}`;
  }
});

// ─── Bookmark rendering helpers ───────────────────────────────

/**
 * Create a single bookmark anchor element (squircle icon + label).
 */
function createBookmarkEl(node) {
  const a = document.createElement('a');
  a.className = 'bookmark-item';
  a.href = node.url;
  a.title = node.title;

  const iconDiv = document.createElement('div');
  iconDiv.className = 'bookmark-icon';

  const fav = faviconUrl(node.url);
  if (fav) {
    const img = document.createElement('img');
    img.className = 'favicon';
    img.src = fav;
    img.alt = '';
    // On error, replace with letter icon
    img.onerror = () => {
      img.remove();
      iconDiv.appendChild(makeLetterIcon(node.title, node.url));
    };
    iconDiv.appendChild(img);
  } else {
    iconDiv.appendChild(makeLetterIcon(node.title, node.url));
  }

  const label = document.createElement('span');
  label.className = 'bookmark-label';
  label.textContent = node.title || node.url;

  a.appendChild(iconDiv);
  a.appendChild(label);
  return a;
}

/**
 * Create a letter-fallback icon div.
 */
function makeLetterIcon(title, url) {
  const div = document.createElement('div');
  div.className = 'letter-icon';
  div.textContent = firstChar(title || url);
  div.style.background = letterColor(title || url);
  return div;
}

/**
 * Create a folder element with a 2×2 collage of child favicons.
 * If a child slot is itself a folder (no url), show a folder SVG icon instead.
 */
function createFolderEl(node, onClick) {
  const wrapper = document.createElement('div');
  wrapper.className = 'bookmark-item';
  wrapper.title = node.title;
  wrapper.style.cursor = 'pointer';

  const iconDiv = document.createElement('div');
  iconDiv.className = 'bookmark-icon folder-icon';

  // Collect up to 4 direct children (bookmarks OR sub-folders) for the collage
  const allChildren = (node.children || []).slice(0, 4);

  // Pad to exactly 4 slots
  while (allChildren.length < 4) allChildren.push(null);

  allChildren.forEach((child) => {
    if (!child) {
      // Empty slot — transparent placeholder
      const empty = document.createElement('div');
      empty.style.background = 'transparent';
      iconDiv.appendChild(empty);
    } else if (child.url) {
      // Bookmark — show favicon
      const fav = faviconUrl(child.url, 32);
      if (fav) {
        const img = document.createElement('img');
        img.className = 'mini-favicon';
        img.src = fav;
        img.alt = '';
        img.onerror = () => {
          img.replaceWith(makeMiniLetter(child.title, child.url));
        };
        iconDiv.appendChild(img);
      } else {
        iconDiv.appendChild(makeMiniLetter(child.title, child.url));
      }
    } else {
      // Sub-folder — show a folder SVG icon
      iconDiv.appendChild(makeMiniFolder());
    }
  });

  const label = document.createElement('span');
  label.className = 'bookmark-label';
  label.textContent = node.title || 'Folder';

  wrapper.appendChild(iconDiv);
  wrapper.appendChild(label);
  wrapper.addEventListener('click', () => onClick(node));
  return wrapper;
}

function makeMiniLetter(title, url) {
  const div = document.createElement('div');
  div.className = 'mini-letter';
  div.textContent = firstChar(title || url);
  div.style.background = letterColor(title || url);
  return div;
}

/**
 * Create a mini folder SVG icon for sub-folder slots in the collage.
 */
function makeMiniFolder() {
  const div = document.createElement('div');
  div.className = 'mini-folder';
  div.innerHTML = `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor">
      <path d="M10.5 3H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.17a2 2 0 0 1-1.42-.59L10.5 3z"/>
    </svg>
  `;
  return div;
}

// ─── Folder popover ───────────────────────────────────────────

function openFolderPopover(folderNode) {
  // Remove any existing popover
  closeFolderPopover();

  const overlay = document.createElement('div');
  overlay.className = 'folder-popover-overlay';
  overlay.id = 'folderPopoverOverlay';

  const popover = document.createElement('div');
  popover.className = 'folder-popover';

  // Header
  const header = document.createElement('div');
  header.className = 'folder-popover-header';

  const title = document.createElement('span');
  title.className = 'folder-popover-title';
  title.textContent = folderNode.title || 'Folder';

  const closeBtn = document.createElement('button');
  closeBtn.className = 'folder-popover-close';
  closeBtn.innerHTML = '&times;';
  closeBtn.addEventListener('click', closeFolderPopover);

  header.appendChild(title);
  header.appendChild(closeBtn);

  // Grid of children
  const grid = document.createElement('div');
  grid.className = 'folder-popover-grid';

  const children = folderNode.children || [];
  children.forEach((child) => {
    if (child.url) {
      grid.appendChild(createBookmarkEl(child));
    } else if (child.children) {
      // Nested folder
      grid.appendChild(createFolderEl(child, openFolderPopover));
    }
  });

  if (children.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'empty-state';
    empty.textContent = 'This folder is empty.';
    grid.appendChild(empty);
  }

  popover.appendChild(header);
  popover.appendChild(grid);
  overlay.appendChild(popover);

  // Close on overlay click (outside popover)
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) closeFolderPopover();
  });

  document.body.appendChild(overlay);
}

function closeFolderPopover() {
  const existing = document.getElementById('folderPopoverOverlay');
  if (existing) existing.remove();
}

// Close on Escape key
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') closeFolderPopover();
});

// ─── Load Bookmarks ───────────────────────────────────────────

function loadBookmarks() {
  chrome.bookmarks.getTree((tree) => {
    const grid = document.getElementById('bookmarksGrid');
    grid.innerHTML = '';

    // tree[0] is the root, tree[0].children = [Bookmarks Bar, Other Bookmarks, Mobile Bookmarks]
    const root = tree[0];
    if (!root || !root.children) return;

    // Find Bookmarks Bar (id "1") and Other Bookmarks (id "2")
    const bookmarksBar = root.children.find(c => c.id === '1') || root.children[0];
    const otherBookmarks = root.children.find(c => c.id === '2');

    // Render Bookmarks Bar items first
    if (bookmarksBar && bookmarksBar.children) {
      bookmarksBar.children.forEach((node) => {
        if (node.url) {
          grid.appendChild(createBookmarkEl(node));
        } else if (node.children) {
          grid.appendChild(createFolderEl(node, openFolderPopover));
        }
      });
    }

    // Render "Other Bookmarks" folder at the end (if it has children)
    if (otherBookmarks && otherBookmarks.children && otherBookmarks.children.length > 0) {
      grid.appendChild(createFolderEl(otherBookmarks, openFolderPopover));
    }
  });
}

// ─── Recently Closed Tabs ─────────────────────────────────────

function getHiddenTabs() {
  try {
    return JSON.parse(localStorage.getItem(HIDDEN_TABS_KEY) || '[]');
  } catch {
    return [];
  }
}

function setHiddenTabs(arr) {
  localStorage.setItem(HIDDEN_TABS_KEY, JSON.stringify(arr));
}

function loadRecentlyClosedTabs() {
  const grid = document.getElementById('tabsGrid');
  const emptyEl = document.getElementById('tabsEmpty');
  const hidden = getHiddenTabs();

  chrome.sessions.getRecentlyClosed({ maxResults: 25 }, (sessions) => {
    grid.innerHTML = '';

    // Flatten: sessions can be windows (with tabs) or single tabs
    const tabs = [];
    sessions.forEach((session) => {
      if (session.tab) {
        tabs.push(session.tab);
      } else if (session.window && session.window.tabs) {
        session.window.tabs.forEach(t => tabs.push(t));
      }
    });

    // Filter out hidden (cleared) tabs and limit count
    const visible = tabs
      .filter(t => t.url && !hidden.includes(t.sessionId || t.url))
      .slice(0, MAX_CLOSED_TABS);

    if (visible.length === 0) {
      emptyEl.style.display = '';
      return;
    }

    emptyEl.style.display = 'none';

    visible.forEach((tab) => {
      const pill = document.createElement('a');
      pill.className = 'tab-pill';
      pill.href = tab.url;
      pill.title = tab.title || tab.url;

      // Favicon
      const fav = faviconUrl(tab.url, 32);
      if (fav) {
        const img = document.createElement('img');
        img.className = 'tab-pill-favicon';
        img.src = fav;
        img.alt = '';
        img.onerror = () => img.remove();
        pill.appendChild(img);
      }

      const titleEl = document.createElement('span');
      titleEl.className = 'tab-pill-title';
      titleEl.textContent = tab.title || tab.url;
      pill.appendChild(titleEl);

      // Clicking reopens the tab
      pill.addEventListener('click', (e) => {
        e.preventDefault();
        // Try to restore via session; fall back to opening URL
        if (tab.sessionId) {
          chrome.sessions.restore(tab.sessionId);
        } else {
          chrome.tabs.create({ url: tab.url });
        }
      });

      grid.appendChild(pill);
    });
  });
}

// ─── Clear All ────────────────────────────────────────────────

document.getElementById('clearAllBtn').addEventListener('click', () => {
  chrome.sessions.getRecentlyClosed({ maxResults: 25 }, (sessions) => {
    const ids = [];
    const urls = [];

    sessions.forEach((session) => {
      if (session.tab) {
        if (session.tab.sessionId) ids.push(session.tab.sessionId);
        else if (session.tab.url) urls.push(session.tab.url);
      } else if (session.window && session.window.tabs) {
        session.window.tabs.forEach(t => {
          if (t.sessionId) ids.push(t.sessionId);
          else if (t.url) urls.push(t.url);
        });
      }
    });

    // Store hidden identifiers so we don't show them again
    setHiddenTabs([...getHiddenTabs(), ...ids, ...urls]);

    // Re-render (will show empty state)
    loadRecentlyClosedTabs();
  });
});

// ─── Init ─────────────────────────────────────────────────────

loadBookmarks();
loadRecentlyClosedTabs();
