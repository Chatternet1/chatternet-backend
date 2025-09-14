/* Chatternet Base Stack — shared across all pages
   - Sets global API base (fixes “Unexpected token < … not JSON”)
   - ctApi(path, opts) wrapper (JSON in/out + credentials)
   - Safe avatar helpers
   - Lightweight Notifications/Inbox modals wiring
   - Messenger overlay auto-loader
*/

(function () {
  "use strict";

  // ----- 1) API base (global) -----
  const BACKEND = 'https://chatternet-backend-1.onrender.com';
  const DEF_API = BACKEND.replace(/\/+$/,'') + '/api';

  // allow per-page override via <script>window.CT_API_BASE='...'</script>
  const saved = (typeof localStorage!=='undefined' && localStorage.getItem('ct_api_base')) || '';
  const chosen = (window.CT_API_BASE || saved || DEF_API).replace(/\/+$/,'');
  window.CT_API_BASE = chosen;

  // persist so all pages share it
  try { if (!saved || saved !== chosen) localStorage.setItem('ct_api_base', chosen); } catch {}

  // Small helper to build URLs
  const apiUrl = (p) => chosen + (p.startsWith('/') ? p : '/' + p);

  // ----- 2) Fetch helper -----
  async function ctApi(path, opts = {}) {
    const res = await fetch(apiUrl(path), {
      credentials: 'include',
      headers: { 'Content-Type': 'application/json', ...(opts.headers || {}) },
      ...opts
    }).catch(() => null);

    if (!res) throw new Error('offline');
    const txt = await res.text().catch(() => '');
    if (!res.ok) {
      // try to surface JSON errors; otherwise raw text
      try { const j = JSON.parse(txt || '{}'); throw new Error(j.error || txt || 'error'); }
      catch { throw new Error(txt || 'error'); }
    }
    try { return JSON.parse(txt || '{}'); } catch { return {}; }
  }

  // expose globally
  window.ctApi = ctApi;

  // ----- 3) Avatar helpers -----
  const LS = { USERS:'ct_users_v3', PROFILE:'ct_profile_data_v1' };
  const load = (k,f)=>{ try{ const v=localStorage.getItem(k); return v?JSON.parse(v):f; }catch{ return f; } };
  const SVG_FALLBACK = 'data:image/svg+xml;utf8,'+encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96"><rect width="96" height="96" fill="#e5e7eb"/><circle cx="48" cy="36" r="16" fill="#cbd5e1"/><rect x="20" y="60" width="56" height="20" rx="10" fill="#cbd5e1"/></svg>`);
  const faceSeed = (n)=>`https://i.pravatar.cc/120?u=${encodeURIComponent(n||'Me')}`;

  function getAvatarFor(name){
    const prof = (load(LS.PROFILE,{}))[name] || {};
    if (prof.avatar) return prof.avatar;
    if (prof.avatarUrl) return prof.avatarUrl;
    const users = load(LS.USERS,[]);
    const u = users.find(x=>x.name===name);
    if (u && u.avatar) return u.avatar;
    return faceSeed(name||'Me');
  }
  function setImgSafe(img, name){
    if(!img) return;
    img.referrerPolicy = 'no-referrer';
    img.src = getAvatarFor(name);
    img.onerror = ()=>{ img.onerror=null; img.src = SVG_FALLBACK; };
  }
  window.ctAvatar = { getAvatarFor, setImgSafe };

  // ----- 4) Messenger overlay loader (robust) -----
  (function loadMessenger(){
    function load(src, ok){
      const s=document.createElement('script'); s.src=src; s.async=true;
      s.onload = ok || null;
      s.onerror = function(){
        if (src.indexOf('/assets/messenger.js') > -1) load('assets/messenger.js', ok);
      };
      (document.head||document.documentElement).appendChild(s);
    }
    if (!window.ctOpen || !window.ctMessage) load('/assets/messenger.js');
  })();

  // ----- 5) Header wiring (only if elements exist) -----
  function wireHeader(){
    const $ = (s)=>document.querySelector(s);
    const meProfile = $('#myProfile');
    if (meProfile) {
      setImgSafe(meProfile, 'Me');
      meProfile.addEventListener('click', ()=> location.href='profile.html');
    }

    const notifBtn = $('#btnNotif'), inboxBtn = $('#btnInbox'), msgsBtn = $('#btnMsgs');

    // simple modal builders (created once)
    function ensureModal(id, title){
      let bg = document.getElementById(id);
      if (bg) return bg;
      bg = document.createElement('div');
      bg.id = id;
      bg.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.45);display:none;align-items:center;justify-content:center;z-index:2000';
      bg.innerHTML = `
        <div class="card" style="max-width:520px;width:92%;max-height:80vh;overflow:auto;background:#fff;border-radius:12px;padding:16px;box-shadow:0 10px 30px rgba(0,0,0,.25)">
          <h3 style="margin:0 0 10px">${title}</h3>
          <div id="${id}-list"></div>
          <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:8px">
            ${id==='notifBg'?'<button id="clearNotif" class="btn primary">Clear</button>':''}
            <button id="${id}-close" class="btn">Close</button>
          </div>
        </div>`;
      document.body.appendChild(bg);
      return bg;
    }

    // Notifications
    if (notifBtn) {
      const bg = ensureModal('notifBg','Notifications');
      const list = document.getElementById('notifBg-list');
      const clear = document.getElementById('clearNotif');
      const close = document.getElementById('notifBg-close');
      const load = (k,f)=>{ try{const v=localStorage.getItem(k);return v?JSON.parse(v):f;}catch{return f;} };
      function render(){
        const arr = load('ct_notifications_v1',[]);
        list.innerHTML = arr.length
          ? arr.map(n=>`<div style="padding:10px;border:1px solid #eee;border-radius:10px;background:#fafafa;margin:8px 0"><strong>${new Date(n.time).toLocaleString()}</strong><br>${(n.text||'')}</div>`).join('')
          : '<div>No notifications yet.</div>';
      }
      notifBtn.addEventListener('click',()=>{ render(); bg.style.display='flex'; });
      clear?.addEventListener('click',()=>{ localStorage.setItem('ct_notifications_v1','[]'); render(); });
      close.addEventListener('click',()=>{ bg.style.display='none'; });
    }

    // Inbox
    if (inboxBtn) {
      const bg = ensureModal('inboxBg','Inbox');
      const list = document.getElementById('inboxBg-list');
      const close = document.getElementById('inboxBg-close');
      const load = (k,f)=>{ try{const v=localStorage.getItem(k);return v?JSON.parse(v):f;}catch{return f;} };
      function render(){
        const arr = load('ct_inbox_v1',[]);
        list.innerHTML = arr.length
          ? arr.map(n=>`<div style="padding:10px;border:1px solid #eee;border-radius:10px;background:#fafafa;margin:8px 0"><strong>${new Date(n.time).toLocaleString()}</strong><br>${(n.text||'')}</div>`).join('')
          : '<div>Inbox is empty.</div>';
      }
      inboxBtn.addEventListener('click',()=>{ render(); bg.style.display='flex'; });
      close.addEventListener('click',()=>{ bg.style.display='none'; });
    }

    // Messages overlay
    if (msgsBtn) msgsBtn.addEventListener('click', e=>{
      e.preventDefault();
      if (window.ctOpen) return window.ctOpen();
      location.href = 'messages.html';
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', wireHeader, { once:true });
  } else {
    wireHeader();
  }

  // Optional: export a tiny namespace
  window.CT = Object.assign(window.CT || {}, {
    API_BASE: chosen,
    api: ctApi,
    avatar: { get: getAvatarFor, set: setImgSafe }
  });
})();
