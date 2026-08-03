/*
  Hypothes.is inline annotations.
  Fetches public annotations for the current page from the Hypothes.is REST API
  and renders each one as a small marker in the right margin (desktop) or
  inline below the paragraph (mobile). Click a marker to expand the full comment;
  click the expanded note to collapse it again. When multiple annotations sit
  close together vertically, later ones are pushed down so notes never overlap.
  Pairs with the Hypothes.is embed.js (configured with showHighlights: "never")
  so the sidebar is still used for posting, but reading happens inline.

  To disable: set params.hypothesis.inline = false in hugo.toml.
  To delete entirely: remove this file, /static/css/hypothesis-inline.css,
    the inline-mode block in layouts/partials/hypothesis.html, and the
    `inline` line in hugo.toml.
*/
(function () {
  'use strict';

  // --- Config -------------------------------------------------------------
  const API = 'https://api.hypothes.is/api/search';
  const LIMIT = 200;
  const DESKTOP_MQ = '(min-width: 1100px)';
  const STACK_GAP = 8; // px between stacked margin notes on desktop

  // --- Bootstrap ----------------------------------------------------------
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  async function init() {
    const container = document.querySelector('main.page');
    if (!container) return;

    const rows = await fetchAnnotations(window.location.href.split('#')[0]);
    if (!rows.length) return;

    container.classList.add('has-annotations');
    const index = buildTextIndex(container);
    const { topLevel, repliesByParent } = groupAnnotations(rows);

    for (const anno of topLevel) {
      renderAnnotation(anno, repliesByParent.get(anno.id) || [], container, index);
    }

    packNotes(container);
    attachToggleHandler(container);
  }

  // --- Data ---------------------------------------------------------------
  async function fetchAnnotations(uri) {
    try {
      const res = await fetch(`${API}?uri=${encodeURIComponent(uri)}&limit=${LIMIT}`);
      if (!res.ok) return [];
      const data = await res.json();
      return data.rows || [];
    } catch (_) {
      return [];
    }
  }

  function groupAnnotations(rows) {
    const topLevel = [];
    const repliesByParent = new Map();
    for (const a of rows) {
      const parents = a.references || [];
      if (parents.length > 0) {
        const parent = parents[parents.length - 1];
        if (!repliesByParent.has(parent)) repliesByParent.set(parent, []);
        repliesByParent.get(parent).push(a);
      } else {
        topLevel.push(a);
      }
    }
    return { topLevel, repliesByParent };
  }

  // --- Anchoring (find the annotation's quote in the page DOM) ------------
  function buildTextIndex(root) {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode(node) {
        if (node.parentElement && node.parentElement.closest('.annotation-note')) {
          return NodeFilter.FILTER_REJECT;
        }
        return NodeFilter.FILTER_ACCEPT;
      }
    });
    const nodes = [];
    let text = '';
    let node;
    while ((node = walker.nextNode())) {
      nodes.push({ node, start: text.length });
      text += node.nodeValue;
    }
    return { nodes, text };
  }

  function findRange(quote, prefix, index) {
    if (prefix) {
      const i = index.text.indexOf(prefix + quote);
      if (i !== -1) {
        return rangeFromOffsets(i + prefix.length, i + prefix.length + quote.length, index);
      }
    }
    const i = index.text.indexOf(quote);
    if (i === -1) return null;
    return rangeFromOffsets(i, i + quote.length, index);
  }

  function rangeFromOffsets(startOff, endOff, index) {
    // At text-node boundaries an offset belongs to two nodes (end of one, start of the next).
    // Prefer the LATER node for the start (so the range opens inside the next text node) and
    // the EARLIER node for the end. Otherwise quotes that begin right after a heading or
    // inline element produce a range that crosses element boundaries.
    let startNode, startNodeOff, endNode, endNodeOff;
    for (const { node, start } of index.nodes) {
      const end = start + node.nodeValue.length;
      if (!startNode && startOff >= start && startOff < end) {
        startNode = node;
        startNodeOff = startOff - start;
      }
      if (!endNode && endOff > start && endOff <= end) {
        endNode = node;
        endNodeOff = endOff - start;
      }
    }
    if (!startNode && index.nodes.length) {
      const last = index.nodes[index.nodes.length - 1];
      if (startOff === last.start + last.node.nodeValue.length) {
        startNode = last.node;
        startNodeOff = last.node.nodeValue.length;
      }
    }
    if (!endNode && index.nodes.length && endOff === 0) {
      endNode = index.nodes[0].node;
      endNodeOff = 0;
    }
    if (!startNode || !endNode) return null;
    const r = document.createRange();
    r.setStart(startNode, startNodeOff);
    r.setEnd(endNode, endNodeOff);
    return r;
  }

  // --- Rendering ----------------------------------------------------------
  function renderAnnotation(anno, replies, container, index) {
    const quoteSel = findQuoteSelector(anno);
    if (!quoteSel) return;

    const range = findRange(quoteSel.exact, quoteSel.prefix, index);
    if (!range) return;

    const mark = wrapInMark(range, anno.id);
    if (!mark) return;

    const note = buildNote(anno, replies);
    setDesiredTop(note, mark, container);
    insertNoteAfterBlock(note, mark, container);
  }

  function findQuoteSelector(anno) {
    const target = anno.target && anno.target[0];
    if (!target || !target.selector) return null;
    return target.selector.find(s => s.type === 'TextQuoteSelector') || null;
  }

  function wrapInMark(range, annotationId) {
    try {
      const mark = document.createElement('mark');
      mark.className = 'annotation-highlight';
      mark.dataset.annotationId = annotationId;
      range.surroundContents(mark);
      return mark;
    } catch (_) {
      return null;
    }
  }

  function buildNote(anno, replies) {
    const note = document.createElement('aside');
    note.className = 'annotation-note';
    note.dataset.forId = anno.id;
    note.appendChild(buildMarker(anno, replies.length));
    note.appendChild(buildContent(anno, replies));
    return note;
  }

  function buildMarker(anno, replyCount) {
    const name = displayName(anno);
    const total = 1 + replyCount;
    const marker = document.createElement('button');
    marker.type = 'button';
    marker.className = 'annotation-marker';
    marker.setAttribute('aria-expanded', 'false');
    marker.setAttribute('aria-label', `Show comment by ${name}`);
    marker.innerHTML =
      `<span class="annotation-marker-initials">${escapeHtml(initialsFor(name))}</span>` +
      (total > 1 ? `<span class="annotation-marker-count">·${total}</span>` : '');
    return marker;
  }

  function buildContent(anno, replies) {
    const content = document.createElement('div');
    content.className = 'annotation-content';
    let html = noteBody(anno);
    for (const reply of replies) {
      html += `<div class="annotation-reply">${noteBody(reply)}</div>`;
    }
    content.innerHTML = html;
    return content;
  }

  function noteBody(anno) {
    return `<div class="annotation-meta">${escapeHtml(displayName(anno))}</div>` +
           `<div class="annotation-text">${linkify(escapeHtml(anno.text || ''))}</div>`;
  }

  function setDesiredTop(note, mark, container) {
    const top = Math.round(
      mark.getBoundingClientRect().top - container.getBoundingClientRect().top
    );
    note.dataset.desiredTop = String(top);
    note.style.top = top + 'px';
  }

  function insertNoteAfterBlock(note, mark, container) {
    // Find the nearest block-level ancestor of the mark inside `container` so
    // that on narrow screens (where the note flows in document order) the note
    // appears right after the paragraph that contains the highlight.
    let block = mark.parentElement;
    while (block && block !== container) {
      const display = getComputedStyle(block).display;
      if (display !== 'inline' && display !== 'inline-block') break;
      block = block.parentElement;
    }
    const parent = block && block !== container ? block.parentElement : null;
    if (parent) {
      parent.insertBefore(note, block.nextSibling);
    } else {
      container.appendChild(note);
    }
  }

  // --- Layout (stacking on desktop so notes never overlap) ----------------
  function packNotes(container) {
    if (!window.matchMedia(DESKTOP_MQ).matches) return;
    const notes = [...container.querySelectorAll('.annotation-note')];
    notes.sort((a, b) => Number(a.dataset.desiredTop) - Number(b.dataset.desiredTop));
    let cursor = -Infinity;
    for (const note of notes) {
      const desired = Number(note.dataset.desiredTop);
      const top = Math.max(desired, cursor);
      note.style.top = top + 'px';
      cursor = top + note.offsetHeight + STACK_GAP;
    }
  }

  // --- Interaction --------------------------------------------------------
  function attachToggleHandler(container) {
    container.addEventListener('click', (e) => {
      if (e.target.closest('a')) return;
      const note = e.target.closest('.annotation-note');
      if (!note) return;
      const expanded = note.classList.toggle('expanded');
      const marker = note.querySelector('.annotation-marker');
      if (marker) marker.setAttribute('aria-expanded', String(expanded));
      packNotes(container);
    });
  }

  // --- Utilities ----------------------------------------------------------
  function displayName(anno) {
    if (anno.user_info && anno.user_info.display_name) return anno.user_info.display_name;
    const m = anno.user && anno.user.match(/^acct:([^@]+)@/);
    return m ? m[1] : 'anonymous';
  }

  function initialsFor(name) {
    if (!name) return '?';
    const parts = name.trim().split(/\s+/);
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, c => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c]));
  }

  function linkify(s) {
    return s.replace(/https?:\/\/[^\s<]+/g, url => `<a href="${url}" rel="noopener" target="_blank">${url}</a>`);
  }
})();
