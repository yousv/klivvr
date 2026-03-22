const CLIENT_ID  = '%%GOOGLE_CLIENT_ID%%';
const SHEET_ID   = '%%GOOGLE_SHEET_ID%%';
const TARGET_GID = 1723849469;
const SCOPES     = 'https://www.googleapis.com/auth/spreadsheets';
const DISCOVERY  = 'https://sheets.googleapis.com/$discovery/rest?version=v4';
const MAX_COLS   = 4;
const KEY_TOKEN  = 'ks_token';
const KEY_EXPIRY = 'ks_expiry';
const KEY_GROUPS = 'ks_groups';

const CAT = {
  Available:   { label: 'Available',   color: '#8F76D8', rgb: [143, 118, 216] },
  General:     { label: 'General',     color: '#63BBF4', rgb: [ 99, 187, 244] },
  Unavailable: { label: 'Unavailable', color: '#E36C73', rgb: [227, 108, 115] },
  Other:       { label: 'Other',       color: '#787878', rgb: [120, 120, 120] },
};
const CAT_ORDER = ['Available', 'General', 'Unavailable', 'Other'];

const S = {
  headers:     [],
  rows:        [],
  sheetName:   '',
  editRow:     null,
  delRow:      null,
  editCat:     'General',
  openGroups:  new Set(JSON.parse(localStorage.getItem(KEY_GROUPS) || '[]')),
  tokenClient: null,
  gapiReady:   false,
  gisReady:    false,
};

function persistGroups() {
  localStorage.setItem(KEY_GROUPS, JSON.stringify([...S.openGroups]));
}

function saveToken(t, exp) {
  localStorage.setItem(KEY_TOKEN,  t);
  localStorage.setItem(KEY_EXPIRY, Date.now() + exp * 1000);
  scheduleRefresh(exp);
}
function loadToken() {
  const t = localStorage.getItem(KEY_TOKEN);
  const e = +localStorage.getItem(KEY_EXPIRY);
  return t && Date.now() < e - 30000 ? t : null;
}
function clearToken() {
  localStorage.removeItem(KEY_TOKEN);
  localStorage.removeItem(KEY_EXPIRY);
}

function scheduleRefresh(expiresInSeconds) {
  const refreshInMs = (expiresInSeconds - 120) * 1000;
  if (refreshInMs <= 0) return;
  setTimeout(() => {
    if (S.tokenClient) S.tokenClient.requestAccessToken({ prompt: '' });
  }, refreshInMs);
}

window.addEventListener('DOMContentLoaded', () => {
  if (CLIENT_ID.startsWith('%%')) { $('error-screen').style.display = 'flex'; return; }
  $('main-view').style.cssText = 'display:flex;flex-direction:column;flex:1;overflow:hidden;';
  showLoader('Connecting…');
  loadScript('https://apis.google.com/js/api.js', onGapiLoad);
  loadScript('https://accounts.google.com/gsi/client', onGisLoad);
});

function loadScript(src, cb) {
  const s = document.createElement('script');
  s.src = src; s.onload = cb;
  s.onerror = () => { hideLoader(); toast('Failed to load Google APIs', 'err'); };
  document.head.appendChild(s);
}

function onGapiLoad() {
  gapi.load('client', async () => {
    await gapi.client.init({});
    await gapi.client.load(DISCOVERY);
    S.gapiReady = true;
    checkReady();
  });
}

function onGisLoad() {
  S.tokenClient = google.accounts.oauth2.initTokenClient({
    client_id: CLIENT_ID, scope: SCOPES,
    callback: resp => {
      if (resp.error) { hideLoader(); toast('Sign in failed: ' + resp.error, 'err'); $('btn-auth').style.display = 'inline-flex'; return; }
      saveToken(resp.access_token, +resp.expires_in || 3600);
      onAuthed();
    },
  });
  S.gisReady = true;
  checkReady();
}

function checkReady() {
  if (!S.gapiReady || !S.gisReady) return;
  hideLoader();
  const t = loadToken();
  if (t) {
    gapi.client.setToken({ access_token: t });
    const remaining = Math.floor((+localStorage.getItem(KEY_EXPIRY) - Date.now()) / 1000);
    scheduleRefresh(remaining);
    onAuthed();
  } else $('btn-auth').style.display = 'inline-flex';
}

function handleAuth() { S.tokenClient.requestAccessToken({ prompt: '' }); }

function onAuthed() {
  $('btn-auth').style.display = 'none';
  $('btn-out').style.display  = 'inline-flex';
  $('conn-dot').className = 'ok';
  loadData();
}

function signOut() {
  const t = gapi?.client?.getToken?.();
  if (t?.access_token) { google.accounts.oauth2.revoke(t.access_token, () => {}); gapi.client.setToken(null); }
  clearToken();
  localStorage.removeItem(KEY_GROUPS);
  S.openGroups.clear();
  Object.assign(S, { headers: [], rows: [], sheetName: '' });
  $('btn-auth').style.display = 'inline-flex';
  $('btn-out').style.display  = 'none';
  $('sheet-label').textContent = '—';
  $('conn-dot').className = '';
  $('groups-container').innerHTML = '';
  $('row-count').textContent = '';
}

async function loadData() {
  showLoader('Loading…');
  try {
    const name = S.sheetName || await resolveSheetName();
    const meta = await gapi.client.sheets.spreadsheets.get({
      spreadsheetId: SHEET_ID, includeGridData: true,
      ranges: [`'${name}'!A:D`],
      fields: 'properties.title,sheets(properties,data(rowData(values(formattedValue,effectiveFormat(backgroundColor)))))',
    });
    const sheet = meta.result.sheets.find(s => s.properties.sheetId === TARGET_GID) || meta.result.sheets[0];
    S.sheetName = sheet.properties.title;
    $('sheet-label').textContent = `${meta.result.properties.title} / ${S.sheetName}`;
    const allRows = sheet.data?.[0]?.rowData || [];
    if (!allRows.length) { S.headers = []; S.rows = []; render(); return; }
    S.headers = (allRows[0].values || []).slice(0, MAX_COLS).map(c => c.formattedValue || '');
    S.rows = [];
    for (let i = 1; i < allRows.length; i++) {
      const cells  = allRows[i]?.values || [];
      const values = S.headers.map((_, ci) => cells[ci]?.formattedValue || '');
      if (values.every(v => !v.trim())) continue;
      const hex = extractBgHex(cells[0]);
      S.rows.push({ values, hex, cat: detectCat(hex), sheetRow: i + 1 });
    }
    render();
    toast(`${S.rows.length} rows`, 'ok');
  } catch(e) {
    console.error(e);
    toast('Error: ' + (e.result?.error?.message || e.message || e), 'err');
    if (e.status === 401) { clearToken(); gapi.client.setToken(null); $('btn-auth').style.display = 'inline-flex'; $('btn-out').style.display = 'none'; $('conn-dot').className = 'err'; }
  } finally { hideLoader(); }
}

async function resolveSheetName() {
  const m = await gapi.client.sheets.spreadsheets.get({ spreadsheetId: SHEET_ID, fields: 'sheets.properties' });
  return (m.result.sheets.find(s => s.properties.sheetId === TARGET_GID) || m.result.sheets[0]).properties.title;
}

function extractBgHex(cell) {
  const bg = cell?.effectiveFormat?.backgroundColor;
  if (!bg) return null;
  const r = Math.round((bg.red   || 0) * 255);
  const g = Math.round((bg.green || 0) * 255);
  const b = Math.round((bg.blue  || 0) * 255);
  if (r > 245 && g > 245 && b > 245) return null;
  return '#' + [r, g, b].map(v => v.toString(16).padStart(2, '0')).join('');
}

function detectCat(hex) {
  if (!hex) return 'General';
  const r = parseInt(hex.slice(1,3), 16) / 255;
  const g = parseInt(hex.slice(3,5), 16) / 255;
  const b = parseInt(hex.slice(5,7), 16) / 255;
  const max = Math.max(r,g,b), min = Math.min(r,g,b), d = max - min;
  const l = (max + min) / 2;
  if (!d || d / (l > 0.5 ? 2 - max - min : max + min) < 0.1) return 'Other';
  let h = 0;
  if (max === r)      h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
  else if (max === g) h = ((b - r) / d + 2) / 6;
  else                h = ((r - g) / d + 4) / 6;
  h *= 360;
  if (h < 20 || h >= 330)          return 'Unavailable';
  if (h >= 245 && h < 330)         return 'Available';
  if (h >= 170 && h < 245)         return 'General';
  return 'Other';
}

function render() {
  const q = $('search').value.toLowerCase();
  const rows = q ? S.rows.filter(r => r.values.some(v => v.toLowerCase().includes(q))) : S.rows;
  $('row-count').textContent = rows.length ? `${rows.length}/${S.rows.length}` : '';
  $('empty-state').style.display = rows.length ? 'none' : 'flex';

  const grouped = Object.fromEntries(CAT_ORDER.map(k => [k, []]));
  rows.forEach(r => (grouped[r.cat] || grouped.Other).push(r));

  const container = $('groups-container');
  container.innerHTML = '';

  CAT_ORDER.forEach(key => {
    const catRows = [...grouped[key]].sort((a, b) =>
      (a.values[0] || '').localeCompare(b.values[0] || '', undefined, { sensitivity: 'base' })
    );
    if (!catRows.length) return;

    const def    = CAT[key];
    const isOpen = S.openGroups.has(key);
    const group  = mk('div', 'group' + (isOpen ? ' open' : ''));
    group.dataset.key = key;

    const hdr = mk('div', 'group-header');
    hdr.innerHTML = `<span class="g-swatch" style="background:${def.color}"></span><span class="g-name">${def.label}</span><span class="g-count">${catRows.length}</span><span class="g-chev">›</span>`;
    hdr.addEventListener('click', () => {
      const o = group.classList.toggle('open');
      o ? S.openGroups.add(key) : S.openGroups.delete(key);
      persistGroups();
    });

    const body = mk('div', 'group-body');
    const list = mk('div', 'cards-list');

    catRows.forEach((row, i) => {
      const card = mk('div', 'row-card');
      card.style.animationDelay = `${i * 28}ms`;

      const nameRow = mk('div', 'card-name-row');
      const nameEl  = mk('div', 'card-name');
      nameEl.textContent = row.values[0] || '—';
      const acts = mk('div', 'card-acts');
      acts.append(
        btn('ghost icon', '✎', 'Edit',   () => openEdit(row)),
        btn('danger icon', '✕', 'Delete', () => openDel(row))
      );
      nameRow.append(nameEl, acts);
      card.appendChild(nameRow);

      const fields = mk('div', 'card-fields');
      S.headers.forEach((h, ci) => {
        if (ci === 0) return;
        const val   = row.values[ci] || '';
        const block = mk('div', 'cf-block');
        const lbl   = mk('div', 'cf-label');
        lbl.textContent = h;
        const valEl = mk('div', 'cf-val' + (val ? '' : ' empty'));
        valEl.dir = 'rtl';
        valEl.textContent = val || '—';
        if (val) valEl.addEventListener('click', () => copy(valEl, val));
        block.append(lbl, valEl);
        fields.appendChild(block);
      });
      card.appendChild(fields);
      list.appendChild(card);
    });

    body.appendChild(list);
    group.append(hdr, body);
    container.appendChild(group);
  });
}

function copy(el, val) {
  navigator.clipboard.writeText(val).then(() => {
    el.classList.add('copied');
    setTimeout(() => el.classList.remove('copied'), 700);
    const p = val.replace(/\n/g, ' ');
    toast('Copied — ' + (p.length > 30 ? p.slice(0, 30) + '…' : p), 'copy');
  }).catch(() => toast('Copy failed', 'err'));
}

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
  document.querySelectorAll('#cat-picker .cat-btn').forEach(b =>
    b.addEventListener('click', () => {
      S.editCat = b.dataset.cat;
      document.querySelectorAll('#cat-picker .cat-btn').forEach(x => {
        const on = x.dataset.cat === S.editCat;
        x.className = 'cat-btn' + (on ? ' sel' : '');
        x.style.borderColor = on ? CAT[x.dataset.cat].color : '';
        x.style.color       = on ? CAT[x.dataset.cat].color : '';
      });
    })
  );
}

function fieldHtml(h, i, val = '') {
  return `<div class="field"><label>${xe(h)}</label><textarea id="f${i}" dir="rtl" rows="2" placeholder="—">${xe(val)}</textarea></div>`;
}

function openAdd() {
  S.editRow = null; S.editCat = 'General';
  $('modal-title').textContent = 'Add row';
  $('modal-fields').innerHTML  = buildPicker('General') + S.headers.map((h, i) => fieldHtml(h, i)).join('');
  attachPicker();
  open_('edit-overlay');
  setTimeout(() => $('f0')?.focus(), 100);
}

function openEdit(row) {
  S.editRow = row; S.editCat = row.cat;
  $('modal-title').textContent = 'Edit row';
  $('modal-fields').innerHTML  = buildPicker(row.cat) + S.headers.map((h, i) => fieldHtml(h, i, row.values[i] || '')).join('');
  attachPicker();
  open_('edit-overlay');
  setTimeout(() => $('f0')?.focus(), 100);
}

async function saveRow() {
  const vals = S.headers.map((_, i) => $('f' + i)?.value || '');
  const cat  = S.editCat;
  const rgb  = CAT[cat].rgb;
  const hex  = '#' + rgb.map(v => v.toString(16).padStart(2, '0')).join('');
  close_('edit-overlay');
  try {
    if (!S.editRow) {
      const res = await gapi.client.sheets.spreadsheets.values.append({
        spreadsheetId: SHEET_ID, range: S.sheetName,
        valueInputOption: 'USER_ENTERED', insertDataOption: 'INSERT_ROWS',
        resource: { values: [vals] },
      });
      const updatedRange = res.result.updates?.updatedRange || '';
      const match = updatedRange.match(/(\d+)$/);
      const sheetRow = match ? +match[1] : (S.rows.length ? Math.max(...S.rows.map(r => r.sheetRow)) + 1 : 2);
      await setCellBg(sheetRow, rgb);
      S.rows.push({ values: vals, hex, cat, sheetRow });
      toast('Row added', 'ok');
    } else {
      await gapi.client.sheets.spreadsheets.values.update({
        spreadsheetId: SHEET_ID, range: `${S.sheetName}!A${S.editRow.sheetRow}`,
        valueInputOption: 'USER_ENTERED', resource: { values: [vals] },
      });
      if (cat !== S.editRow.cat) await setCellBg(S.editRow.sheetRow, rgb);
      const idx = S.rows.indexOf(S.editRow);
      if (idx >= 0) S.rows[idx] = { ...S.editRow, values: vals, hex, cat };
      toast('Row updated', 'ok');
    }
    render();
  } catch(e) { toast('Save failed: ' + (e.result?.error?.message || e.message || e), 'err'); }
}

async function setCellBg(sheetRow, rgb) {
  await gapi.client.sheets.spreadsheets.batchUpdate({
    spreadsheetId: SHEET_ID,
    resource: { requests: [{ repeatCell: {
      range: { sheetId: TARGET_GID, startRowIndex: sheetRow - 1, endRowIndex: sheetRow, startColumnIndex: 0, endColumnIndex: 1 },
      cell:  { userEnteredFormat: { backgroundColor: { red: rgb[0]/255, green: rgb[1]/255, blue: rgb[2]/255 } } },
      fields: 'userEnteredFormat.backgroundColor',
    }}]},
  });
}

function openDel(row) { S.delRow = row; open_('del-overlay'); }

async function confirmDelete() {
  const row = S.delRow;
  close_('del-overlay');
  try {
    await gapi.client.sheets.spreadsheets.batchUpdate({
      spreadsheetId: SHEET_ID,
      resource: { requests: [{ deleteDimension: {
        range: { sheetId: TARGET_GID, dimension: 'ROWS', startIndex: row.sheetRow - 1, endIndex: row.sheetRow },
      }}]},
    });
    S.rows.splice(S.rows.indexOf(row), 1);
    S.rows.forEach(r => { if (r.sheetRow > row.sheetRow) r.sheetRow--; });
    render();
    toast('Row deleted', 'ok');
  } catch(e) { toast('Delete failed: ' + (e.result?.error?.message || e.message || e), 'err'); }
}

const $      = id => document.getElementById(id);
const mk     = (tag, cls) => { const e = document.createElement(tag); e.className = cls; return e; };
const open_  = id => $(id).classList.add('open');
const close_ = id => $(id).classList.remove('open');
const showLoader = msg => { $('loader-msg').textContent = msg; $('loader').style.display = 'flex'; };
const hideLoader = ()  => $('loader').style.display = 'none';

function btn(cls, text, title, onClick) {
  const b = mk('button', 'btn ' + cls);
  b.textContent = text; b.title = title;
  b.addEventListener('click', onClick);
  return b;
}

function toast(msg, type = 'info') {
  const t = mk('div', `toast ${type}`);
  t.innerHTML = `<span class="t-dot"></span><span>${xe(msg)}</span>`;
  $('toasts').appendChild(t);
  setTimeout(() => t.remove(), 2800);
}

function xe(s) {
  return String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

document.addEventListener('keydown', e => { if (e.key === 'Escape') { close_('edit-overlay'); close_('del-overlay'); } });
document.querySelectorAll('.overlay').forEach(ov => ov.addEventListener('click', e => { if (e.target === ov) ov.classList.remove('open'); }));
