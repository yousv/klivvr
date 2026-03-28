const K = { GROUPS: 'ks_groups', DATA: 'ks_data', HIDE: 'ks_hide' };

const CAT = {
  Available:   { label: 'Available',   color: '#8F76D8', rgb: [143, 118, 216] },
  General:     { label: 'General',     color: '#63BBF4', rgb: [ 99, 187, 244] },
  Unavailable: { label: 'Unavailable', color: '#E36C73', rgb: [227, 108, 115] },
  Other:       { label: 'Other',       color: '#787878', rgb: [120, 120, 120] },
};
const CAT_ORDER = ['Available', 'General', 'Unavailable', 'Other'];

const NAME_STYLES = [
  { size: '15px', weight: '600', color: '#ffffff'  },
  { size: '12px', weight: '400', color: '#c4b5fd'  },
  { size: '12px', weight: '400', color: '#ef9a9a'  },
  { size: '11px', weight: '400', color: '#6ee7b7'  },
];

const S = {
  headers: [], rows: [], sheetName: '', sheetTitle: '',
  editRow: null, delRow: null, editCat: 'General',
  loggedIn: false, writeEnabled: false,
  hideContent: localStorage.getItem(K.HIDE) === '1',
  openGroups: new Set(JSON.parse(localStorage.getItem(K.GROUPS) || '[]')),
  autoExpanded: new Set(),
};

// ── Drag state for pinned section ─────────────────────────────────────────
let _dragSrc = null;

// ── Utilities ─────────────────────────────────────────────────────────────
const $ = id => document.getElementById(id);
const mk = (tag, cls) => { const e = document.createElement(tag); e.className = cls; return e; };
const open_  = id => $(id).classList.add('open');
const close_ = id => $(id).classList.remove('open');
const showLoader = msg => { $('loader-msg').textContent = msg; $('loader').style.display = 'flex'; };
const hideLoader = () => $('loader').style.display = 'none';
const xe = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function mkBtn(cls, text, title, onClick) {
  const b = mk('button', 'btn ' + cls);
  b.textContent = text; b.title = title;
  b.addEventListener('click', onClick);
  return b;
}

function toast(msg, type = 'info') {
  const t = mk('div', 'toast ' + type);
  t.innerHTML = `<span class="t-dot"></span><span>${xe(msg)}</span>`;
  $('toasts').appendChild(t);
  setTimeout(() => t.remove(), 4500);
}

function saveCache() {
  localStorage.setItem(K.DATA, JSON.stringify({
    headers: S.headers, rows: S.rows, sheetName: S.sheetName, title: S.sheetTitle,
  }));
}
function loadCache() {
  const raw = localStorage.getItem(K.DATA);
  if (!raw) return false;
  try {
    const d = JSON.parse(raw);
    S.headers = d.headers || []; S.rows = d.rows || [];
    S.sheetName = d.sheetName || ''; S.sheetTitle = d.title || '';
    if (d.title) $('sheet-label').textContent = `${d.title} / ${d.sheetName}`;
    return true;
  } catch { return false; }
}
function persistGroups() { localStorage.setItem(K.GROUPS, JSON.stringify([...S.openGroups])); }

// ── Eye icons ─────────────────────────────────────────────────────────────
const EYE_OPEN = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>`;
const EYE_SHUT = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/><line x1="1" y1="1" x2="23" y2="23"/></svg>`;
const PIN_SVG = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="17" x2="12" y2="22"/><path d="M5 17h14v-1.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V6h1a2 2 0 0 0 0-4H8a2 2 0 0 0 0 4h1v4.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24z"/></svg>`;
const GRIP_SVG = `<span></span><span></span><span></span>`;

function updateHideBtn() {
  const btn = $('btn-hide');
  if (!btn) return;
  btn.innerHTML = S.hideContent ? EYE_SHUT : EYE_OPEN;
  btn.style.opacity = S.hideContent ? '1' : '0.5';
  btn.title = S.hideContent ? 'Show row content' : 'Hide row content';
}

function toggleHide() {
  S.hideContent = !S.hideContent;
  localStorage.setItem(K.HIDE, S.hideContent ? '1' : '0');
  updateHideBtn();
  render();
}
function setWriteEnabled(v) {
  S.writeEnabled = v;
  ['btn-add'].forEach(id => { const el = $(id); if (el) el.disabled = !v; });
}

function detectCat(hex) {
  if (!hex) return 'General';
  const r = parseInt(hex.slice(1,3), 16) / 255, g = parseInt(hex.slice(3,5), 16) / 255, b = parseInt(hex.slice(5,7), 16) / 255;
  const max = Math.max(r,g,b), min = Math.min(r,g,b), d = max - min, l = (max + min) / 2;
  if (!d || d / (l > 0.5 ? 2 - max - min : max + min) < 0.1) return 'Other';
  let h = 0;
  if (max === r)      h = ((g-b)/d + (g<b?6:0)) / 6;
  else if (max === g) h = ((b-r)/d + 2) / 6;
  else                h = ((r-g)/d + 4) / 6;
  h *= 360;
  if (h < 20 || h >= 330)    return 'Unavailable';
  if (h >= 245 && h < 330)   return 'Available';
  if (h >= 170 && h < 245)   return 'General';
  return 'Other';
}

function measureNameWidth(rows) {
  const probe = document.createElement('span');
  probe.style.cssText = 'position:fixed;visibility:hidden;white-space:nowrap;top:-999px;left:-999px;font-family:"Geist Mono","Geist",monospace;';
  document.body.appendChild(probe);
  let maxW = 0;
  rows.forEach(row => {
    const lines = (row.values[0] || '').split('\n').filter(l => l.trim());
    (lines.length ? lines : ['—']).forEach((line, li) => {
      const st = NAME_STYLES[Math.min(li, NAME_STYLES.length - 1)];
      probe.style.fontSize = st.size; probe.style.fontWeight = st.weight;
      probe.textContent = line;
      maxW = Math.max(maxW, probe.getBoundingClientRect().width);
    });
  });
  document.body.removeChild(probe);
  return Math.min(Math.max(Math.ceil(maxW) + 24, 90), 280);
}

// ── Bootstrap ─────────────────────────────────────────────────────────────
window.addEventListener('DOMContentLoaded', async () => {
  $('main-view').style.cssText = 'display:flex;flex-direction:column;flex:1;overflow:hidden;';
  updateHideBtn();

  const hasCached = loadCache();
  if (hasCached) render();
  else showLoader('Connecting…');

  let loggedIn = false;
  try { loggedIn = (await apiFetch('/api/me')).loggedIn; } catch {}

  S.loggedIn = loggedIn;
  hideLoader();

  if (loggedIn) {
    $('btn-auth').style.display = 'none';
    $('btn-out').style.display  = 'inline-flex';
    $('conn-dot').className = 'dot ok';
    $('landing').style.display  = 'none';
    setWriteEnabled(true);
    if (!hasCached) await fetchData();
  } else {
    setWriteEnabled(false);
    $('btn-auth').style.display = 'inline-flex';
    $('conn-dot').className = 'dot err';
    if (hasCached) {
      $('landing').style.display = 'none';
    } else {
      $('main-view').style.display = 'none';
      $('landing').style.display   = 'flex';
    }
    const p = new URLSearchParams(location.search);
    if (p.has('auth_error')) {
      toast('Sign in failed. Try again.', 'err');
      history.replaceState(null, '', '/');
    }
  }
});

// ── API ───────────────────────────────────────────────────────────────────
async function apiFetch(url, opts = {}) {
  const res = await fetch(url, {
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json', ...(opts.headers || {}) },
    ...opts,
  });
  if (!res.ok) { const e = await res.json().catch(() => ({ error: res.statusText })); throw new Error(e.error || res.statusText); }
  return res.json();
}

async function fetchData() {
  if (!S.loggedIn) {
    localStorage.removeItem(K.DATA);
    S.headers = []; S.rows = []; S.sheetName = ''; S.sheetTitle = '';
    $('sheet-label').textContent = '';
    $('main-view').style.display = 'none';
    $('landing').style.display   = 'flex';
    return;
  }
  showLoader('Loading…');
  try {
    const data = await apiFetch('/api/data');
    S.headers  = data.headers; S.sheetName = data.sheetName; S.sheetTitle = data.title;
    S.rows     = data.rows.map(r => ({ ...r, cat: detectCat(r.hex) }));
    $('sheet-label').textContent = `${data.title} / ${data.sheetName}`;
    saveCache(); render();
    toast(`${S.rows.length} rows`, 'ok');
  } catch(e) {
    toast('Error: ' + e.message, 'err');
    if (e.message === 'Unauthorized') {
      S.loggedIn = false; setWriteEnabled(false);
      $('btn-auth').style.display = 'inline-flex';
      $('btn-out').style.display  = 'none';
      $('conn-dot').className = 'dot err';
    }
  } finally { hideLoader(); }
}

// ── Search ────────────────────────────────────────────────────────────────
let _st;
function debouncedSearch() {
  clearTimeout(_st); _st = setTimeout(() => {
    const q = $('search').value;
    $('search-clear').classList.toggle('visible', q.length > 0);
    if (q) {
      const ql = q.toLowerCase();
      CAT_ORDER.forEach(key => {
        if (S.rows.some(r => r.cat === key && r.values.some(v => v.toLowerCase().includes(ql)))) {
          if (!S.openGroups.has(key)) { S.openGroups.add(key); S.autoExpanded.add(key); }
        }
      });
    } else {
      S.autoExpanded.forEach(key => S.openGroups.delete(key));
      S.autoExpanded.clear();
    }
    render();
  }, 150);
}
function clearSearch() {
  $('search').value = ''; $('search-clear').classList.remove('visible');
  S.autoExpanded.forEach(key => S.openGroups.delete(key));
  S.autoExpanded.clear();
  render();
}

// ── Render ────────────────────────────────────────────────────────────────
function render() {
  const q    = $('search').value.toLowerCase();
  const rows = q ? S.rows.filter(r => r.values.some(v => v.toLowerCase().includes(q))) : S.rows;
  $('row-count').textContent = rows.length ? `${rows.length}/${S.rows.length}` : '';
  $('empty-state').style.display = rows.length ? 'none' : 'flex';

  const container = $('groups-container');
  container.innerHTML = '';

  // ── Pinned section ───────────────────────────────────────────────────────
  const pinnedRows = S.rows
    .filter(r => r.pinOrder != null)
    .sort((a, b) => a.pinOrder - b.pinOrder);

  if (pinnedRows.length) {
    const isPinnedOpen = S.openGroups.has('__pinned__');
    const nameW = measureNameWidth(pinnedRows);
    const group = mk('div', 'group pinned-group' + (isPinnedOpen ? ' open' : ''));
    group.dataset.key = '__pinned__';

    const hdr = mk('div', 'group-header');
    hdr.innerHTML = `
      <span class="g-swatch"></span>
      <span class="g-name">Pinned</span>
      <span class="g-count">${pinnedRows.length}</span>
      <span class="g-chev">›</span>`;
    hdr.addEventListener('click', () => {
      const o = group.classList.toggle('open');
      o ? S.openGroups.add('__pinned__') : S.openGroups.delete('__pinned__');
      persistGroups();
    });

    const body = mk('div', 'group-body');
    const list = mk('div', 'cards-list');

    // Column header for pinned group
    if (S.headers.length > 1) {
      const colHdr = mk('div', 'col-header');
      const hGrip  = mk('div', 'col-hdr-grip');
      const hN     = mk('div', 'col-hdr-name'); hN.style.width = nameW + 'px';
      const hD     = mk('div', 'col-hdr-data');
      S.headers.forEach((_, ci) => {
        if (ci === 0) return;
        const c = mk('div', 'col-hdr-cell'); c.textContent = S.headers[ci]; hD.appendChild(c);
      });
      colHdr.append(hGrip, hN, hD, mk('div', 'col-hdr-acts'));
      list.appendChild(colHdr);
    }

    pinnedRows.forEach((row, i) => {
      list.appendChild(buildRowCard(row, i, nameW, true));
    });

    body.appendChild(list); group.append(hdr, body); container.appendChild(group);
  }

  // ── Category groups ──────────────────────────────────────────────────────
  const grouped = Object.fromEntries(CAT_ORDER.map(k => [k, []]));
  rows.forEach(r => (grouped[r.cat] || grouped.Other).push(r));

  CAT_ORDER.forEach(key => {
    const catRows = [...grouped[key]].sort((a, b) =>
      (a.values[0] || '').localeCompare(b.values[0] || '', undefined, { sensitivity: 'base' })
    );
    if (!catRows.length) return;

    const def = CAT[key], isOpen = S.openGroups.has(key);
    const nameW = measureNameWidth(catRows);

    const group = mk('div', 'group' + (isOpen ? ' open' : ''));
    group.dataset.key = key;

    const hdr = mk('div', 'group-header');
    hdr.innerHTML = `
      <span class="g-swatch" style="background:${def.color}"></span>
      <span class="g-name">${def.label}</span>
      <span class="g-count">${catRows.length}</span>
      <span class="g-chev">›</span>`;
    hdr.addEventListener('click', () => {
      const o = group.classList.toggle('open');
      o ? S.openGroups.add(key) : S.openGroups.delete(key);
      persistGroups();
    });

    const body = mk('div', 'group-body');
    const list = mk('div', 'cards-list');

    if (S.headers.length > 1) {
      const colHdr = mk('div', 'col-header');
      const hN = mk('div', 'col-hdr-name'); hN.style.width = nameW + 'px';
      const hD = mk('div', 'col-hdr-data');
      S.headers.forEach((_, ci) => {
        if (ci === 0) return;
        const c = mk('div', 'col-hdr-cell'); c.textContent = S.headers[ci]; hD.appendChild(c);
      });
      colHdr.append(hN, hD, mk('div', 'col-hdr-acts'));
      list.appendChild(colHdr);
    }

    catRows.forEach((row, i) => {
      list.appendChild(buildRowCard(row, i, nameW, false));
    });

    body.appendChild(list); group.append(hdr, body); container.appendChild(group);
  });
}

// ── Build a single row card ───────────────────────────────────────────────
function buildRowCard(row, index, nameW, isPinnedSection) {
  const card = mk('div', 'row-card');
  card.style.animationDelay = `${index * 14}ms`;

  // Drag grip — only in pinned section
  if (isPinnedSection) {
    const grip = mk('div', 'drag-grip');
    grip.title = 'Drag to reorder';
    grip.innerHTML = GRIP_SVG;
    // HTML5 drag on the card; grip is the visual handle
    card.setAttribute('draggable', 'true');
    card.addEventListener('dragstart', e => {
      _dragSrc = row;
      card.classList.add('dragging');
      e.dataTransfer.effectAllowed = 'move';
    });
    card.addEventListener('dragend', () => {
      card.classList.remove('dragging');
      document.querySelectorAll('.row-card.drag-over').forEach(c => c.classList.remove('drag-over'));
    });
    card.addEventListener('dragover', e => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      card.classList.add('drag-over');
    });
    card.addEventListener('dragleave', e => {
      if (!card.contains(e.relatedTarget)) card.classList.remove('drag-over');
    });
    card.addEventListener('drop', async e => {
      e.preventDefault();
      card.classList.remove('drag-over');
      if (!_dragSrc || _dragSrc === row) { _dragSrc = null; return; }

      // Reorder pinned array
      const pinned = S.rows.filter(r => r.pinOrder != null).sort((a, b) => a.pinOrder - b.pinOrder);
      const srcIdx = pinned.findIndex(r => r === _dragSrc);
      const dstIdx = pinned.findIndex(r => r === row);
      if (srcIdx === -1 || dstIdx === -1) { _dragSrc = null; return; }

      pinned.splice(srcIdx, 1);
      pinned.splice(dstIdx, 0, _dragSrc);

      // Apply new order to S.rows in place
      pinned.forEach((r, i) => {
        const idx = S.rows.indexOf(r);
        if (idx >= 0) S.rows[idx] = { ...r, pinOrder: i + 1 };
      });

      _dragSrc = null;
      saveCache();
      render();
      await savePinOrdersBatch(pinned);
    });
    card.append(grip);
  }

  // Name cell
  const nameCell = mk('div', 'name-cell');
  nameCell.style.width = nameW + 'px';

  // Small amber dot if row is pinned and we're NOT in pinned section (category view indicator)
  if (!isPinnedSection && row.pinOrder != null) {
    const dot = document.createElement('span');
    dot.className = 'pin-dot';
    dot.title = `Pinned (position ${row.pinOrder})`;
    nameCell.appendChild(dot);
  }

  const lines = (row.values[0] || '—').split('\n').filter(l => l.trim());
  (lines.length ? lines : ['—']).forEach((line, li) => {
    const st = NAME_STYLES[Math.min(li, NAME_STYLES.length - 1)];
    const el = document.createElement('span');
    el.className = 'name-line'; el.dir = 'rtl'; el.textContent = line;
    el.style.cssText = `font-size:${st.size};font-weight:${st.weight};color:${st.color}`;
    nameCell.appendChild(el);
  });

  // Data cells
  const dataCells = mk('div', 'data-cells');
  S.headers.forEach((_, ci) => {
    if (ci === 0) return;
    const val  = row.values[ci] || '';
    const cell = mk('div', 'data-cell');
    if (S.hideContent && val) {
      const copyBtn = mk('button', 'btn ghost icon dc-copy');
      copyBtn.innerHTML = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>`;
      copyBtn.title = 'Copy';
      copyBtn.addEventListener('click', () => copyVal(copyBtn, val, row.values[0], S.headers[ci]));
      cell.appendChild(copyBtn);
    } else {
      const valEl = mk('div', 'dc-val' + (val ? '' : ' empty'));
      valEl.dir = 'rtl'; valEl.textContent = val || '—';
      if (val) valEl.addEventListener('click', () => copyVal(valEl, val, row.values[0], S.headers[ci]));
      cell.appendChild(valEl);
    }
    dataCells.appendChild(cell);
  });

  // Actions
  const acts = mk('div', 'row-acts');
  if (S.writeEnabled) {
    const isPinned = row.pinOrder != null;

    // Pin / unpin toggle
    const pinBtn = mk('button', 'btn ghost icon' + (isPinned ? ' btn-pin-active' : ''));
    pinBtn.innerHTML = PIN_SVG;
    pinBtn.title = isPinned ? 'Unpin row' : 'Pin row';
    pinBtn.addEventListener('click', () => isPinned ? unpinRow(row) : pinRow(row));

    const editBtn = mkBtn('ghost icon', '', 'Edit', () => openEdit(row));
    editBtn.innerHTML = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>`;

    const delBtn = mkBtn('danger icon', '', 'Delete', () => openDel(row));
    delBtn.innerHTML = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>`;

    acts.append(pinBtn, editBtn, delBtn);
  }

  card.append(nameCell, dataCells, acts);
  return card;
}

function copyVal(el, val, fieldName, col) {
  navigator.clipboard.writeText(val).then(() => {
    el.classList.add('copied'); setTimeout(() => el.classList.remove('copied'), 700);
    toast(`${fieldName} — ${col}`, 'copy');
  }).catch(() => toast('Copy failed', 'err'));
}

// ── Pin management ────────────────────────────────────────────────────────
async function pinRow(row) {
  if (!S.writeEnabled) return;
  const maxOrder = S.rows.reduce((m, r) => (r.pinOrder != null ? Math.max(m, r.pinOrder) : m), 0);
  const newOrder = maxOrder + 1;
  try {
    await apiFetch('/api/rows', {
      method: 'PATCH',
      body: JSON.stringify({ sheetName: S.sheetName, sheetRow: row.sheetRow, pinOnly: true, pinOrder: newOrder }),
    });
    const idx = S.rows.indexOf(row);
    if (idx >= 0) S.rows[idx] = { ...row, pinOrder: newOrder };
    // Auto-open pinned section
    S.openGroups.add('__pinned__');
    persistGroups();
    saveCache();
    render();
    toast('Row pinned', 'pin');
  } catch(e) { toast('Pin failed: ' + e.message, 'err'); }
}

async function unpinRow(row) {
  if (!S.writeEnabled) return;
  try {
    await apiFetch('/api/rows', {
      method: 'PATCH',
      body: JSON.stringify({ sheetName: S.sheetName, sheetRow: row.sheetRow, pinOnly: true, pinOrder: null }),
    });
    const idx = S.rows.indexOf(row);
    if (idx >= 0) S.rows[idx] = { ...row, pinOrder: null };

    // Compact remaining pin orders
    const remaining = S.rows.filter(r => r.pinOrder != null).sort((a, b) => a.pinOrder - b.pinOrder);
    remaining.forEach((r, i) => {
      const ri = S.rows.indexOf(r);
      if (ri >= 0) S.rows[ri] = { ...r, pinOrder: i + 1 };
    });

    saveCache();
    render();
    toast('Row unpinned', 'info');

    // Persist compacted orders to sheet if any remain
    if (remaining.length) await savePinOrdersBatch(remaining);
  } catch(e) { toast('Unpin failed: ' + e.message, 'err'); }
}

async function savePinOrdersBatch(orderedRows) {
  if (!orderedRows.length) return;
  try {
    const pinUpdates = orderedRows.map((r, i) => ({ sheetRow: r.sheetRow, pinOrder: i + 1 }));
    await apiFetch('/api/rows', {
      method: 'PUT',
      body: JSON.stringify({ sheetName: S.sheetName, pinUpdates }),
    });
    toast('Order saved', 'pin');
  } catch(e) { toast('Save order failed: ' + e.message, 'err'); }
}

// ── Modal helpers ─────────────────────────────────────────────────────────
function buildPicker(selected) {
  S.editCat = selected;
  return `<div class="field"><label>Category</label><div class="cat-picker" id="cat-picker">${
    CAT_ORDER.map(k => {
      const on = k === selected;
      return `<button type="button" class="cat-btn${on ? ' sel' : ''}" data-cat="${k}" style="${on ? `border-color:${CAT[k].color};color:${CAT[k].color}` : ''}">${CAT[k].label}</button>`;
    }).join('')
  }</div></div>`;
}
function attachPicker() {
  document.querySelectorAll('#cat-picker .cat-btn').forEach(b => b.addEventListener('click', () => {
    S.editCat = b.dataset.cat;
    document.querySelectorAll('#cat-picker .cat-btn').forEach(x => {
      const on = x.dataset.cat === S.editCat;
      x.className = 'cat-btn' + (on ? ' sel' : '');
      x.style.borderColor = on ? CAT[x.dataset.cat].color : '';
      x.style.color       = on ? CAT[x.dataset.cat].color : '';
    });
  }));
}

function openAdd() {
  if (!S.writeEnabled) return;
  S.editRow = null; S.editCat = 'General';
  $('modal-title').textContent = 'Add row';
  $('modal-fields').innerHTML = buildPicker('General') + S.headers.map((h, i) =>
    `<div class="field"><label>${xe(h)}</label><textarea id="f${i}" dir="rtl" rows="2" placeholder="—" autocomplete="new-password" spellcheck="false"></textarea></div>`
  ).join('');
  attachPicker();
  open_('edit-overlay');
  setTimeout(() => { S.headers.forEach((_, i) => { const el = $('f' + i); if (el) el.value = ''; }); $('f0')?.focus(); }, 60);
}

function openEdit(row) {
  if (!S.writeEnabled) return;
  S.editRow = row; S.editCat = row.cat;
  $('modal-title').textContent = 'Edit row';
  $('modal-fields').innerHTML = buildPicker(row.cat) + S.headers.map((h, i) =>
    `<div class="field"><label>${xe(h)}</label><textarea id="f${i}" dir="rtl" rows="2" placeholder="—" autocomplete="new-password" spellcheck="false">${xe(row.values[i] || '')}</textarea></div>`
  ).join('');
  attachPicker();
  open_('edit-overlay');
  setTimeout(() => $('f0')?.focus(), 60);
}

async function saveRow() {
  const vals = S.headers.map((_, i) => $('f' + i)?.value || '');
  const cat  = S.editCat, rgb = CAT[cat].rgb;
  const hex  = '#' + rgb.map(v => v.toString(16).padStart(2, '0')).join('');
  close_('edit-overlay');
  try {
    if (!S.editRow) {
      const { sheetRow } = await apiFetch('/api/rows', { method: 'POST', body: JSON.stringify({ sheetName: S.sheetName, values: vals, rgb }) });
      S.rows.push({ values: vals, hex, cat, sheetRow, pinOrder: null });
      toast('Row added', 'ok');
    } else {
      await apiFetch('/api/rows', { method: 'PATCH', body: JSON.stringify({ sheetName: S.sheetName, sheetRow: S.editRow.sheetRow, values: vals, rgb, catChanged: cat !== S.editRow.cat }) });
      const idx = S.rows.indexOf(S.editRow);
      if (idx >= 0) S.rows[idx] = { ...S.editRow, values: vals, hex, cat };
      toast('Row updated', 'ok');
    }
    saveCache(); render();
  } catch(e) { toast('Save failed: ' + e.message, 'err'); }
}

function openDel(row) { if (!S.writeEnabled) return; S.delRow = row; open_('del-overlay'); }

async function confirmDelete() {
  const row = S.delRow; close_('del-overlay');
  try {
    await apiFetch('/api/rows', { method: 'DELETE', body: JSON.stringify({ sheetRow: row.sheetRow }) });
    S.rows.splice(S.rows.indexOf(row), 1);
    S.rows.forEach(r => { if (r.sheetRow > row.sheetRow) r.sheetRow--; });
    saveCache(); render();
    toast('Row deleted', 'ok');
  } catch(e) { toast('Delete failed: ' + e.message, 'err'); }
}

// ── Legal content ─────────────────────────────────────────────────────────
const LEGAL = {
  privacy: {
    title: 'Privacy Policy',
    body: `<div class="legal-text">
      <h3>Overview</h3>
      <p>Klivvr Scripts is a private internal tool. It is not a public service and is not intended for general use.</p>
      <h3>Data Collected</h3>
      <p>This app accesses your Google account solely to read and write data in a specific Google Sheets spreadsheet. No personal data is collected, stored, or shared with third parties.</p>
      <h3>Authentication</h3>
      <p>Sign-in is handled via Google OAuth 2.0. Your Google credentials are never seen or stored by this application. A secure session cookie is used to keep you signed in.</p>
      <h3>Google Sheets Access</h3>
      <p>The app requests permission to access Google Sheets on your behalf. This access is limited to the designated spreadsheet and is used only to display, add, edit, and delete rows as directed by you.</p>
      <h3>Cookies</h3>
      <p>A single encrypted session cookie is stored in your browser to maintain your login state. It contains no personal information and expires after one year or on sign-out.</p>
      <h3>Contact</h3>
      <p>For any questions, contact the app administrator directly.</p>
    </div>`,
  },
  terms: {
    title: 'Terms of Service',
    body: `<div class="legal-text">
      <h3>Access</h3>
      <p>Access to this application is restricted to authorized users only. Unauthorized access is prohibited.</p>
      <h3>Use</h3>
      <p>This tool is provided for internal use only. You agree to use it solely for its intended purpose of managing script data in the connected spreadsheet.</p>
      <h3>Data Responsibility</h3>
      <p>You are responsible for the accuracy of data you add, edit, or delete. Deleted rows are permanently removed from the spreadsheet and cannot be recovered through this app.</p>
      <h3>No Warranty</h3>
      <p>This application is provided as-is with no guarantees of uptime, data integrity, or fitness for any particular purpose.</p>
      <h3>Changes</h3>
      <p>These terms may be updated at any time. Continued use of the application constitutes acceptance of any changes.</p>
    </div>`,
  },
};

function showLegal(type) {
  const content = LEGAL[type];
  if (!content) return;
  $('legal-title').textContent = content.title;
  $('legal-body').innerHTML    = content.body;
  open_('legal-overlay');
}

// ── Keyboard shortcuts ────────────────────────────────────────────────────
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') { close_('edit-overlay'); close_('del-overlay'); close_('legal-overlay'); }
  if ((e.metaKey || e.ctrlKey) && e.key === 'k') { e.preventDefault(); $('search')?.focus(); }
  if ((e.metaKey || e.ctrlKey) && e.key === 'n') { e.preventDefault(); openAdd(); }
});
document.querySelectorAll('.overlay').forEach(ov => ov.addEventListener('click', e => {
  if (e.target === ov) ov.classList.remove('open');
}));
