<script>
/* --- Hard guard against blank page --- */
(function () {
  function show(msg){
    var o=document.getElementById('errOv');
    var t=document.getElementById('errText');
    if(!o||!t) return;
    t.textContent=String(msg||'Unknown');
    o.style.display='flex';
  }
  window.addEventListener('error', function(e){
    show(e.error ? (e.error.stack||e.error.message||e.message) : e.message);
  });
  window.addEventListener('unhandledrejection', function(e){
    var r=e.reason; show(r && (r.stack||r.message||String(r)));
  });
})();

/* ===== Core keys & helpers (match your stack) ===== */
var LS = {
  USERS:'ct_users_v3', PROFILE:'ct_profile_data_v1', ROLES:'ct_roles_v1', BLOCK:'ct_blocked_users_v1',
  NOTIF:'ct_notifications_v1', INBOX:'ct_inbox_v1', PRIV:'ct_privacy_prefs_v1', NOTIFP:'ct_notify_prefs_v1',
  DATING:'ct_dating_posts_v2', GLOBAL:'ct_global_feed_v1', ARCHIVE:'ct_removed_content_v1', THREADS:'ct_threads_v3'
};
function $(s,el){return (el||document).querySelector(s);}
function $all(s,el){return Array.prototype.slice.call((el||document).querySelectorAll(s));}
function load(k,f){try{var v=localStorage.getItem(k);return v?JSON.parse(v):f;}catch(_){return f;}}
function save(k,v){localStorage.setItem(k,JSON.stringify(v));}
function nowISO(){return new Date().toISOString();}
function uid(p){p=p||'id';return p+'_'+Date.now().toString(36)+'_'+Math.random().toString(36).slice(2,7);}
function esc(s){s=String(s||'');return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');}
function face(n){return 'https://i.pravatar.cc/100?u='+encodeURIComponent(n||'me');}
function addNotif(t){var a=load(LS.NOTIF,[]);a.unshift({id:uid('n'),text:t,time:nowISO()});save(LS.NOTIF,a);}
function addInbox(t){var a=load(LS.INBOX,[]);a.unshift({id:uid('m'),text:t,time:nowISO()});save(LS.INBOX,a);}

/* ===== Seed users if missing ===== */
(function seed(){
  var users=load(LS.USERS,null);
  if(!users || !Array.isArray(users) || users.length<1){
    users=[{name:'Me',avatar:face('Me')}];
    var demo=['Grace Lee','Liam Adams','Ava Morgan','Noah Walker','Sophia Turner','Mason Hill','Emma Davis','Ethan Brooks','Olivia Perez','Logan Price','Mia Carter','Lucas Reed','Chloe Evans','Henry Scott','Amelia Ross','Elijah Gray','Isabella Wood','James Hall','Luna Kelly','Benjamin Ward','Aria King','Michael Reed','Kate White','Bill Thomas'];
    demo.forEach(function(n){ users.push({name:n,avatar:face(n)}); });
    save(LS.USERS,users);
  }
  var roles=load(LS.ROLES,{});
  if(!roles['Me']){ roles['Me']='admin'; save(LS.ROLES,roles); }
})();

/* ===== Header & modals ===== */
(function header(){
  var meImg = document.getElementById('meAvatar') || document.getElementById('myProfile');
  var profMe = (load(LS.PROFILE,{}))['Me'] || {};
  if(meImg){
    meImg.src = profMe.avatar || profMe.avatarUrl || profMe.photo || face('Me');
    meImg.alt = profMe.displayName || 'Me';
    meImg.onclick = function(){
      try{ localStorage.setItem('ct_profile_view_v1', JSON.stringify({name:'Me'})); }catch(_){}
      location.href='profile.html';
    };
  }

  var btnMsgs=document.getElementById('btnMsgs');
  if(btnMsgs){ btnMsgs.addEventListener('click', function(e){ e.preventDefault(); if(window.ctOpen) ctOpen(); else location.href='messages.html'; }); }

  var nbg=$('#notifBg'), nlist=$('#notifList');
  function rN(){
    var arr=load(LS.NOTIF,[]);
    nlist.innerHTML = arr.length
      ? arr.map(function(n){ return '<div class="item"><div class="title">'+new Date(n.time).toLocaleString()+'</div><div>'+esc(n.text)+'</div></div>'; }).join('')
      : '<div class="muted">No notifications.</div>';
  }
  var bn=$('#btnNotif'), cn=$('#clearNotif'), xn=$('#closeNotif');
  if(bn) bn.onclick=function(){ rN(); if(nbg) nbg.style.display='flex'; };
  if(cn) cn.onclick=function(){ save(LS.NOTIF,[]); rN(); };
  if(xn) xn.onclick=function(){ if(nbg) nbg.style.display='none'; };

  var ibg=$('#inboxBg'), ilist=$('#inboxList');
  function rI(){
    var arr=load(LS.INBOX,[]);
    ilist.innerHTML = arr.length
      ? arr.map(function(n){ return '<div class="item"><div class="title">'+new Date(n.time).toLocaleString()+'</div><div>'+esc(n.text)+'</div></div>'; }).join('')
      : '<div class="muted">Inbox empty.</div>';
  }
  var bi=$('#btnInbox'), xi=$('#closeInbox');
  if(bi) bi.onclick=function(){ rI(); if(ibg) ibg.style.display='flex'; };
  if(xi) xi.onclick=function(){ if(ibg) ibg.style.display='none'; };
})();

/* ===== Permission gate ===== */
function myRole(){ var r=load(LS.ROLES,{}); return r['Me']||'user'; }
function ensureAdmin(){
  if(myRole()!=='admin'){
    var g=$('#guard'), a=$('#app');
    if(g) g.style.display='block';
    if(a) a.style.display='none';
    return false;
  }
  return true;
}

/* ===== Tabs (robust: .tab or [data-tab]) ===== */
(function(){
  var tabs=document.getElementById('tabs');
  if(!tabs) return;
  tabs.addEventListener('click', function(e){
    var btn = e.target.closest('[data-tab]') || e.target.closest('.tab');
    if(!btn) return;
    var name = btn.getAttribute('data-tab');
    if(!name){ name = btn.dataset ? btn.dataset.tab : null; }
    if(!name) return;
    $all('#tabs [data-tab], #tabs .tab').forEach(function(b){ b.classList.toggle('active', b===btn); });
    $all('.panel').forEach(function(p){ p.classList.toggle('active', p.id==='p-'+name); });
  });
})();

/* ===== Users tab (adds Restrict, Ban, Remove) ===== */
function users(){ return load(LS.USERS,[]); }
function setUsers(a){ save(LS.USERS,a); }
function roles(){ return load(LS.ROLES,{}); }
function setRole(name,role){ var r=roles(); r[name]=role; save(LS.ROLES,r); }
function blockedSet(){ return new Set(load(LS.BLOCK,[])); }
function setBlocked(s){ save(LS.BLOCK, Array.from(s)); }
function purgeUserData(name){
  var prof=load(LS.PROFILE,{});
  if(prof[name]){ delete prof[name]; save(LS.PROFILE,prof); }
  var th=load(LS.THREADS,[]);
  th = th.filter(function(t){ return t.with!==name; });
  save(LS.THREADS,th);
}
function renderUsers(){
  var list=$('#uList'); if(!list) return;
  list.innerHTML='';
  var searchEl=$('#uSearch'); var q=(searchEl && searchEl.value?searchEl.value:'').toLowerCase();
  var rs=roles(), bl=blockedSet();
  var all=users().filter(function(u){ return !q || String(u.name).toLowerCase().indexOf(q)>-1; });
  var uc=$('#uCount'); if(uc) uc.textContent=all.length+' users';

  all.forEach(function(u){
    var row=document.createElement('div'); row.className='item';
    var badges='';
    if(u.name==='Me') badges+=' <span class="pill">You</span>';
    if(rs[u.name]==='restricted') badges+=' <span class="pill warn">Restricted</span>';
    if(bl.has(u.name)) badges+=' <span class="pill warn">Banned</span>';
    row.innerHTML =
      '<img class="ava" src="'+esc(u.avatar||face(u.name))+'" alt="">'+
      '<div style="flex:1;min-width:0">'+
        '<div class="title">'+esc(u.name)+badges+'</div>'+
        '<div class="meta">Role: '+
          '<select data-role style="width:auto">'+
            '<option value="user">User</option>'+
            '<option value="restricted">Restricted</option>'+
            '<option value="mod">Moderator</option>'+
            '<option value="admin">Admin</option>'+
          '</select>'+
        '</div>'+
      '</div>'+
      '<div class="row" style="flex:0 0 auto;gap:6px">'+
        '<button class="btn" data-profile>Profile</button>'+
        '<button class="btn" data-msg>Message</button>'+
        '<button class="btn warn" data-restrict>'+(rs[u.name]==='restricted'?'Unrestrict':'Restrict')+'</button>'+
        '<button class="btn bad" data-ban>'+(bl.has(u.name)?'Unban':'Ban')+'</button>'+
        '<button class="btn" data-remove>Remove</button>'+
      '</div>';

    row.querySelector('[data-role]').value = rs[u.name] || 'user';
    row.querySelector('[data-role]').onchange=function(e){ setRole(u.name,e.target.value); addNotif('Role for '+u.name+' set to '+e.target.value); renderUsers(); };
    row.querySelector('[data-profile]').onclick=function(){ try{localStorage.setItem('ct_profile_view_v1',JSON.stringify({name:u.name}));}catch(_){}
      location.href='profile.html';
    };
    row.querySelector('[data-msg]').onclick=function(){ if(window.ctMessage) ctMessage(u.name); else location.href='messages.html'; };
    row.querySelector('[data-restrict]').onclick=function(){
      var r=roles(); if(r[u.name]==='restricted'){ delete r[u.name]; } else { r[u.name]='restricted'; }
      save(LS.ROLES,r); addNotif((r[u.name]==='restricted'?'Restricted ':'Unrestricted ')+u.name); renderUsers();
    };
    row.querySelector('[data-ban]').onclick=function(){
      var s=blockedSet();
      if(s.has(u.name)){ s.delete(u.name); addNotif('Unbanned '+u.name); }
      else { s.add(u.name); addNotif('Banned '+u.name); }
      setBlocked(s); renderUsers();
    };
    row.querySelector('[data-remove]').onclick=function(){
      if(!confirm('Remove '+u.name+' from your network on this device?')) return;
      setUsers(users().filter(function(x){return x.name!==u.name;}));
      var r=roles(); delete r[u.name]; save(LS.ROLES,r);
      var s=blockedSet(); s.delete(u.name); setBlocked(s);
      purgeUserData(u.name); addNotif('Removed '+u.name); renderUsers();
    };
    list.appendChild(row);
  });
}
var uSearch=$('#uSearch'); if(uSearch) uSearch.addEventListener('input',renderUsers);
var uAdd=$('#uAdd'), addBg=$('#addUserBg'), addClose=$('#addUserClose'), addGo=$('#addUserGo');
if(uAdd) uAdd.onclick=function(){ if(addBg) addBg.style.display='flex'; };
if(addClose) addClose.onclick=function(){ if(addBg) addBg.style.display='none'; };
if(addGo) addGo.onclick=function(){
  var nameEl=$('#addUserName'), avEl=$('#addUserAvatar');
  var name=(nameEl&&nameEl.value||'').trim(); if(!name) return alert('Enter a name');
  var avatar=(avEl&&avEl.value||'').trim()||face(name);
  var all=users(); if(all.some(function(x){return x.name===name;})) return alert('User exists');
  all.push({name:name,avatar:avatar}); setUsers(all);
  if(nameEl) nameEl.value=''; if(avEl) avEl.value=''; if(addBg) addBg.style.display='none';
  addNotif('Admin added user: '+name); renderUsers();
});

/* ===== Content tab ===== */
function ensureShape(p){ return {id:p.id||uid('post'),title:p.title||'',content:p.content||p.text||p.body||'',authorName:p.authorName||p.author||p.name||'Me',createdAt:p.createdAt||p.time||p.date||nowISO(),media:p.media||null,_raw:p}; }
function scanContent(){
  var out=[], d=(load(LS.DATING,[])||[]).map(function(x){x=ensureShape(x);x._type='dating';x._key=LS.DATING;return x;});
  var g=(load(LS.GLOBAL,[])||[]).map(function(x){x=ensureShape(x);x._type='global';x._key=LS.GLOBAL;return x;});
  out=out.concat(d,g);
  for(var i=0;i<localStorage.length;i++){
    var k=localStorage.key(i);
    if(!k || [LS.DATING,LS.GLOBAL,LS.NOTIF,LS.INBOX,LS.PROFILE,LS.USERS,LS.ROLES,LS.BLOCK,LS.PRIV,LS.NOTIFP,LS.ARCHIVE,LS.THREADS].indexOf(k)>-1) continue;
    try{
      var v=JSON.parse(localStorage.getItem(k));
      if(Array.isArray(v) && v.length && typeof v[0]==='object'){
        var norm=v.map(function(o){o=ensureShape(o);o._type='unknown';o._key=k;return o;});
        if(norm.some(function(n){return n.title||n.content;})) out=out.concat(norm);
      }
    }catch(_){}
  }
  return out;
}
function archiveList(){ return load(LS.ARCHIVE,[]); }
function setArchive(arr){ save(LS.ARCHIVE,arr); }
function removeFromKey(key,id){
  var arr=load(key,[]); var idx=arr.findIndex(function(x){return (x.id||'')===id;});
  if(idx>-1){
    var del=arr.splice(idx,1)[0]; save(key,arr);
    var ar=archiveList(); ar.unshift({deletedAt:nowISO(),key:key,item:del}); setArchive(ar);
  }
}
function hideInKey(key,id,setHidden){
  var arr=load(key,[]); var idx=arr.findIndex(function(x){return (x.id||'')===id;});
  if(idx>-1){ arr[idx].hidden=setHidden; save(key,arr); }
}
function shareToGlobal(item){
  var g=load(LS.GLOBAL,[]), id=item.id||uid('g');
  if(!g.some(function(p){return p.id===id;})){
    g.unshift({id:id,title:item.title||'',content:item.content||'',authorName:item.authorName||'Me',createdAt:item.createdAt||nowISO(),media:item.media||null,tags:[]});
    save(LS.GLOBAL,g);
  }
}
function renderContent(){
  var typeEl=$('#cType'), qEl=$('#cSearch');
  var type=(typeEl&&typeEl.value)||'all';
  var q=((qEl&&qEl.value)||'').toLowerCase();
  var arc=archiveList().map(function(a){var s=ensureShape(a.item||{});s._type='archive';s._key=a.key||'unknown';s._deletedAt=a.deletedAt;return s;});
  var items = (type==='archive'?arc:scanContent().filter(function(x){return type==='all'||x._type===type;})).filter(function(x){
    return !q || String(x.title).toLowerCase().indexOf(q)>-1 || String(x.content).toLowerCase().indexOf(q)>-1 || String(x.authorName).toLowerCase().indexOf(q)>-1;
  });

  var cc=$('#cCount'); if(cc) cc.textContent=items.length+' items';
  var box=$('#cList'); if(!box) return; box.innerHTML='';
  if(!items.length){ box.innerHTML='<div class="muted">No content found.</div>'; return; }

  items.sort(function(a,b){ return new Date(b.createdAt)-new Date(a.createdAt); }).forEach(function(p){
    var prof=load(LS.PROFILE,{}); var ava=(prof[p.authorName]&&prof[p.authorName].avatar)||face(p.authorName);
    var badge=(p._type==='archive'?'bad':'muted'); var hidden=(p._raw&&p._raw.hidden)?'<span class="pill warn">hidden</span>':'';
    var row=document.createElement('div'); row.className='item';
    row.innerHTML =
      '<img class="ava" src="'+esc(ava)+'" alt="">'+
      '<div style="flex:1;min-width:0">'+
        '<div class="title">'+esc(p.title||'(no title)')+'</div>'+
        '<div class="meta">'+esc(p.authorName)+' - '+new Date(p.createdAt).toLocaleString()+' - <span class="'+badge+'">'+p._type+'</span> '+hidden+'</div>'+
        '<div style="margin-top:6px">'+esc((p.content||'').slice(0,220))+((p.content||'').length>220?'...':'')+'</div>'+
      '</div>'+
      '<div class="row" style="flex:0 0 auto;gap:6px">'+
        '<button class="btn" data-profile="'+esc(p.authorName)+'">Profile</button>'+
        (p._type!=='archive'
          ? '<button class="btn" data-hide data-key="'+p._key+'" data-id="'+p.id+'">'+(p._raw&&p._raw.hidden?'Unhide':'Hide')+'</button>'+
            '<button class="btn primary" data-share data-id="'+p.id+'">Share to Feed</button>'+
            '<button class="btn bad" data-del data-key="'+p._key+'" data-id="'+p.id+'">Delete</button>'
          : '<button class="btn" disabled title="Restore coming soon">Restore (coming)</button>')+
      '</div>';

    row.querySelector('[data-profile]').onclick=function(e){ var name=e.currentTarget.getAttribute('data-profile'); try{localStorage.setItem('ct_profile_view_v1',JSON.stringify({name:name}));}catch(_){}
      location.href='profile.html';
    };
    var sBtn=row.querySelector('[data-share]'); if(sBtn) sBtn.onclick=function(){ shareToGlobal(p); addNotif('Shared to Feed: '+(p.title||'(untitled)')); alert('Shared to Global Feed'); };
    var dBtn=row.querySelector('[data-del]'); if(dBtn) dBtn.onclick=function(){ var key=dBtn.getAttribute('data-key'); if(!confirm('Delete this item? It will move to Archive.')) return; removeFromKey(key,p.id); renderContent(); };
    var hBtn=row.querySelector('[data-hide]'); if(hBtn) hBtn.onclick=function(){ var key=hBtn.getAttribute('data-key'); hideInKey(key,p.id, !(p._raw&&p._raw.hidden)); renderContent(); };

    box.appendChild(row);
  });
}
var cType=$('#cType'); if(cType) cType.addEventListener('change',renderContent);
var cSearch=$('#cSearch'); if(cSearch) cSearch.addEventListener('input',renderContent);

/* ===== Broadcast ===== */
var bSend=$('#bSend');
if(bSend) bSend.addEventListener('click', function(){
  var tEl=$('#bTitle'), bEl=$('#bBody');
  var title=(tEl&&tEl.value||'').trim();
  var body =(bEl&&bEl.value||'').trim();
  if(!title && !body){ alert('Write something'); return; }
  var msg = title ? (title+' - '+body) : body;
  addNotif('[ADMIN] '+msg); addInbox('[ADMIN] '+msg);
  var st=$('#bStatus'); if(st) st.textContent='Sent';
});

/* ===== Tools ===== */
var tExport=$('#tExport'), tRebuild=$('#tRebuild'), tWipe=$('#tWipe');
if(tExport) tExport.onclick=function(){
  var dump={users:load(LS.USERS,[]),roles:load(LS.ROLES,{}),blocked:load(LS.BLOCK,[]),profile:load(LS.PROFILE,{}),privacy:load(LS.PRIV,{}),notifyPrefs:load(LS.NOTIFP,{}),notifications:load(LS.NOTIF,[]),inbox:load(LS.INBOX,[]),dating:load(LS.DATING,[]),global:load(LS.GLOBAL,[]),archive:load(LS.ARCHIVE,[]),threads:load(LS.THREADS,[])};
  var blob=new Blob([JSON.stringify(dump,null,2)],{type:'application/json'}); var a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download='chatternet-admin-export.json'; a.click();
};
if(tRebuild) tRebuild.onclick=function(){
  if(!confirm('Re-seed demo users?')) return;
  var base=['Me','Grace Lee','Liam Adams','Ava Morgan','Noah Walker','Sophia Turner'].map(function(n){return {name:n,avatar:face(n)};});
  save(LS.USERS,base); addNotif('Demo users re-seeded.'); renderUsers();
};
if(tWipe) tWipe.onclick=function(){
  if(!confirm('This clears local data on THIS device (users, roles, posts, prefs). Continue?')) return;
  Object.keys(LS).concat(['ct_profile_view_v1']).forEach(function(k){ localStorage.removeItem(LS[k]||k); });
  alert('Cleared. Reloading...'); location.reload();
};

/* ===== Boot ===== */
(function boot(){ if(!ensureAdmin()) return; renderUsers(); renderContent(); })();

/* ===== Safety Messages button if header missing ===== */
(function(){
  function ensureBubble(){
    if(!document.getElementById('btnMsgs')){
      var b=document.createElement('button'); b.id='btnMsgs'; b.textContent='Messages';
      b.style.cssText='position:fixed;right:14px;bottom:14px;z-index:2999;padding:10px 12px;border-radius:12px;background:#3498db;color:#fff;border:0;box-shadow:0 6px 18px rgba(0,0,0,.25);cursor:pointer';
      b.onclick=function(){ if(window.ctOpen) ctOpen(); else location.href='messages.html'; };
      document.body.appendChild(b);
    }
  }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',ensureBubble); else ensureBubble();
})();

/* ===== Messenger overlay loader (fallbacks) ===== */
(function(){
  window.CT_API_BASE = window.CT_API_BASE || localStorage.getItem('ct_api_base') || '';
  function loadNext(list){
    var src=list.shift(); if(!src) return;
    var s=document.createElement('script'); s.src=src; s.async=true;
    s.onload=function(){
      if(window.ChatternetMessenger && window.ChatternetMessenger.open){
        if(!window.ctOpen) window.ctOpen=function(){ window.ChatternetMessenger.open(''); };
        if(!window.ctMessage) window.ctMessage=function(name){ window.ChatternetMessenger.open(name||''); };
      }
    };
    s.onerror=function(){ loadNext(list); };
    (document.head||document.documentElement).appendChild(s);
  }
  loadNext(['/assets/messenger.js','assets/messenger.js','/messenger.js','messenger.js']);
})();
</script>
