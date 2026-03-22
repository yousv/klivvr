const CLIENT_ID  = '%%GOOGLE_CLIENT_ID%%';
const SHEET_ID   = '%%GOOGLE_SHEET_ID%%';
const TARGET_GID = 1723849469;
const SCOPES     = 'https://www.googleapis.com/auth/spreadsheets';
const DISCOVERY  = 'https://sheets.googleapis.com/$discovery/rest?version=v4';
const MAX_COLS   = 4;

const K = { TOKEN: 'ks_token', EXPIRY: 'ks_expiry', GROUPS: 'ks_groups', DATA: 'ks_data' };

const CAT = {
  Available:   { label: 'Available',   color: '#8F76D8', rgb: [143,118,216] },
  General:     { label: 'General',     color: '#63BBF4', rgb: [ 99,187,244] },
  Unavailable: { label: 'Unavailable', color: '#E36C73', rgb: [227,108,115] },
  Other:       { label: 'Other',       color: '#787878', rgb: [120,120,120] },
};
const CAT_ORDER = ['Available','General','Unavailable','Other'];

const NAME_STYLES = [
  { size:'14px', weight:'600', color:'#f0f0f0' },
  { size:'12px', weight:'400', color:'#c4b5fd' },
  { size:'12px', weight:'400', color:'#ef9a9a' },
  { size:'11px', weight:'400', color:'#6ee7b7' },
];

const S = {
  headers:[], rows:[], sheetName:'', sheetTitle:'',
  editRow:null, delRow:null, editCat:'General',
  authed:false, writeEnabled:false,
  openGroups: new Set(JSON.parse(localStorage.getItem(K.GROUPS)||'[]')),
  tokenClient:null, gapiReady:false, gisReady:false,
};

function saveToken(t,exp) { localStorage.setItem(K.TOKEN,t); localStorage.setItem(K.EXPIRY,Date.now()+exp*1000); scheduleRefresh(exp); }
function loadToken() { const t=localStorage.getItem(K.TOKEN),e=+localStorage.getItem(K.EXPIRY); return t&&Date.now()<e-30000?t:null; }
function clearToken() { localStorage.removeItem(K.TOKEN); localStorage.removeItem(K.EXPIRY); }

function saveData() {
  localStorage.setItem(K.DATA,JSON.stringify({headers:S.headers,rows:S.rows,sheetName:S.sheetName,title:S.sheetTitle}));
}
function loadCachedData() {
  const raw=localStorage.getItem(K.DATA);
  if(!raw) return false;
  try {
    const d=JSON.parse(raw);
    S.headers=d.headers||[]; S.rows=d.rows||[]; S.sheetName=d.sheetName||''; S.sheetTitle=d.title||'';
    if(d.title) $('sheet-label').textContent=`${d.title} / ${d.sheetName}`;
    return true;
  } catch { return false; }
}
function persistGroups() { localStorage.setItem(K.GROUPS,JSON.stringify([...S.openGroups])); }

function setWriteEnabled(v) {
  S.writeEnabled=v;
  ['btn-refresh','btn-add'].forEach(id=>{ const el=$(id); if(el) el.disabled=!v; });
}

window.addEventListener('DOMContentLoaded',()=>{
  if(CLIENT_ID.startsWith('%%')) { $('error-screen').style.display='flex'; return; }
  $('main-view').style.cssText='display:flex;flex-direction:column;flex:1;overflow:hidden;';
  if(loadCachedData()) render();
  showLoader('Connecting…');
  loadScript('https://apis.google.com/js/api.js',onGapiLoad);
  loadScript('https://accounts.google.com/gsi/client',onGisLoad);
});

function loadScript(src,cb) {
  const s=document.createElement('script');
  s.src=src; s.onload=cb;
  s.onerror=()=>{ hideLoader(); toast('Failed to load Google APIs','err'); };
  document.head.appendChild(s);
}

function onGapiLoad() {
  gapi.load('client',async()=>{
    await gapi.client.init({});
    await gapi.client.load(DISCOVERY);
    S.gapiReady=true; checkReady();
  });
}

function onGisLoad() {
  S.tokenClient=google.accounts.oauth2.initTokenClient({
    client_id:CLIENT_ID, scope:SCOPES,
    callback:resp=>{
      if(resp.error){ hideLoader(); toast('Sign in failed: '+resp.error,'err'); $('btn-auth').style.display='inline-flex'; return; }
      saveToken(resp.access_token,+resp.expires_in||3600);
      const wasLoggedOut=!S.authed;
      S.authed=true; setWriteEnabled(true);
      $('btn-auth').style.display='none'; $('btn-out').style.display='inline-flex'; $('conn-dot').className='ok';
      if(wasLoggedOut&&localStorage.getItem(K.DATA)) {
        localStorage.removeItem(K.DATA);
        S.headers=[]; S.rows=[]; S.sheetName=''; S.sheetTitle='';
      }
      fetchData();
    },
  });
  S.gisReady=true; checkReady();
}

function checkReady() {
  if(!S.gapiReady||!S.gisReady) return;
  hideLoader();
  const t=loadToken();
  if(t) {
    gapi.client.setToken({access_token:t});
    S.authed=true; setWriteEnabled(true);
    $('btn-auth').style.display='none'; $('btn-out').style.display='inline-flex'; $('conn-dot').className='ok';
    scheduleRefresh(Math.floor((+localStorage.getItem(K.EXPIRY)-Date.now())/1000));
    if(!localStorage.getItem(K.DATA)) fetchData();
  } else {
    setWriteEnabled(false);
    $('btn-auth').style.display='inline-flex'; $('conn-dot').className='err';
    if(!localStorage.getItem(K.DATA)) { $('empty-state').style.display='flex'; }
  }
}

function handleAuth() { S.tokenClient.requestAccessToken({prompt:''}); }

function signOut() {
  const t=gapi?.client?.getToken?.();
  if(t?.access_token) { google.accounts.oauth2.revoke(t.access_token,()=>{}); gapi.client.setToken(null); }
  clearToken(); S.authed=false; setWriteEnabled(false);
  $('btn-auth').style.display='inline-flex'; $('btn-out').style.display='none'; $('conn-dot').className='';
}

function scheduleRefresh(sec) {
  const delay=Math.max(0,(sec-120)*1000);
  setTimeout(()=>{ if(S.tokenClient) S.tokenClient.requestAccessToken({prompt:''}); },delay);
}

async function fetchData() {
  showLoader('Loading…');
  try {
    const name=S.sheetName||await resolveSheetName();
    const meta=await gapi.client.sheets.spreadsheets.get({
      spreadsheetId:SHEET_ID, includeGridData:true, ranges:[`'${name}'!A:D`],
      fields:'properties.title,sheets(properties,data(rowData(values(formattedValue,effectiveFormat(backgroundColor)))))',
    });
    const sheet=meta.result.sheets.find(s=>s.properties.sheetId===TARGET_GID)||meta.result.sheets[0];
    S.sheetName=sheet.properties.title; S.sheetTitle=meta.result.properties.title;
    $('sheet-label').textContent=`${S.sheetTitle} / ${S.sheetName}`;
    const allRows=sheet.data?.[0]?.rowData||[];
    S.headers=(allRows[0]?.values||[]).slice(0,MAX_COLS).map(c=>c.formattedValue||'');
    S.rows=[];
    for(let i=1;i<allRows.length;i++) {
      const cells=allRows[i]?.values||[];
      const values=S.headers.map((_,ci)=>cells[ci]?.formattedValue||'');
      if(values.every(v=>!v.trim())) continue;
      const hex=extractBgHex(cells[0]);
      S.rows.push({values,hex,cat:detectCat(hex),sheetRow:i+1});
    }
    saveData(); render();
    toast(`${S.rows.length} rows`,'ok');
  } catch(e) {
    console.error(e);
    toast('Error: '+(e.result?.error?.message||e.message||e),'err');
    if(e.status===401) { clearToken(); gapi.client.setToken(null); S.authed=false; setWriteEnabled(false); $('btn-auth').style.display='inline-flex'; $('btn-out').style.display='none'; $('conn-dot').className='err'; }
  } finally { hideLoader(); }
}

async function resolveSheetName() {
  const m=await gapi.client.sheets.spreadsheets.get({spreadsheetId:SHEET_ID,fields:'sheets.properties'});
  return (m.result.sheets.find(s=>s.properties.sheetId===TARGET_GID)||m.result.sheets[0]).properties.title;
}

function loadData() { if(S.authed) fetchData(); }

function extractBgHex(cell) {
  const bg=cell?.effectiveFormat?.backgroundColor;
  if(!bg) return null;
  const r=Math.round((bg.red||0)*255),g=Math.round((bg.green||0)*255),b=Math.round((bg.blue||0)*255);
  if(r>245&&g>245&&b>245) return null;
  return '#'+[r,g,b].map(v=>v.toString(16).padStart(2,'0')).join('');
}

function detectCat(hex) {
  if(!hex) return 'General';
  const r=parseInt(hex.slice(1,3),16)/255,g=parseInt(hex.slice(3,5),16)/255,b=parseInt(hex.slice(5,7),16)/255;
  const max=Math.max(r,g,b),min=Math.min(r,g,b),d=max-min,l=(max+min)/2;
  if(!d||d/(l>0.5?2-max-min:max+min)<0.1) return 'Other';
  let h=0;
  if(max===r)      h=((g-b)/d+(g<b?6:0))/6;
  else if(max===g) h=((b-r)/d+2)/6;
  else             h=((r-g)/d+4)/6;
  h*=360;
  if(h<20||h>=330)         return 'Unavailable';
  if(h>=245&&h<330)        return 'Available';
  if(h>=170&&h<245)        return 'General';
  return 'Other';
}

let _searchTimer;
function debouncedSearch() {
  clearTimeout(_searchTimer);
  _searchTimer = setTimeout(() => {
    const q = $('search').value;
    const clearBtn = $('search-clear');
    if (clearBtn) clearBtn.classList.toggle('visible', q.length > 0);
    if (q) {
      const ql = q.toLowerCase();
      CAT_ORDER.forEach(key => {
        const hasMatch = S.rows.some(r => r.cat === key && r.values.some(v => v.toLowerCase().includes(ql)));
        if (hasMatch && !S.openGroups.has(key)) { S.openGroups.add(key); persistGroups(); }
      });
    }
    render();
  }, 150);
}

function clearSearch() {
  $('search').value = '';
  const clearBtn = $('search-clear');
  if (clearBtn) clearBtn.classList.remove('visible');
  render();
}

function render() {
  const q=$('search').value.toLowerCase();
  const rows=q?S.rows.filter(r=>r.values.some(v=>v.toLowerCase().includes(q))):S.rows;
  $('row-count').textContent=rows.length?`${rows.length}/${S.rows.length}`:'';
  $('empty-state').style.display=rows.length?'none':'flex';

  const grouped=Object.fromEntries(CAT_ORDER.map(k=>[k,[]]));
  rows.forEach(r=>(grouped[r.cat]||grouped.Other).push(r));

  const container=$('groups-container');
  container.innerHTML='';

  CAT_ORDER.forEach(key=>{
    const catRows=[...grouped[key]].sort((a,b)=>(a.values[0]||'').localeCompare(b.values[0]||'',undefined,{sensitivity:'base'}));
    if(!catRows.length) return;

    const def=CAT[key],isOpen=S.openGroups.has(key);
    const group=mk('div','group'+(isOpen?' open':''));
    group.dataset.key=key;

    const hdr=mk('div','group-header');
    hdr.innerHTML=`<span class="g-swatch" style="background:${def.color}"></span><span class="g-name">${def.label}</span><span class="g-count">${catRows.length}</span><span class="g-chev">›</span>`;
    hdr.addEventListener('click',()=>{ const o=group.classList.toggle('open'); o?S.openGroups.add(key):S.openGroups.delete(key); persistGroups(); });

    const body=mk('div','group-body');
    const list=mk('div','cards-list');

    if(S.headers.length>1) {
      const colHdr=mk('div','col-header');
      const nameSpace=mk('div','col-header-name');
      const cellsSpace=mk('div','col-header-cells');
      S.headers.forEach((_,ci)=>{
        if(ci===0) return;
        const ch=mk('div','col-header-cell');
        ch.textContent=S.headers[ci];
        cellsSpace.appendChild(ch);
      });
      const actsSpace=mk('div','col-header-acts');
      colHdr.append(nameSpace,cellsSpace,actsSpace);
      list.appendChild(colHdr);
    }

    catRows.forEach((row,i)=>{
      const card=mk('div','row-card');
      card.style.animationDelay=`${i*20}ms`;

      const nameCell=mk('div','name-cell');
      const lines=(row.values[0]||'—').split('\n').filter(l=>l.trim());
      (lines.length?lines:['—']).forEach((line,li)=>{
        const st=NAME_STYLES[Math.min(li,NAME_STYLES.length-1)];
        const el=document.createElement('span');
        el.className='name-line'; el.dir='rtl'; el.textContent=line;
        el.style.cssText=`font-size:${st.size};font-weight:${st.weight};color:${st.color}`;
        nameCell.appendChild(el);
      });

      const dataCells=mk('div','data-cells');
      S.headers.forEach((h,ci)=>{
        if(ci===0) return;
        const val=row.values[ci]||'';
        const cell=mk('div','data-cell');
        const valEl=mk('div','dc-val'+(val?'':' empty'));
        valEl.dir='rtl'; valEl.textContent=val||'—';
        if(val) valEl.addEventListener('click',()=>copy(valEl,val));
        cell.appendChild(valEl);
        dataCells.appendChild(cell);
      });

      const acts=mk('div','row-acts');
      if(S.writeEnabled) {
        acts.append(
          btn('ghost icon','✎','Edit',()=>openEdit(row)),
          btn('danger icon','✕','Delete',()=>openDel(row))
        );
      }

      card.append(nameCell,dataCells,acts);
      list.appendChild(card);
    });

    body.appendChild(list);
    group.append(hdr,body);
    container.appendChild(group);
  });

  requestAnimationFrame(adjustNameCols);
}

function adjustNameCols() {
  document.querySelectorAll('.cards-list').forEach(list => {
    const nameCells = list.querySelectorAll('.name-cell');
    const hdrName   = list.querySelector('.col-header-name');
    if (!nameCells.length) return;
    nameCells.forEach(c => { c.style.width = 'max-content'; c.style.whiteSpace = 'nowrap'; });
    let maxW = 0;
    nameCells.forEach(c => { maxW = Math.max(maxW, c.offsetWidth); });
    maxW = Math.min(Math.max(maxW + 1, 80), 240);
    nameCells.forEach(c => { c.style.width = maxW + 'px'; c.style.whiteSpace = ''; });
    if (hdrName) hdrName.style.width = maxW + 'px';
  });
}
  navigator.clipboard.writeText(val).then(()=>{
    el.classList.add('copied');
    setTimeout(()=>el.classList.remove('copied'),700);
    const p=val.replace(/\n/g,' ');
    toast('Copied — '+(p.length>30?p.slice(0,30)+'…':p),'copy');
  }).catch(()=>toast('Copy failed','err'));
}

function buildPicker(selected) {
  S.editCat=selected;
  return `<div class="field"><label>Category</label><div class="cat-picker" id="cat-picker">${
    CAT_ORDER.map(k=>{
      const on=k===selected;
      return `<button type="button" class="cat-btn${on?' sel':''}" data-cat="${k}" style="${on?`border-color:${CAT[k].color};color:${CAT[k].color}`:''}">${CAT[k].label}</button>`;
    }).join('')
  }</div></div>`;
}

function attachPicker() {
  document.querySelectorAll('#cat-picker .cat-btn').forEach(b=>
    b.addEventListener('click',()=>{
      S.editCat=b.dataset.cat;
      document.querySelectorAll('#cat-picker .cat-btn').forEach(x=>{
        const on=x.dataset.cat===S.editCat;
        x.className='cat-btn'+(on?' sel':'');
        x.style.borderColor=on?CAT[x.dataset.cat].color:'';
        x.style.color=on?CAT[x.dataset.cat].color:'';
      });
    })
  );
}

function fieldHtml(h,i) {
  return `<div class="field"><label>${xe(h)}</label><textarea id="f${i}" dir="rtl" rows="2" placeholder="—" autocomplete="new-password" spellcheck="false"></textarea></div>`;
}
function fieldHtmlVal(h,i,v) {
  return `<div class="field"><label>${xe(h)}</label><textarea id="f${i}" dir="rtl" rows="2" placeholder="—" autocomplete="new-password" spellcheck="false">${xe(v)}</textarea></div>`;
}

function openAdd() {
  if(!S.writeEnabled) return;
  S.editRow=null; S.editCat='General';
  $('modal-title').textContent='Add row';
  $('modal-fields').innerHTML=buildPicker('General')+S.headers.map((h,i)=>fieldHtml(h,i)).join('');
  attachPicker();
  open_('edit-overlay');
  setTimeout(()=>{ S.headers.forEach((_,i)=>{ const el=$('f'+i); if(el) el.value=''; }); $('f0')?.focus(); },60);
}

function openEdit(row) {
  if(!S.writeEnabled) return;
  S.editRow=row; S.editCat=row.cat;
  $('modal-title').textContent='Edit row';
  $('modal-fields').innerHTML=buildPicker(row.cat)+S.headers.map((h,i)=>fieldHtmlVal(h,i,row.values[i]||'')).join('');
  attachPicker();
  open_('edit-overlay');
  setTimeout(()=>$('f0')?.focus(),60);
}

async function saveRow() {
  const vals=S.headers.map((_,i)=>$('f'+i)?.value||'');
  const cat=S.editCat,rgb=CAT[cat].rgb;
  const hex='#'+rgb.map(v=>v.toString(16).padStart(2,'0')).join('');
  close_('edit-overlay');
  try {
    if(!S.editRow) {
      const res=await gapi.client.sheets.spreadsheets.values.append({
        spreadsheetId:SHEET_ID, range:S.sheetName,
        valueInputOption:'USER_ENTERED', insertDataOption:'INSERT_ROWS',
        resource:{values:[vals]},
      });
      const m=(res.result.updates?.updatedRange||'').match(/(\d+)$/);
      const sheetRow=m?+m[1]:(S.rows.length?Math.max(...S.rows.map(r=>r.sheetRow))+1:2);
      await setCellBg(sheetRow,rgb);
      S.rows.push({values:vals,hex,cat,sheetRow});
      toast('Row added','ok');
    } else {
      await gapi.client.sheets.spreadsheets.values.update({
        spreadsheetId:SHEET_ID, range:`${S.sheetName}!A${S.editRow.sheetRow}`,
        valueInputOption:'USER_ENTERED', resource:{values:[vals]},
      });
      if(cat!==S.editRow.cat) await setCellBg(S.editRow.sheetRow,rgb);
      const idx=S.rows.indexOf(S.editRow);
      if(idx>=0) S.rows[idx]={...S.editRow,values:vals,hex,cat};
      toast('Row updated','ok');
    }
    saveData(); render();
  } catch(e) { toast('Save failed: '+(e.result?.error?.message||e.message||e),'err'); }
}

async function setCellBg(sheetRow,rgb) {
  await gapi.client.sheets.spreadsheets.batchUpdate({
    spreadsheetId:SHEET_ID,
    resource:{requests:[{repeatCell:{
      range:{sheetId:TARGET_GID,startRowIndex:sheetRow-1,endRowIndex:sheetRow,startColumnIndex:0,endColumnIndex:1},
      cell:{userEnteredFormat:{backgroundColor:{red:rgb[0]/255,green:rgb[1]/255,blue:rgb[2]/255}}},
      fields:'userEnteredFormat.backgroundColor',
    }}]},
  });
}

function openDel(row) { if(!S.writeEnabled) return; S.delRow=row; open_('del-overlay'); }

async function confirmDelete() {
  const row=S.delRow; close_('del-overlay');
  try {
    await gapi.client.sheets.spreadsheets.batchUpdate({
      spreadsheetId:SHEET_ID,
      resource:{requests:[{deleteDimension:{
        range:{sheetId:TARGET_GID,dimension:'ROWS',startIndex:row.sheetRow-1,endIndex:row.sheetRow},
      }}]},
    });
    S.rows.splice(S.rows.indexOf(row),1);
    S.rows.forEach(r=>{ if(r.sheetRow>row.sheetRow) r.sheetRow--; });
    saveData(); render();
    toast('Row deleted','ok');
  } catch(e) { toast('Delete failed: '+(e.result?.error?.message||e.message||e),'err'); }
}

const $     = id=>(document.getElementById(id));
const mk    = (tag,cls)=>{ const e=document.createElement(tag); e.className=cls; return e; };
const open_ = id=>$(id).classList.add('open');
const close_= id=>$(id).classList.remove('open');
const showLoader=msg=>{ $('loader-msg').textContent=msg; $('loader').style.display='flex'; };
const hideLoader=()=>$('loader').style.display='none';

function btn(cls,text,title,onClick) {
  const b=mk('button','btn '+cls);
  b.textContent=text; b.title=title;
  b.addEventListener('click',onClick);
  return b;
}

function toast(msg,type='info') {
  const t=mk('div',`toast ${type}`);
  t.innerHTML=`<span class="t-dot"></span><span>${xe(msg)}</span>`;
  $('toasts').appendChild(t);
  setTimeout(()=>t.remove(),2800);
}

function xe(s) { return String(s??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }

document.addEventListener('keydown',e=>{
  if(e.key==='Escape') { close_('edit-overlay'); close_('del-overlay'); }
  if((e.metaKey||e.ctrlKey)&&e.key==='k') { e.preventDefault(); $('search')?.focus(); }
  if((e.metaKey||e.ctrlKey)&&e.key==='n') { e.preventDefault(); openAdd(); }
});
document.querySelectorAll('.overlay').forEach(ov=>ov.addEventListener('click',e=>{ if(e.target===ov) ov.classList.remove('open'); }));
