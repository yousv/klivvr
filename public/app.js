const K = { GROUPS:'ks_groups', DATA:'ks_data' };

const CAT = {
  Available:   { label:'Available',   color:'#8F76D8', rgb:[143,118,216] },
  General:     { label:'General',     color:'#63BBF4', rgb:[ 99,187,244] },
  Unavailable: { label:'Unavailable', color:'#E36C73', rgb:[227,108,115] },
  Other:       { label:'Other',       color:'#787878', rgb:[120,120,120] },
};
const CAT_ORDER = ['Available','General','Unavailable','Other'];

const NAME_STYLES = [
  { size:'14px', weight:'600', color:'#ffffff' },
  { size:'12px', weight:'400', color:'#c4b5fd' },
  { size:'12px', weight:'400', color:'#ef9a9a' },
  { size:'11px', weight:'400', color:'#6ee7b7' },
];

const S = {
  headers:[], rows:[], sheetName:'', sheetTitle:'',
  editRow:null, delRow:null, editCat:'General',
  loggedIn:false, writeEnabled:false,
  openGroups: new Set(JSON.parse(localStorage.getItem(K.GROUPS)||'[]')),
};

const $ = id => document.getElementById(id);
const mk = (tag,cls) => { const e=document.createElement(tag); e.className=cls; return e; };
const open_  = id => $(id).classList.add('open');
const close_ = id => $(id).classList.remove('open');
const showLoader = msg => { $('loader-msg').textContent=msg; $('loader').style.display='flex'; };
const hideLoader = () => $('loader').style.display='none';
const xe = s => String(s??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');

function mkBtn(cls,text,title,onClick) {
  const b=mk('button','btn '+cls);
  b.textContent=text; b.title=title;
  b.addEventListener('click',onClick);
  return b;
}

function toast(msg,type='info') {
  const t=mk('div','toast '+type);
  t.innerHTML=`<span class="t-dot"></span><span>${xe(msg)}</span>`;
  $('toasts').appendChild(t);
  setTimeout(()=>t.remove(),2800);
}

function saveCache() {
  localStorage.setItem(K.DATA,JSON.stringify({
    headers:S.headers, rows:S.rows, sheetName:S.sheetName, title:S.sheetTitle,
  }));
}
function loadCache() {
  const raw=localStorage.getItem(K.DATA);
  if(!raw) return false;
  try {
    const d=JSON.parse(raw);
    S.headers=d.headers||[]; S.rows=d.rows||[];
    S.sheetName=d.sheetName||''; S.sheetTitle=d.title||'';
    if(d.title) $('sheet-label').textContent=`${d.title} / ${d.sheetName}`;
    return true;
  } catch { return false; }
}
function persistGroups() { localStorage.setItem(K.GROUPS,JSON.stringify([...S.openGroups])); }

function setWriteEnabled(v) {
  S.writeEnabled=v;
  ['btn-refresh','btn-add'].forEach(id=>{ const el=$(id); if(el) el.disabled=!v; });
}

function detectCat(hex) {
  if(!hex) return 'General';
  const r=parseInt(hex.slice(1,3),16)/255, g=parseInt(hex.slice(3,5),16)/255, b=parseInt(hex.slice(5,7),16)/255;
  const max=Math.max(r,g,b), min=Math.min(r,g,b), d=max-min, l=(max+min)/2;
  if(!d||d/(l>0.5?2-max-min:max+min)<0.1) return 'Other';
  let h=0;
  if(max===r)      h=((g-b)/d+(g<b?6:0))/6;
  else if(max===g) h=((b-r)/d+2)/6;
  else             h=((r-g)/d+4)/6;
  h*=360;
  if(h<20||h>=330)      return 'Unavailable';
  if(h>=245&&h<330)     return 'Available';
  if(h>=170&&h<245)     return 'General';
  return 'Other';
}

function measureNameWidth(rows) {
  const probe=document.createElement('span');
  probe.style.cssText='position:fixed;visibility:hidden;white-space:nowrap;top:-999px;left:-999px;font-family:"Geist Mono","Geist",monospace;';
  document.body.appendChild(probe);
  let maxW=0;
  rows.forEach(row=>{
    const lines=(row.values[0]||'').split('\n').filter(l=>l.trim());
    (lines.length?lines:['—']).forEach((line,li)=>{
      const st=NAME_STYLES[Math.min(li,NAME_STYLES.length-1)];
      probe.style.fontSize=st.size; probe.style.fontWeight=st.weight;
      probe.textContent=line;
      maxW=Math.max(maxW,probe.getBoundingClientRect().width);
    });
  });
  document.body.removeChild(probe);
  return Math.min(Math.max(Math.ceil(maxW)+22,80),260);
}

window.addEventListener('DOMContentLoaded',async()=>{
  const hasCached=loadCache();
  $('main-view').style.cssText='display:flex;flex-direction:column;flex:1;overflow:hidden;';
  if(hasCached) render();
  if(!hasCached) showLoader('Connecting…');

  const { loggedIn } = await apiFetch('/api/me').catch(()=>({loggedIn:false}));
  S.loggedIn=loggedIn;

  if(loggedIn) {
    $('btn-auth').style.display='none';
    $('btn-out').style.display='inline-flex';
    $('conn-dot').className='dot ok';
    setWriteEnabled(true);
    if(!hasCached) await fetchData();
    else hideLoader();
  } else {
    hideLoader();
    setWriteEnabled(false);
    $('btn-auth').style.display='inline-flex';
    $('conn-dot').className='dot err';
    if(!hasCached) $('empty-state').style.display='flex';

    const p=new URLSearchParams(location.search);
    if(p.has('auth_error')) {
      toast('Sign in failed: ' + p.get('auth_error'), 'err');
      history.replaceState(null,'','/');
    }  }
});

async function apiFetch(url,opts={}) {
  const res=await fetch(url,{ credentials:'same-origin', headers:{'Content-Type':'application/json',...(opts.headers||{})}, ...opts });
  if(!res.ok) { const e=await res.json().catch(()=>({error:res.statusText})); throw new Error(e.error||res.statusText); }
  return res.json();
}

async function fetchData() {
  showLoader('Loading…');
  try {
    const data=await apiFetch('/api/data');
    S.headers=data.headers; S.sheetName=data.sheetName; S.sheetTitle=data.title;
    S.rows=data.rows.map(r=>({...r, cat:detectCat(r.hex)}));
    $('sheet-label').textContent=`${data.title} / ${data.sheetName}`;
    saveCache(); render();
    toast(`${S.rows.length} rows`,'ok');
  } catch(e) {
    toast('Error: '+e.message,'err');
    if(e.message==='Unauthorized') {
      S.loggedIn=false; setWriteEnabled(false);
      $('btn-auth').style.display='inline-flex';
      $('btn-out').style.display='none';
      $('conn-dot').className='dot err';
    }
  } finally { hideLoader(); }
}

let _st;
function debouncedSearch() {
  clearTimeout(_st); _st=setTimeout(()=>{
    const q=$('search').value;
    $('search-clear').classList.toggle('visible',q.length>0);
    if(q) {
      const ql=q.toLowerCase();
      CAT_ORDER.forEach(key=>{
        if(S.rows.some(r=>r.cat===key&&r.values.some(v=>v.toLowerCase().includes(ql))))
          if(!S.openGroups.has(key)) { S.openGroups.add(key); persistGroups(); }
      });
    }
    render();
  },150);
}
function clearSearch() {
  $('search').value=''; $('search-clear').classList.remove('visible'); render();
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

    const def=CAT[key], isOpen=S.openGroups.has(key);
    const nameW=measureNameWidth(catRows);

    const group=mk('div','group'+(isOpen?' open':''));
    group.dataset.key=key;

    const hdr=mk('div','group-header');
    hdr.innerHTML=`<span class="g-swatch" style="background:${def.color}"></span><span class="g-name">${def.label}</span><span class="g-count">${catRows.length}</span><span class="g-chev">›</span>`;
    hdr.addEventListener('click',()=>{ const o=group.classList.toggle('open'); o?S.openGroups.add(key):S.openGroups.delete(key); persistGroups(); });

    const body=mk('div','group-body');
    const list=mk('div','cards-list');

    if(S.headers.length>1) {
      const colHdr=mk('div','col-header');
      const hN=mk('div','col-hdr-name'); hN.style.width=nameW+'px';
      const hD=mk('div','col-hdr-data');
      S.headers.forEach((_,ci)=>{ if(ci===0) return; const c=mk('div','col-hdr-cell'); c.textContent=S.headers[ci]; hD.appendChild(c); });
      colHdr.append(hN,hD,mk('div','col-hdr-acts'));
      list.appendChild(colHdr);
    }

    catRows.forEach((row,i)=>{
      const card=mk('div','row-card');
      card.style.animationDelay=`${i*16}ms`;

      const nameCell=mk('div','name-cell');
      nameCell.style.width=nameW+'px';
      const lines=(row.values[0]||'—').split('\n').filter(l=>l.trim());
      (lines.length?lines:['—']).forEach((line,li)=>{
        const st=NAME_STYLES[Math.min(li,NAME_STYLES.length-1)];
        const el=document.createElement('span');
        el.className='name-line'; el.dir='rtl'; el.textContent=line;
        el.style.cssText=`font-size:${st.size};font-weight:${st.weight};color:${st.color}`;
        nameCell.appendChild(el);
      });

      const dataCells=mk('div','data-cells');
      S.headers.forEach((_,ci)=>{
        if(ci===0) return;
        const val=row.values[ci]||'';
        const cell=mk('div','data-cell');
        const valEl=mk('div','dc-val'+(val?'':' empty'));
        valEl.dir='rtl'; valEl.textContent=val||'—';
        if(val) valEl.addEventListener('click',()=>copyVal(valEl,val,row.values[0],S.headers[ci]));
        cell.appendChild(valEl); dataCells.appendChild(cell);
      });

      const acts=mk('div','row-acts');
      if(S.writeEnabled) acts.append(mkBtn('ghost icon','✎','Edit',()=>openEdit(row)), mkBtn('danger icon','✕','Delete',()=>openDel(row)));

      card.append(nameCell,dataCells,acts);
      list.appendChild(card);
    });

    body.appendChild(list); group.append(hdr,body); container.appendChild(group);
  });
}

function copyVal(el,val,fieldName,col) {
  navigator.clipboard.writeText(val).then(()=>{
    el.classList.add('copied'); setTimeout(()=>el.classList.remove('copied'),700);
    toast(`${fieldName} — ${col}`,'copy');
  }).catch(()=>toast('Copy failed','err'));
}

function buildPicker(selected) {
  S.editCat=selected;
  return `<div class="field"><label>Category</label><div class="cat-picker" id="cat-picker">${
    CAT_ORDER.map(k=>{ const on=k===selected; return `<button type="button" class="cat-btn${on?' sel':''}" data-cat="${k}" style="${on?`border-color:${CAT[k].color};color:${CAT[k].color}`:''}">${CAT[k].label}</button>`; }).join('')
  }</div></div>`;
}
function attachPicker() {
  document.querySelectorAll('#cat-picker .cat-btn').forEach(b=>b.addEventListener('click',()=>{
    S.editCat=b.dataset.cat;
    document.querySelectorAll('#cat-picker .cat-btn').forEach(x=>{
      const on=x.dataset.cat===S.editCat;
      x.className='cat-btn'+(on?' sel':''); x.style.borderColor=on?CAT[x.dataset.cat].color:''; x.style.color=on?CAT[x.dataset.cat].color:'';
    });
  }));
}

function openAdd() {
  if(!S.writeEnabled) return;
  S.editRow=null; S.editCat='General';
  $('modal-title').textContent='Add row';
  $('modal-fields').innerHTML=buildPicker('General')+S.headers.map((h,i)=>
    `<div class="field"><label>${xe(h)}</label><textarea id="f${i}" dir="rtl" rows="2" placeholder="—" autocomplete="new-password" spellcheck="false"></textarea></div>`
  ).join('');
  attachPicker();
  open_('edit-overlay');
  setTimeout(()=>{ S.headers.forEach((_,i)=>{ const el=$('f'+i); if(el) el.value=''; }); $('f0')?.focus(); },60);
}

function openEdit(row) {
  if(!S.writeEnabled) return;
  S.editRow=row; S.editCat=row.cat;
  $('modal-title').textContent='Edit row';
  $('modal-fields').innerHTML=buildPicker(row.cat)+S.headers.map((h,i)=>
    `<div class="field"><label>${xe(h)}</label><textarea id="f${i}" dir="rtl" rows="2" placeholder="—" autocomplete="new-password" spellcheck="false">${xe(row.values[i]||'')}</textarea></div>`
  ).join('');
  attachPicker();
  open_('edit-overlay');
  setTimeout(()=>$('f0')?.focus(),60);
}

async function saveRow() {
  const vals=S.headers.map((_,i)=>$('f'+i)?.value||'');
  const cat=S.editCat, rgb=CAT[cat].rgb;
  const hex='#'+rgb.map(v=>v.toString(16).padStart(2,'0')).join('');
  close_('edit-overlay');
  try {
    if(!S.editRow) {
      const { sheetRow }=await apiFetch('/api/rows',{ method:'POST', body:JSON.stringify({ sheetName:S.sheetName, values:vals, rgb }) });
      S.rows.push({ values:vals, hex, cat, sheetRow });
      toast('Row added','ok');
    } else {
      await apiFetch('/api/rows',{ method:'PATCH', body:JSON.stringify({ sheetName:S.sheetName, sheetRow:S.editRow.sheetRow, values:vals, rgb, catChanged:cat!==S.editRow.cat }) });
      const idx=S.rows.indexOf(S.editRow);
      if(idx>=0) S.rows[idx]={...S.editRow,values:vals,hex,cat};
      toast('Row updated','ok');
    }
    saveCache(); render();
  } catch(e) { toast('Save failed: '+e.message,'err'); }
}

function openDel(row) { if(!S.writeEnabled) return; S.delRow=row; open_('del-overlay'); }

async function confirmDelete() {
  const row=S.delRow; close_('del-overlay');
  try {
    await apiFetch('/api/rows',{ method:'DELETE', body:JSON.stringify({ sheetRow:row.sheetRow }) });
    S.rows.splice(S.rows.indexOf(row),1);
    S.rows.forEach(r=>{ if(r.sheetRow>row.sheetRow) r.sheetRow--; });
    saveCache(); render();
    toast('Row deleted','ok');
  } catch(e) { toast('Delete failed: '+e.message,'err'); }
}

document.addEventListener('keydown',e=>{
  if(e.key==='Escape') { close_('edit-overlay'); close_('del-overlay'); }
  if((e.metaKey||e.ctrlKey)&&e.key==='k') { e.preventDefault(); $('search')?.focus(); }
  if((e.metaKey||e.ctrlKey)&&e.key==='n') { e.preventDefault(); openAdd(); }
});
document.querySelectorAll('.overlay').forEach(ov=>ov.addEventListener('click',e=>{ if(e.target===ov) ov.classList.remove('open'); }));
