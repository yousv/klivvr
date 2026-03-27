/**
 * Main application logic for Klivvr Scripts
 * A private internal tool for managing script entries in Google Sheets
 */

import type { AppState, Row, PinOrderMetadata } from './types';
import { CAT, CAT_ORDER, NAME_STYLES, detectCat, measureNameWidth, rgbToHex, getCategoryRgb } from './categories';
import {
  $, mk, open_, close_, showLoader, hideLoader, xe, mkBtn, toast, getElement
} from './dom';
import {
  K, saveCache, loadCache, savePinnedOrder, loadPinnedOrder, 
  saveExpandedGroups, loadExpandedGroups, saveHidePreference, loadHidePreference, clearCache
} from './storage';
import {
  apiFetch, fetchSession, fetchData, addRow, updateRow, deleteRow, savePinnedOrder as apiSavePinnedOrder, loadPinnedOrderFromServer
} from './api';

// Application state
const S: AppState = {
  headers: [],
  rows: [],
  sheetName: '',
  sheetTitle: '',
  editRow: null,
  delRow: null,
  editCat: 'General',
  loggedIn: false,
  writeEnabled: false,
  hideContent: loadHidePreference(),
  openGroups: loadExpandedGroups(),
  autoExpanded: new Set(),
  pinnedRows: [],
  pinnedOrder: loadPinnedOrder(),
};

// SVG constants
const EYE_OPEN = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>`;
const EYE_SHUT = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/><line x1="1" y1="1" x2="23" y2="23"/></svg>`;

// Update hide button UI
function updateHideBtn(): void {
  const btn = $('btn-hide') as HTMLButtonElement | null;
  if (!btn) return;
  btn.innerHTML = S.hideContent ? EYE_SHUT : EYE_OPEN;
  btn.style.opacity = S.hideContent ? '1' : '0.5';
  btn.title = S.hideContent ? 'Show row content' : 'Hide row content';
}

// Toggle hide content setting
function toggleHide(): void {
  S.hideContent = !S.hideContent;
  saveHidePreference(S.hideContent);
  updateHideBtn();
  render();
}

// Set write enabled state
function setWriteEnabled(v: boolean): void {
  S.writeEnabled = v;
  ['btn-add'].forEach(id => {
    const el = $(id) as HTMLButtonElement | null;
    if (el) el.disabled = !v;
  });
}

// Initialize pinned rows from state
function initializePinnedRows(): void {
  S.pinnedRows = S.pinnedOrder
    .map(id => S.rows.find(r => r.values[0] === id))
    .filter((r): r is Row => r !== undefined);
}

// Search debounce
let _searchTimeout: NodeJS.Timeout | undefined;

function debouncedSearch(): void {
  clearTimeout(_searchTimeout);
  _searchTimeout = setTimeout(() => {
    const searchInput = $('search') as HTMLInputElement | null;
    const q = searchInput?.value || '';
    const searchClear = $('search-clear');
    if (searchClear) {
      searchClear.classList.toggle('visible', q.length > 0);
    }

    if (q) {
      const ql = q.toLowerCase();
      CAT_ORDER.forEach(key => {
        if (S.rows.some(r => r.cat === key && r.values.some(v => v.toLowerCase().includes(ql)))) {
          if (!S.openGroups.has(key)) {
            S.openGroups.add(key);
            S.autoExpanded.add(key);
          }
        }
      });
    } else {
      S.autoExpanded.forEach(key => S.openGroups.delete(key));
      S.autoExpanded.clear();
    }
    saveExpandedGroups(S.openGroups);
    render();
  }, 150);
}

function clearSearch(): void {
  const searchInput = $('search') as HTMLInputElement | null;
  if (searchInput) searchInput.value = '';
  const searchClear = $('search-clear');
  if (searchClear) searchClear.classList.remove('visible');
  S.autoExpanded.forEach(key => S.openGroups.delete(key));
  S.autoExpanded.clear();
  saveExpandedGroups(S.openGroups);
  render();
}

// Main render function
function render(): void {
  const searchInput = $('search') as HTMLInputElement | null;
  const q = (searchInput?.value || '').toLowerCase();
  const rows = q ? S.rows.filter(r => r.values.some(v => v.toLowerCase().includes(q))) : S.rows;

  const rowCount = $('row-count');
  if (rowCount) {
    rowCount.textContent = rows.length ? `${rows.length}/${S.rows.length}` : '';
  }

  const emptyState = $('empty-state');
  if (emptyState) {
    emptyState.style.display = rows.length ? 'none' : 'flex';
  }

  // Separate pinned and regular rows
  initializePinnedRows();
  const pinnedIds = new Set(S.pinnedOrder);
  const regularRows = rows.filter(r => !pinnedIds.has(r.values[0]));
  const visiblePinned = S.pinnedRows.filter(r => rows.includes(r));

  // Group rows by category
  const grouped: Record<string, Row[]> = Object.fromEntries(CAT_ORDER.map(k => [k, []]));
  regularRows.forEach(r => (grouped[r.cat] || grouped.Other).push(r));

  const container = getElement('groups-container');
  container.innerHTML = '';

  // Render pinned section if there are pinned rows
  if (visiblePinned.length > 0) {
    renderPinnedSection(container, visiblePinned);
  }

  // Render category groups
  CAT_ORDER.forEach(key => {
    const catRows = [...grouped[key]].sort((a, b) =>
      (a.values[0] || '').localeCompare(b.values[0] || '', undefined, { sensitivity: 'base' })
    );
    if (!catRows.length) return;

    const def = CAT[key];
    const isOpen = S.openGroups.has(key);
    const nameW = measureNameWidth(catRows);

    const group = mk('div', `group${isOpen ? ' open' : ''}`);
    (group as HTMLElement).dataset.key = key;

    const hdr = mk('div', 'group-header');
    hdr.innerHTML = `<span class="g-swatch" style="background:${def.color}"></span><span class="g-name">${def.label}</span><span class="g-count">${catRows.length}</span><span class="g-chev">›</span>`;
    hdr.addEventListener('click', () => {
      const o = group.classList.toggle('open');
      o ? S.openGroups.add(key) : S.openGroups.delete(key);
      saveExpandedGroups(S.openGroups);
    });

    const body = mk('div', 'group-body');
    const list = mk('div', 'cards-list');

    if (S.headers.length > 1) {
      const colHdr = mk('div', 'col-header');
      const hN = mk('div', 'col-hdr-name');
      hN.style.width = nameW + 'px';
      const hD = mk('div', 'col-hdr-data');
      S.headers.forEach((_, ci) => {
        if (ci === 0) return;
        const c = mk('div', 'col-hdr-cell');
        c.textContent = S.headers[ci];
        hD.appendChild(c);
      });
      colHdr.append(hN, hD, mk('div', 'col-hdr-acts'));
      list.appendChild(colHdr);
    }

    catRows.forEach((row, i) => {
      const card = renderRowCard(row, i, nameW);
      list.appendChild(card);
    });

    body.appendChild(list);
    group.append(hdr, body);
    container.appendChild(group);
  });
}

// Render pinned rows section
function renderPinnedSection(container: HTMLElement, pinnedRows: Row[]): void {
  const section = mk('div', 'pinned-section');
  
  const header = mk('div', 'pinned-header');
  header.innerHTML = `<span class="pin-icon">📌</span><span class="pin-title">Pinned Rows</span><span class="pin-count">${pinnedRows.length}</span>`;
  
  const list = mk('div', 'pinned-list');
  const nameW = measureNameWidth(pinnedRows);

  if (S.headers.length > 1) {
    const colHdr = mk('div', 'col-header');
    const hN = mk('div', 'col-hdr-name');
    hN.style.width = nameW + 'px';
    const hD = mk('div', 'col-hdr-data');
    S.headers.forEach((_, ci) => {
      if (ci === 0) return;
      const c = mk('div', 'col-hdr-cell');
      c.textContent = S.headers[ci];
      hD.appendChild(c);
    });
    colHdr.append(hN, hD, mk('div', 'col-hdr-acts'));
    list.appendChild(colHdr);
  }

  pinnedRows.forEach((row, i) => {
    const card = renderRowCard(row, i, nameW, true);
    (card as HTMLElement).draggable = true;
    (card as HTMLElement).classList.add('pinned-card');
    (card as HTMLElement).dataset.rowName = row.values[0];
    (card as HTMLElement).addEventListener('dragstart', e => handlePinnedDragStart(e, row));
    (card as HTMLElement).addEventListener('dragend', e => handlePinnedDragEnd(e));
    list.appendChild(card);
  });

  list.addEventListener('dragover', e => handlePinnedDragOver(e));
  list.addEventListener('drop', e => handlePinnedDrop(e));

  section.append(header, list);
  container.appendChild(section);
}

// Render individual row card
function renderRowCard(row: Row, index: number, nameW: number, isPinned: boolean = false): HTMLElement {
  const card = mk('div', 'row-card');
  (card as any).style.animationDelay = `${index * 16}ms`;

  const nameCell = mk('div', 'name-cell');
  nameCell.style.width = nameW + 'px';
  const lines = (row.values[0] || '—').split('\n').filter(l => l.trim());
  (lines.length ? lines : ['—']).forEach((line, li) => {
    const st = NAME_STYLES[Math.min(li, NAME_STYLES.length - 1)];
    const el = document.createElement('span');
    el.className = 'name-line';
    el.dir = 'rtl';
    el.textContent = line;
    el.style.cssText = `font-size:${st.size};font-weight:${st.weight};color:${st.color}`;
    nameCell.appendChild(el);
  });

  const dataCells = mk('div', 'data-cells');
  S.headers.forEach((_, ci) => {
    if (ci === 0) return;
    const val = row.values[ci] || '';
    const cell = mk('div', 'data-cell');
    if (S.hideContent && val) {
      const copyBtn = mkBtn('ghost icon dc-copy', '', 'Copy', function() {
        copyVal(this, val, row.values[0], S.headers[ci]);
      });
      copyBtn.innerHTML = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>`;
      cell.appendChild(copyBtn);
    } else {
      const valEl = mk('div', `dc-val${val ? '' : ' empty'}`);
      valEl.dir = 'rtl';
      valEl.textContent = val || '—';
      if (val) {
        valEl.addEventListener('click', () => copyVal(valEl, val, row.values[0], S.headers[ci]));
      }
      cell.appendChild(valEl);
    }
    dataCells.appendChild(cell);
  });

  const acts = mk('div', 'row-acts');
  if (S.writeEnabled) {
    const pinBtn = mkBtn('ghost icon', '', isPinned ? 'Unpin' : 'Pin', () => togglePin(row));
    pinBtn.innerHTML = isPinned
      ? `<svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-5 9h-2v2h2v-2zm0-6h-2v2h2V6z"/></svg>`
      : `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="13" cy="13" r="1"/><path d="M5 12a8 8 0 0 1 14.32-4.3m2.38 10.3A8 8 0 0 1 5.38 5.7M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0"/></svg>`;

    const editBtn = mkBtn('ghost icon', '', 'Edit', () => openEdit(row));
    editBtn.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>`;

    const delBtn = mkBtn('danger icon', '', 'Delete', () => openDel(row));
    delBtn.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>`;

    acts.append(pinBtn, editBtn, delBtn);
  }

  card.append(nameCell, dataCells, acts);
  return card;
}

// Pin/unpin toggle
function togglePin(row: Row): void {
  const isPinned = S.pinnedOrder.includes(row.values[0]);
  
  if (isPinned) {
    S.pinnedOrder = S.pinnedOrder.filter(id => id !== row.values[0]);
  } else {
    S.pinnedOrder.unshift(row.values[0]);
  }
  
  savePinnedOrder(S.pinnedOrder);
  persistPinnedOrder();
  render();
}

// Drag and drop handlers for pinned rows
let draggedRow: Row | null = null;

function handlePinnedDragStart(e: DragEvent, row: Row): void {
  draggedRow = row;
  const target = e.target as HTMLElement;
  target.classList.add('dragging');
  if (e.dataTransfer) {
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', row.values[0]);
  }
}

function handlePinnedDragEnd(e: DragEvent): void {
  const target = e.target as HTMLElement;
  target.classList.remove('dragging');
  const pinnedList = document.querySelector('.pinned-list');
  if (pinnedList) {
    pinnedList.classList.remove('drag-over');
  }
  draggedRow = null;
}

function handlePinnedDragOver(e: DragEvent): void {
  e.preventDefault();
  if (e.dataTransfer) {
    e.dataTransfer.dropEffect = 'move';
  }
  const pinnedList = (e.currentTarget as HTMLElement);
  pinnedList?.classList.add('drag-over');
}

function handlePinnedDrop(e: DragEvent): void {
  e.preventDefault();
  const pinnedList = (e.currentTarget as HTMLElement);
  pinnedList?.classList.remove('drag-over');
  
  if (!draggedRow) return;

  const target = (e.target as HTMLElement).closest('.pinned-card') as HTMLElement | null;
  if (!target) return;

  const draggedEl = Array.from(pinnedList?.querySelectorAll('.pinned-card') || []).find(
    el => {
      const rowName = (el as any).dataset.rowName || el.querySelector('.name-line')?.textContent;
      return rowName === draggedRow?.values[0];
    }
  ) as HTMLElement | null;

  if (!draggedEl || !target || draggedEl === target) return;

  const draggedIndex = Array.from(pinnedList?.querySelectorAll('.pinned-card') || []).indexOf(draggedEl);
  const targetIndex = Array.from(pinnedList?.querySelectorAll('.pinned-card') || []).indexOf(target);

  if (draggedIndex === targetIndex) return;

  const [removed] = S.pinnedOrder.splice(draggedIndex, 1);
  S.pinnedOrder.splice(targetIndex, 0, removed);

  savePinnedOrder(S.pinnedOrder);
  persistPinnedOrder();
}

// Copy value utility
function copyVal(el: HTMLElement, val: string, fieldName: string, col: string): void {
  navigator.clipboard.writeText(val).then(() => {
    el.classList.add('copied');
    setTimeout(() => el.classList.remove('copied'), 700);
    toast(`${fieldName} — ${col}`, 'copy');
  }).catch(() => toast('Copy failed', 'err'));
}

// Build category picker
function buildPicker(selected: string): string {
  S.editCat = selected;
  return `<div class="field"><label>Category</label><div class="cat-picker" id="cat-picker">${
    CAT_ORDER.map(k => {
      const on = k === selected;
      return `<button type="button" class="cat-btn${on ? ' sel' : ''}" data-cat="${k}" style="${on ? `border-color:${CAT[k].color};color:${CAT[k].color}` : ''}">${CAT[k].label}</button>`;
    }).join('')
  }</div></div>`;
}

function attachPicker(): void {
  document.querySelectorAll('#cat-picker .cat-btn').forEach(b => {
    b.addEventListener('click', () => {
      S.editCat = (b as HTMLButtonElement).dataset.cat || 'General';
      document.querySelectorAll('#cat-picker .cat-btn').forEach(x => {
        const on = (x as HTMLButtonElement).dataset.cat === S.editCat;
        x.className = `cat-btn${on ? ' sel' : ''}`;
        (x as HTMLButtonElement).style.borderColor = on ? CAT[S.editCat].color : '';
        (x as HTMLButtonElement).style.color = on ? CAT[S.editCat].color : '';
      });
    });
  });
}

// Modal operations
function openAdd(): void {
  if (!S.writeEnabled) return;
  S.editRow = null;
  S.editCat = 'General';
  const modalTitle = getElement('modal-title');
  modalTitle.textContent = 'Add row';
  const modalFields = getElement('modal-fields');
  modalFields.innerHTML = buildPicker('General') + S.headers.map((h, i) =>
    `<div class="field"><label>${xe(h)}</label><textarea id="f${i}" dir="rtl" rows="2" placeholder="—" autocomplete="new-password" spellcheck="false"></textarea></div>`
  ).join('');
  attachPicker();
  open_('edit-overlay');
  setTimeout(() => {
    S.headers.forEach((_, i) => {
      const el = $(f${i}`) as HTMLTextAreaElement | null;
      if (el) el.value = '';
    });
    const f0 = $('f0') as HTMLTextAreaElement | null;
    f0?.focus();
  }, 60);
}

function openEdit(row: Row): void {
  if (!S.writeEnabled) return;
  S.editRow = row;
  S.editCat = row.cat;
  const modalTitle = getElement('modal-title');
  modalTitle.textContent = 'Edit row';
  const modalFields = getElement('modal-fields');
  modalFields.innerHTML = buildPicker(row.cat) + S.headers.map((h, i) =>
    `<div class="field"><label>${xe(h)}</label><textarea id="f${i}" dir="rtl" rows="2" placeholder="—" autocomplete="new-password" spellcheck="false">${xe(row.values[i] || '')}</textarea></div>`
  ).join('');
  attachPicker();
  open_('edit-overlay');
  setTimeout(() => {
    const f0 = $('f0') as HTMLTextAreaElement | null;
    f0?.focus();
  }, 60);
}

async function saveRow(): Promise<void> {
  const vals = S.headers.map((_, i) => {
    const el = $(`f${i}`) as HTMLTextAreaElement | null;
    return el?.value || '';
  });
  const cat = S.editCat;
  const rgb = getCategoryRgb(cat);
  const hex = rgbToHex(rgb);
  
  close_('edit-overlay');

  try {
    if (!S.editRow) {
      const result = await addRow(S.sheetName, vals, rgb);
      S.rows.push({ values: vals, hex, cat, sheetRow: result.sheetRow });
      toast('Row added', 'ok');
    } else {
      const catChanged = cat !== S.editRow.cat;
      await updateRow(S.sheetName, S.editRow.sheetRow, vals, rgb, catChanged);
      const idx = S.rows.indexOf(S.editRow);
      if (idx >= 0) S.rows[idx] = { ...S.editRow, values: vals, hex, cat };
      toast('Row updated', 'ok');
    }
    saveCache({ headers: S.headers, rows: S.rows, sheetName: S.sheetName, sheetTitle: S.sheetTitle });
    render();
  } catch (e) {
    toast(`Save failed: ${(e as Error).message}`, 'err');
  }
}

function openDel(row: Row): void {
  if (!S.writeEnabled) return;
  S.delRow = row;
  open_('del-overlay');
}

async function confirmDelete(): Promise<void> {
  const row = S.delRow;
  close_('del-overlay');

  if (!row) return;

  try {
    await deleteRow(row.sheetRow);
    S.rows.splice(S.rows.indexOf(row), 1);
    S.rows.forEach(r => {
      if (r.sheetRow > row.sheetRow) r.sheetRow--;
    });
    saveCache({ headers: S.headers, rows: S.rows, sheetName: S.sheetName, sheetTitle: S.sheetTitle });
    render();
    toast('Row deleted', 'ok');
  } catch (e) {
    toast(`Delete failed: ${(e as Error).message}`, 'err');
  }
}

// Persist pinned order to backend
async function persistPinnedOrder(): Promise<void> {
  try {
    await apiSavePinnedOrder(S.pinnedOrder, S.sheetName);
    savePinnedOrder(S.pinnedOrder);
  } catch (e) {
    console.error('Failed to persist pinned order:', e);
    toast('Failed to save pinned order', 'err');
  }
}

// Legal content
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

function showLegal(type: 'privacy' | 'terms'): void {
  const content = LEGAL[type];
  if (!content) return;
  const legalTitle = getElement('legal-title');
  legalTitle.textContent = content.title;
  const legalBody = getElement('legal-body');
  legalBody.innerHTML = content.body;
  open_('legal-overlay');
}

// Event listeners initialization
function initializeEventListeners(): void {
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
      close_('edit-overlay');
      close_('del-overlay');
      close_('legal-overlay');
    }
    if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
      e.preventDefault();
      const searchInput = $('search') as HTMLInputElement | null;
      searchInput?.focus();
    }
    if ((e.metaKey || e.ctrlKey) && e.key === 'n') {
      e.preventDefault();
      openAdd();
    }
  });

  document.querySelectorAll('.overlay').forEach(ov => {
    ov.addEventListener('click', e => {
      if (e.target === ov) ov.classList.remove('open');
    });
  });

  const mainView = $('main-view');
  if (mainView) {
    mainView.style.cssText = 'display:flex;flex-direction:column;flex:1;overflow:hidden;';
  }

  (window as any).toggleHide = toggleHide;
  (window as any).debouncedSearch = debouncedSearch;
  (window as any).clearSearch = clearSearch;
  (window as any).fetchDataFn = fetchDataFn;
  (window as any).openAdd = openAdd;
  (window as any).saveRow = saveRow;
  (window as any).confirmDelete = confirmDelete;
  (window as any).showLegal = showLegal;
}

// Fetch data function
async function fetchDataFn(): Promise<void> {
  if (!S.loggedIn) {
    clearCache();
    S.headers = [];
    S.rows = [];
    S.sheetName = '';
    S.sheetTitle = '';
    S.pinnedOrder = [];
    const sheetLabel = $('sheet-label');
    if (sheetLabel) sheetLabel.textContent = '';
    const mainView = $('main-view');
    if (mainView) mainView.style.display = 'none';
    const landing = $('landing');
    if (landing) landing.style.display = 'flex';
    return;
  }

  showLoader('Loading…');
  try {
    const data = await fetchData();
    S.headers = data.headers;
    S.sheetName = data.sheetName;
    S.sheetTitle = data.title;
    S.rows = data.rows.map(r => ({ ...r, cat: detectCat(r.hex) }));
    const sheetLabel = getElement('sheet-label');
    sheetLabel.textContent = `${data.title} / ${data.sheetName}`;
    
    // Load pinned order from server
    try {
      const serverPinnedOrder = await loadPinnedOrderFromServer(data.sheetName);
      S.pinnedOrder = serverPinnedOrder;
      savePinnedOrder(S.pinnedOrder);
    } catch (e) {
      console.warn('Failed to load pinned order from server:', e);
      // Fall back to local storage
    }
    
    saveCache({ headers: S.headers, rows: S.rows, sheetName: S.sheetName, sheetTitle: S.sheetTitle });
    initializePinnedRows();
    render();
    toast(`${S.rows.length} rows`, 'ok');
  } catch (e) {
    toast(`Error: ${(e as Error).message}`, 'err');
    if ((e as Error).message === 'Unauthorized') {
      S.loggedIn = false;
      setWriteEnabled(false);
      const btnAuth = $('btn-auth') as HTMLAnchorElement | null;
      if (btnAuth) btnAuth.style.display = 'inline-flex';
      const btnOut = $('btn-out') as HTMLAnchorElement | null;
      if (btnOut) btnOut.style.display = 'none';
      const connDot = $('conn-dot');
      if (connDot) connDot.className = 'dot err';
    }
  } finally {
    hideLoader();
  }
}

// App initialization
window.addEventListener('DOMContentLoaded', async () => {
  updateHideBtn();

  const cached = loadCache();
  if (cached) {
    S.headers = cached.headers;
    S.rows = cached.rows;
    S.sheetName = cached.sheetName;
    S.sheetTitle = cached.title;
    if (cached.title) {
      const sheetLabel = $('sheet-label');
      if (sheetLabel) sheetLabel.textContent = `${cached.title} / ${cached.sheetName}`;
    }
    initializePinnedRows();
    render();
  } else {
    showLoader('Connecting…');
  }

  let loggedIn = false;
  try {
    const session = await fetchSession();
    loggedIn = session.loggedIn;
  } catch {
    // Ignore
  }

  S.loggedIn = loggedIn;
  hideLoader();

  if (loggedIn) {
    const btnAuth = $('btn-auth');
    if (btnAuth) btnAuth.style.display = 'none';
    const btnOut = $('btn-out');
    if (btnOut) btnOut.style.display = 'inline-flex';
    const connDot = $('conn-dot');
    if (connDot) connDot.className = 'dot ok';
    const landing = $('landing');
    if (landing) landing.style.display = 'none';
    setWriteEnabled(true);
    if (!cached) await fetchDataFn();
  } else {
    setWriteEnabled(false);
    const btnAuth = $('btn-auth');
    if (btnAuth) btnAuth.style.display = 'inline-flex';
    const connDot = $('conn-dot');
    if (connDot) connDot.className = 'dot err';
    if (cached) {
      const landing = $('landing');
      if (landing) landing.style.display = 'none';
    } else {
      const mainView = $('main-view');
      if (mainView) mainView.style.display = 'none';
      const landing = $('landing');
      if (landing) landing.style.display = 'flex';
    }
    const p = new URLSearchParams(location.search);
    if (p.has('auth_error')) {
      toast('Sign in failed. Try again.', 'err');
      history.replaceState(null, '', '/');
    }
  }

  initializeEventListeners();
});
