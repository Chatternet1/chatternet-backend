<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>Chatternet — Admin</title>
<meta name="viewport" content="width=device-width, initial-scale=1" />
<style>
  :root{
    --brand:#3498db; --brand-2:#2980b9; --bg:#f5f7fb; --card:#fff;
    --ink:#0f172a; --muted:#667085; --line:#e6eaf2;
    /* updated at runtime so nav clears the fixed blue bar */
    --ct-bluebar-h: 60px;
  }
  *{box-sizing:border-box}
  html,body{max-width:100%;overflow-x:hidden}
  body{
    margin:0;
    background:var(--bg);
    color:var(--ink);
    font-family:'Segoe UI',Arial,sans-serif;
    padding-top:0; /* footer script manages spacing for the fixed bar */
  }

  /* Blue header (footer will apply .ct-fix-bluebar and insert a spacer) */
  .top-bar{
    position:relative;
    z-index:40;
    display:flex;justify-content:space-between;align-items:center;
    padding:10px 14px;background:var(--brand);color:#fff;box-shadow:0 2px 8px rgba(0,0,0,.2);
    margin:0;
  }
  .top-bar h2{margin:0;font-weight:800;letter-spacing:.2px}
  .top-actions{display:flex;gap:8px;align-items:center;flex-wrap:wrap}
  .top-actions .btn{
    background:#fff;color:#000;border:none;padding:8px 10px;border-radius:10px;cursor:pointer;font-size:13px;
    text-decoration:none;display:inline-block;font-weight:600
  }
  .top-actions .btn:hover{background:#eef4ff}
  .top-actions img{width:36px;height:36px;border-radius:50%;border:2px solid rgba(255,255,255,.85);object-fit:cover;cursor:pointer}

  /* Groups-style nav
     - default margin works when the bar is not fixed
     - when footer fixes the bar, we add .ct-bluebar-fixed to body and use the measured height */
  .nav{
    position:relative; z-index:35;
    display:flex; gap:10px; flex-wrap:wrap;
    padding:8px 12px; background:#e9f2ff; border-bottom:1px solid #d7e6ff;
    margin:10px 0 12px;
  }
  .ct-bluebar-fixed .nav{
    margin-top: calc(var(--ct-bluebar-h, 60px) + 8px); /* always clear the fixed bar */
  }
  .nav a{color:#0b3a67; text-decoration:none; font-weight:600}
  .nav a:hover{text-decoration:underline}

  /* Page wrap */
  .wrap{max-width:1120px;margin:18px auto;padding:0 12px 28px}

  /* Tabs */
  .tabs{display:flex; gap:8px; flex-wrap:wrap; margin:0 0 10px}
  .tab{
    background:#fff; border:1px solid #d7d7d7; color:#0f172a;
    padding:8px 12px; border-radius:10px; cursor:pointer; font-weight:600; font-size:14px
  }
  .tab.active{ background:#e9f2ff; border-color:#b9d6ff; color:#0b63c5 }
  .panels{ position:relative; z-index:1 }
  .panel{ display:none }
  .panel.active{ display:block }

  /* Card */
  .card{
    background:var(--card); border:1px solid rgba(0,0,0,.08);
    border-radius:14px; box-shadow:0 6px 16px rgba(0,0,0,.08);
    padding:14px
  }

  .row{display:flex;gap:8px;flex-wrap:wrap;align-items:center}
  .muted{color:var(--muted)}
  .pill{border:1px solid #d7d7d7;border-radius:999px;padding:6px 10px;background:#fff}
  .btn{padding:8px 10px;border:1px solid #cbd5e1;border-radius:10px;background:#fff;cursor:pointer}
  .btn.primary{background:var(--brand);border-color:var(--brand);color:#fff}
  .btn.primary:hover{background:var(--brand-2)}
  .btn.bad{background:#fee2e2;border-color:#fecaca;color:#991b1b}
  input,select,textarea{width:100%;padding:10px 12px;border:1px solid #d7d7d7;border-radius:10px;font-size:14px}
  textarea{min-height:120px;resize:vertical}

  /* Lists */
  .list{display:flex;flex-direction:column;gap:10px; margin-top:10px}
  .item{
    display:flex; gap:10px; align-items:flex-start;
    border:1px solid #e6eaf2; background:#fff; border-radius:12px; padding:10px
  }
  .ava{width:40px;height:40px;border-radius:50%;object-fit:cover;border:1px solid #e5e7eb}
  .title{font-weight:800;margin:0 0 4px}
  .meta{color:#6b7280;font-size:12px}
  .pill.warn{background:#fff7ed;border-color:#ffedd5;color:#b45309}

  /* Modals (high z so they appear above everything) */
  .modalbg{position:fixed;inset:0;background:rgba(0,0,0,.45);display:none;align-items:center;justify-content:center;z-index:2147483000}
  .sheet{background:#fff;border-radius:12px;max-width:520px;width:92%;max-height:80vh;overflow:auto;box-shadow:0 10px 30px rgba(0,0,0,.3);padding:16px}
</style>
</head>
<body>

<!-- Blue header -->
<div class="top-bar">
  <h2>Admin</h2>
  <div class="top-actions">
    <button class="btn" id="btnNotif">Notifications</button>
    <button class="btn" id="btnInbox">Inbox</button>
    <button class="btn" id="btnMsgs">Messages</button>
    <img id="meAvatar" alt="Me" />
  </div>
</div>

<!-- Groups-style nav (must show directly under the blue bar) -->
<div class="nav">
  <a href="index.html">Home</a>
  <a href="feed.html">Feed</a>
  <a href="friends.html">Friends</a>
  <a href="chattermarket.html">Market</a>
  <a href="groups.html">Groups</a>
  <a href="events.html">Events</a>
  <a href="media.html">Media</a>
  <a href="dating.html">Dating</a>
  <a href="blogs.html">Blogs</a>
  <a href="polls.html">Polls</a>
  <a href="music.html">Music</a>
  <a href="messages.html">Messages</a>
  <a href="profile.html">Profile</a>
  <a href="settings.html">Settings</a>
</div>

<div class="wrap">

  <!-- Tabs -->
  <div id="tabs" class="tabs">
    <button class="tab active" data-tab="users">Users</button>
    <button class="tab" data-tab="content">Content</button>
    <button class="tab" data-tab="broadcast">Broadcast</button>
    <button class="tab" data-tab="tools">Tools</button>
  </div>

  <div class="panels">

    <!-- Users -->
    <section id="p-users" class="panel active card">
      <div class="row" style="justify-content:space-between">
        <div class="muted"><strong id="uCount">0</strong> users</div>
        <div class="row" style="flex:1">
          <input id="uSearch" placeholder="Search users…">
          <button class="btn" id="uAdd">Add user</button>
        </div>
      </div>
      <div id="uList" class="list"></div>
    </section>

    <!-- Content -->
    <section id="p-content" class="panel card">
      <div class="row" style="justify-content:space-between">
        <div class="row">
          <label class="muted">Type</label>
          <select id="cType" style="width:200px">
            <option value="all">All</option>
            <option value="global">Global feed</option>
            <option value="dating">Dating</option>
            <option value="unknown">Other buckets</option>
            <option value="archive">Archive</option>
          </select>
        </div>
        <div class="row" style="flex:1 1 auto">
          <input id="cSearch" placeholder="Search title/content/author…">
          <div class="muted"><strong id="cCount">0</strong> items</div>
        </div>
      </div>
      <div id="cList" class="list"></div>
    </section>

    <!-- Broadcast -->
    <section id="p-broadcast" class="panel card">
      <h3 class="title" style="margin:0 0 8px">Send site-wide notice</h3>
      <div class="row">
        <input id="bTitle" placeholder="Title (optional)">
      </div>
      <div class="row">
        <textarea id="bBody" placeholder="Write the announcement…"></textarea>
      </div>
      <div class="row" style="justify-content:flex-end">
        <button id="bSend" class="btn primary">Send</button>
      </div>
      <div class="muted" id="bStatus" style="margin-top:6px"></div>
    </section>

    <!-- Tools -->
    <section id="p-tools" class="panel card">
      <div class="row" style="flex-wrap:wrap">
        <button id="tExport" class="btn">Export data</button>
        <button id="tRebuild" class="btn">Re-seed demo users</button>
        <button id="tWipe" class="btn bad">Wipe local data (this device)</button>
      </div>
      <div class="muted" style="margin-top:8px">
        Tip: Wipe affects only this browser/device. Export before making big changes.
      </div>
    </section>

  </div>
</div>

<!-- Notifications / Inbox -->
<div class="modalbg" id="notifBg">
  <div class="sheet">
    <h3 style="margin:0 0 10px">Notifications</h3>
    <div id="notifList"></div>
    <div class="row" style="margin-top:8px">
      <button id="clearNotif" class="btn primary">Clear</button>
      <button id="closeNotif" class="btn">Close</button>
    </div>
  </div>
</div>
<div class="modalbg" id="inboxBg">
  <div class="sheet">
    <h3 style="margin:0 0 10px">Inbox</h3>
    <div id="inboxList"></div>
    <div class="row" style="margin-top:8px">
      <button id="closeInbox" class="btn">Close</button>
    </div>
  </div>
</div>

<!-- Add user modal -->
<div class="modalbg" id="addUserBg">
  <div class="sheet">
    <h3 style="margin:0 0 10px">Add user</h3>
    <div class="row"><input id="addUserName" placeholder="Name"></div>
    <div class="row"><input id="addUserAvatar" placeholder="Avatar URL (optional)"></div>
    <div class="row" style="justify-content:flex-end">
      <button class="btn" id="addUserClose">Cancel</button>
      <button class="btn primary" id="addUserGo">Add</button>
    </div>
  </div>
</div>

<!-- ===== Admin logic ===== -->
<script>
/* === Keys & helpers === */
const LS = {
  USERS:'ct_users_v3', PROFILE:'ct_profile_data_v1', ROLES:'ct_roles_v1',
  BLOCK:'ct_blocked_users_v1', NOTIF:'ct_notifications_v1', INBOX:'ct_inbox_v1',
  PRIV:'ct_privacy_prefs_v1', NOTIFP:'ct_notify_prefs_v1',
  DATING:'ct_dating_posts_v2', GLOBAL:'ct_global_feed_v1', ARCHIVE:'ct_removed_content_v1'
};
const $=s=>document.querySelector(s), $$=s=>Array.from(document.querySelectorAll(s));
const load=(k,f)=>{ try{const v=localStorage.getItem(k);return v?JSON.parse(v):f;}catch{return f;} };
const save=(k,v)=>localStorage.setItem(k,JSON.stringify(v));
const nowISO=()=>new Date().toISOString();
const uid=(p='id')=>p+'_'+Date.now().toString(36)+'_'+Math.random().toString(36).slice(2,7);
const esc=s=>String(s||'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'","&#39;");
const face=n=>`https://i.pravatar.cc/100?u=${encodeURIComponent(n||'me')}`;

function addNotif(t){ const a=load(LS.NOTIF,[]); a.unshift({id:uid('n'),text:t,time:nowISO()}); save(LS.NOTIF,a); }
function addInbox(t){ const a=load(LS.INBOX,[]); a.unshift({id:uid('m'),text:t,time:nowISO()}); save(LS.INBOX,a); }

/* seed baseline users once */
(function seed(){
  let users=load(LS.USERS,null);
  if(!users || !Array.isArray(users) || users.length<1){
    users=[{name:'Me',avatar:face('Me')}];
    ['Grace Lee','Liam Adams','Ava Morgan','Noah Walker','Sophia Turner','Mason Hill','Emma Davis','Ethan Brooks',
     'Olivia Perez','Logan Price','Mia Carter','Lucas Reed','Chloe Evans','Henry Scott','Amelia Ross','Elijah Gray',
     'Isabella Wood','James Hall','Luna Kelly','Benjamin Ward','Aria King','Michael Reed','Kate White','Bill Thomas']
     .forEach(n=>users.push({name:n,avatar:face(n)}));
    save(LS.USERS,users);
  }
  const roles=load(LS.ROLES,{});
  if(!Object.values(roles).includes('admin')){ roles['Me']='admin'; save(LS.ROLES,roles); }
})();

/* header wiring (avatar + modals + messages) */
(function header(){
  const prof=(load(LS.PROFILE,{}))['Me']||{};
  const img=$('#meAvatar'); if(img){ img.referrerPolicy='no-referrer';
    img.src=prof.avatar||prof.avatarUrl||prof.photo||face('Me');
    img.onclick=()=>{ try{localStorage.setItem('ct_profile_view_v1',JSON.stringify({name:'Me'}));}catch{} location.href='profile.html'; };
  }

  // Messages overlay
  $('#btnMsgs')?.addEventListener('click',e=>{
    e.preventDefault();
    if(window.ctOpen) return ctOpen();
    if(window.ChatternetMessenger?.open) return window.ChatternetMessenger.open();
    location.href='messages.html';
  });

  // Notif/Inbox modals
  const nbg=$('#notifBg'), ibg=$('#inboxBg');
  function rN(){ const arr=load(LS.NOTIF,[]); const box=$('#notifList');
    box.innerHTML=arr.length?arr.map(n=>`<div class="pill" style="display:block">${new Date(n.time).toLocaleString()} — ${esc(n.text||'')}</div>`).join(''):'No notifications yet.'; }
  function rI(){ const arr=load(LS.INBOX,[]); const box=$('#inboxList');
    box.innerHTML=arr.length?arr.map(n=>`<div class="pill" style="display:block">${new Date(n.time).toLocaleString()} — ${esc(n.text||'')}</div>`).join(''):'Inbox is empty.'; }
  $('#btnNotif').onclick=()=>{ rN(); nbg.style.display='flex'; };
  $('#clearNotif').onclick=()=>{ save(LS.NOTIF,[]); rN(); };
  $('#closeNotif').onclick=()=>{ nbg.style.display='none'; };
  $('#btnInbox').onclick=()=>{ rI(); ibg.style.display='flex'; };
  $('#closeInbox').onclick=()=>{ ibg.style.display='none'; };
})();

/* permission gate (hide UI if not admin) */
function myRole(){ return load(LS.ROLES,{})['Me'] || 'user'; }

/* Tabs */
$('#tabs')?.addEventListener('click',e=>{
  const t=e.target.closest('.tab'); if(!t) return;
  $$('.tab').forEach(x=>x.classList.toggle('active',x===t));
  $$('.panel').forEach(p=>p.classList.toggle('active', p.id==='p-'+t.dataset.tab));
});

/* Users */
function users(){ return load(LS.USERS,[]); }
function roles(){ return load(LS.ROLES,{}); }
function setRole(name, role){ const r=roles(); r[name]=role; save(LS.ROLES,r); }
function blocked(){ return new Set(load(LS.BLOCK,[])); }
function toggleBlock(name){ const s=blocked(); s.has(name)?s.delete(name):s.add(name); save(LS.BLOCK,Array.from(s)); }

function banUser(name){
  const s=blocked(); s.add(name); save(LS.BLOCK,Array.from(s));
  if(name!=='Me'){
    const arr=users().filter(u=>u.name!==name);
    save(LS.USERS, arr);
  }
  addNotif(`Admin banned ${name}`);
}

function removeUser(name){
  if(name==='Me') return alert('Cannot remove yourself.');
  const arr=users().filter(u=>u.name!==name);
  save(LS.USERS, arr);
  addNotif(`Admin removed ${name}`);
}

function getAva(name){
  const prof=load(LS.PROFILE,{})[name];
  if(prof && (prof.avatar||prof.avatarUrl||prof.photo)) return prof.avatar||prof.avatarUrl||prof.photo;
  const u=users().find(x=>x.name===name); if(u?.avatar) return u.avatar;
  return face(name);
}

function renderUsers(){
  const list=$('#uList'); if(!list) return;
  list.innerHTML='';
  const q=($('#uSearch')?.value||'').toLowerCase();
  const rs=roles(); const bl=blocked();
  const all=users().filter(u=>!q || String(u.name).toLowerCase().includes(q));
  $('#uCount').textContent=String(all.length);

  all.forEach(u=>{
    const row=document.createElement('div'); row.className='item';
    row.innerHTML=`
      <img class="ava" src="${esc(getAva(u.name))}" alt="">
      <div style="flex:1;min-width:0">
        <div class="title">${esc(u.name)} ${u.name==='Me'?'<span class="pill">You</span>':''}</div>
        <div class="meta">Role:
          <select data-role style="width:auto;margin-left:6px">
            <option value="user">User</option>
            <option value="mod">Moderator</option>
            <option value="admin">Admin</option>
          </select>
          ${bl.has(u.name)?'<span class="pill warn" style="margin-left:6px">blocked</span>':''}
        </div>
      </div>
      <div class="row" style="flex:0 0 auto;gap:6px">
        <button class="btn" data-profile>Profile</button>
        <button class="btn" data-msg>Message</button>
        <button class="btn" data-block>${bl.has(u.name)?'Unblock':'Block'}</button>
        <button class="btn bad" data-ban>Ban</button>
        <button class="btn bad" data-remove>Remove</button>
      </div>`;
    row.querySelector('[data-role]').value = rs[u.name] || 'user';
    row.querySelector('[data-role]').onchange = (e)=>{ setRole(u.name,e.target.value); addNotif(`Role for ${u.name} set to ${e.target.value}`); };

    row.querySelector('[data-profile]').onclick=()=>{ try{localStorage.setItem('ct_profile_view_v1',JSON.stringify({name:u.name}));}catch{} location.href='profile.html'; };
    row.querySelector('[data-msg]').onclick=()=>{ if(window.ctMessage) ctMessage(u.name); else location.href='messages.html'; };
    row.querySelector('[data-block]').onclick=()=>{ toggleBlock(u.name); renderUsers(); };
    row.querySelector('[data-ban]').onclick=()=>{ if(confirm(`Ban ${u.name}? This blocks and removes them.`)){ banUser(u.name); renderUsers(); } };
    row.querySelector('[data-remove]').onclick=()=>{ if(confirm(`Remove ${u.name} from your network?`)){ removeUser(u.name); renderUsers(); } };

    list.appendChild(row);
  });
}
$('#uSearch')?.addEventListener('input', renderUsers);
$('#uAdd')?.addEventListener('click', ()=>{ $('#addUserBg').style.display='flex'; });
$('#addUserClose')?.addEventListener('click', ()=>{ $('#addUserBg').style.display='none'; });
$('#addUserGo')?.addEventListener('click', ()=>{
  const name=($('#addUserName')?.value||'').trim(); if(!name) return alert('Enter a name');
  const avatar=($('#addUserAvatar')?.value||'').trim()||face(name);
  const all=users(); if(all.find(u=>u.name===name)) return alert('User exists');
  all.push({name,avatar}); save(LS.USERS,all);
  $('#addUserName').value=''; $('#addUserAvatar').value=''; $('#addUserBg').style.display='none';
  addNotif(`Admin added user: ${name}`); renderUsers();
});

/* Content */
function ensureShape(p){
  return { id:p.id||uid('post'), title:p.title||'', content:p.content||p.text||p.body||'',
    authorName:p.authorName||p.author||p.name||'Me', createdAt:p.createdAt||p.time||p.date||nowISO(),
    media:p.media||null, _raw:p };
}
function scanContent(){
  const out=[];
  const dating=(load(LS.DATING,[])||[]).map(x=>({...ensureShape(x),_type:'dating',_key:LS.DATING}));
  const global=(load(LS.GLOBAL,[])||[]).map(x=>({...ensureShape(x),_type:'global',_key:LS.GLOBAL}));
  out.push(...dating,...global);
  for(let i=0;i<localStorage.length;i++){
    const k=localStorage.key(i);
    if(!k || [LS.DATING,LS.GLOBAL,LS.NOTIF,LS.INBOX,LS.PROFILE,LS.USERS,LS.ROLES,LS.BLOCK,LS.PRIV,LS.NOTIFP,LS.ARCHIVE].includes(k)) continue;
    try{
      const v=JSON.parse(localStorage.getItem(k));
      if(Array.isArray(v) && v.length && typeof v[0]==='object'){
        const normalized=v.map(o=>({...ensureShape(o),_type:'unknown',_key:k}));
        if(normalized.some(n=>n.title||n.content)) out.push(...normalized);
      }
    }catch{}
  }
  return out;
}
function archiveList(){ return load(LS.ARCHIVE,[]); }
function setArchive(arr){ save(LS.ARCHIVE,arr); }
function removeFromKey(key,id){
  const arr=load(key,[]); const idx=arr.findIndex(x=>(x.id||'')===id);
  if(idx>-1){ const [del]=arr.splice(idx,1); save(key,arr);
    const ar=archiveList(); ar.unshift({deletedAt:nowISO(),key,item:del}); setArchive(ar);
  }
}
function hideInKey(key,id,setHidden){
  const arr=load(key,[]); const idx=arr.findIndex(x=>(x.id||'')===id);
  if(idx>-1){ arr[idx].hidden=setHidden; save(key,arr); }
}
function shareToGlobal(item){
  const g=load(LS.GLOBAL,[]); const id=item.id||uid('g');
  if(!g.find(p=>p.id===id)){
    g.unshift({id,title:item.title||'',content:item.content||'',authorName:item.authorName||'Me',
      createdAt:item.createdAt||nowISO(),media:item.media||null,tags:[]});
    save(LS.GLOBAL,g);
  }
}
function renderContent(){
  const type=$('#cType')?.value||'all';
  const q=($('#cSearch')?.value||'').toLowerCase();
  const arc=archiveList().map(a=>({...ensureShape(a.item||{}),_type:'archive',_key:a.key||'unknown',_deletedAt:a.deletedAt}));
  let items= (type==='archive' ? arc : scanContent().filter(x=>type==='all'||x._type===type));
  items=items.filter(x=>!q || String(x.title).toLowerCase().includes(q) || String(x.content).toLowerCase().includes(q) || String(x.authorName).toLowerCase().includes(q));
  $('#cCount').textContent=String(items.length);
  const box=$('#cList'); box.innerHTML='';
  if(!items.length){ box.innerHTML='<div class="muted">No content found.</div>'; return; }

  items.sort((a,b)=>new Date(b.createdAt)-new Date(a.createdAt)).forEach(p=>{
    const row=document.createElement('div'); row.className='item';
    const ava=(load(LS.PROFILE,{})[p.authorName]?.avatar)||face(p.authorName);
    row.innerHTML=`
      <img class="ava" src="${esc(ava)}" alt="">
      <div style="flex:1;min-width:0">
        <div class="title">${esc(p.title||'(no title)')}</div>
        <div class="meta">${esc(p.authorName)} • ${new Date(p.createdAt).toLocaleString()} •
          <span class="${p._type==='archive'?'bad':'muted'}">${p._type}</span>
          ${p._raw?.hidden?'<span class="pill warn">hidden</span>':''}
        </div>
        <div style="margin-top:6px">${esc((p.content||'').slice(0,220))}${(p.content||'').length>220?'…':''}</div>
      </div>
      <div class="row" style="flex:0 0 auto;gap:6px">
        <button class="btn" data-profile="${esc(p.authorName)}">Profile</button>
        ${p._type!=='archive'
          ? `<button class="btn" data-hide data-id="${p.id}" data-key="${p._key}">${p._raw?.hidden?'Unhide':'Hide'}</button>
             <button class="btn primary" data-share data-id="${p.id}">Share → Feed</button>
             <button class="btn bad" data-del data-id="${p.id}" data-key="${p._key}">Delete</button>`
          : `<button class="btn" disabled title="Restore not implemented yet">Restore (coming)</button>`}
      </div>`;
    row.querySelector('[data-profile]')?.addEventListener('click',e=>{
      const name=e.currentTarget.getAttribute('data-profile');
      try{ localStorage.setItem('ct_profile_view_v1',JSON.stringify({name})); }catch{} location.href='profile.html';
    });
    row.querySelector('[data-share]')?.addEventListener('click',()=>{ shareToGlobal(p); addNotif(`Shared to Feed: ${p.title||'(untitled)'}`); alert('Shared to Global Feed'); });
    row.querySelector('[data-del]')?.addEventListener('click',e=>{
      const key=e.currentTarget.getAttribute('data-key'); if(!confirm('Delete this item? It will move to Archive.')) return;
      removeFromKey(key,p.id); renderContent();
    });
    row.querySelector('[data-hide]')?.addEventListener('click',e=>{
      const key=e.currentTarget.getAttribute('data-key'); hideInKey(key,p.id,!p._raw?.hidden); renderContent();
    });
    box.appendChild(row);
  });
}
$('#cType')?.addEventListener('change', renderContent);
$('#cSearch')?.addEventListener('input', renderContent);

/* Broadcast */
$('#bSend')?.addEventListener('click',()=>{
  const title=$('#bTitle')?.value.trim()||'';
  const body=$('#bBody')?.value.trim()||'';
  if(!title && !body) return ($('#bStatus').textContent='Add a title or content.');
  const msg = title? `${title} — ${body}` : body;
  addNotif(`[ADMIN] ${msg}`); addInbox(`[ADMIN] ${msg}`); $('#bStatus').textContent='Sent';
});

/* Tools */
$('#tExport')?.addEventListener('click',()=>{
  const dump={
    users:load(LS.USERS,[]), roles:load(LS.ROLES,{}), blocked:load(LS.BLOCK,[]),
    profile:load(LS.PROFILE,{}), privacy:load(LS.PRIV,{}), notifyPrefs:load(LS.NOTIFP,{}),
    notifications:load(LS.NOTIF,[]), inbox:load(LS.INBOX,[]), dating:load(LS.DATING,[]),
    global:load(LS.GLOBAL,[]), archive:load(LS.ARCHIVE,[])
  };
  const blob=new Blob([JSON.stringify(dump,null,2)],{type:'application/json'});
  const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download='chatternet-admin-export.json'; a.click();
});
$('#tRebuild')?.addEventListener('click',()=>{
  if(!confirm('Re-seed demo users?')) return;
  const u=[{name:'Me',avatar:face('Me')}];
  ['Grace Lee','Liam Adams','Ava Morgan','Noah Walker','Sophia Turner','Mason Hill','Emma Davis','Ethan Brooks',
   'Olivia Perez','Logan Price','Mia Carter','Lucas Reed','Chloe Evans','Henry Scott','Amelia Ross','Elijah Gray',
   'Isabella Wood','James Hall','Luna Kelly','Benjamin Ward','Aria King','Michael Reed','Kate White','Bill Thomas']
   .forEach(n=>u.push({name:n,avatar:face(n)}));
  save(LS.USERS,u); addNotif('Demo users re-seeded.'); renderUsers();
});
$('#tWipe')?.addEventListener('click',()=>{
  if(!confirm('This clears local data on THIS device (users, roles, posts, prefs). Continue?')) return;
  Object.values(LS).concat(['ct_profile_view_v1']).forEach(k=>localStorage.removeItem(k));
  alert('Cleared. Reloading…'); location.reload();
});

/* Safety: keep nav below fixed blue bar (works with your OLD footer) */
(function keepNavBelowBar(){
  const bar=document.querySelector('.top-bar');
  if(!bar) return;
  function update(){
    const h=Math.max(0,Math.round(bar.getBoundingClientRect().height||60));
    document.documentElement.style.setProperty('--ct-bluebar-h', h+'px');
    document.body.classList.toggle('ct-bluebar-fixed', bar.classList.contains('ct-fix-bluebar'));
  }
  // initial + follow-ups
  update();
  window.addEventListener('resize', update, {passive:true});
  // watch for the footer adding/removing .ct-fix-bluebar
  const mo=new MutationObserver(update);
  mo.observe(bar,{attributes:true,attributeFilter:['class']});
  // fonts can change height
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(update).catch(()=>{});
  setTimeout(update,150); setTimeout(update,400); setTimeout(update,900);
})();

/* boot */
(function boot(){
  if(myRole()!=='admin'){ alert('This area is restricted to admins.'); return; }
  renderUsers(); renderContent();
})();
</script>

</body>
</html>
