/* Chatternet Settings Runtime (site-wide)
   File: /assets/settings-runtime.js
   Purpose: Make Settings work everywhere without changing your UI.
   - Reads/writes ct_settings_v1 (with cookie fallback)
   - Applies privacy/DND/sounds/avatar/support-button across all pages
   - Cross-tab sync (Storage + BroadcastChannel)
   - Exposes CT.settings(), CT.updateSettings(), CT.notify(), CT.notifyMessage()
   - Optional backend sync to CT.API_BASE /api/settings (if your server supports it)
*/
(function () {
  "use strict";

  // ---------- tiny utils ----------
  const $  = (s, el) => (el || document).querySelector(s);
  const $$ = (s, el) => Array.from((el || document).querySelectorAll(s));
  const nowISO = () => new Date().toISOString();

  // LocalStorage with cookie fallback (matches your Settings page)
  const Storage = (() => {
    function ok() { try { const k="__ct_probe__"; localStorage.setItem(k,"1"); localStorage.removeItem(k); return true; } catch { return false; } }
    const HAS = ok();
    function getCookie(name){ const m=document.cookie.match(new RegExp("(?:^|; )"+encodeURIComponent(name)+"=([^;]*)")); return m?decodeURIComponent(m[1]):null; }
    function setCookie(name,val){ try{ document.cookie=encodeURIComponent(name)+"="+encodeURIComponent(val)+"; path=/; max-age=31536000"; }catch{} }
    function get(k,f){ if(HAS){ try{ const v=localStorage.getItem(k); if(v!=null) return JSON.parse(v);}catch{} } const c=getCookie(k); if(c){ try{ return JSON.parse(c);}catch{} } return f; }
    function set(k,v){ const s=JSON.stringify(v); if(HAS){ try{ localStorage.setItem(k,s);}catch{} } setCookie(k,s); }
    return { get,set,hasLS:HAS };
  })();

  // ---------- keys & defaults ----------
  const LS = {
    SETTINGS: "ct_settings_v1",
    SETTINGS_GLOBAL: "ct_settings_global",
    USERS: "ct_users_v3",
    PROFILE: "ct_profile_data_v1",
    NOTIF: "ct_notifications_v1",
    INBOX: "ct_inbox_v1"
  };

  const DEFAULT = {
    profile:{ displayName:"", bio:"", avatarUrl:"", coverUrl:"", actor:"Me" },
    notifications:{
      dm:true, comments:true, likes:true, follows:true, blogs:true, polls:true,
      channels:{ inapp:true, email:false, sound:false },
      freq:"instant",
      dnd:{ enabled:false, start:"22:00", end:"08:00" }
    },
    privacy:{ profile:"public", post:"public", dm:"everyone", online:true, showLikes:true, showComments:true },
    monetization:{ paywall:"", code:"" },
    security:{ email:"", emailVerified:false, phone:"", phoneVerified:false, twoFA:false, backups:[] },
    sessions:[]
  };

  // ---------- CT namespace ----------
  const CT = (window.CT = window.CT || {});
  CT.API_BASE = (window.CT_API_BASE || localStorage.getItem("ct_api_base") || "https://chatternet-backend-1.onrender.com").replace(/\/+$/,"");

  // ---------- settings state & API ----------
  const subs = new Set();

  function ensureDefaults() {
    if (!Storage.get(LS.SETTINGS, null)) Storage.set(LS.SETTINGS, DEFAULT);
    if (!Storage.get(LS.SETTINGS_GLOBAL, null)) Storage.set(LS.SETTINGS_GLOBAL, DEFAULT);
  }
  function get() { return Storage.get(LS.SETTINGS, DEFAULT); }
  function save(s) {
    Storage.set(LS.SETTINGS, s);
    Storage.set(LS.SETTINGS_GLOBAL, s);
    try { localStorage.setItem("ct_settings_poke", String(Date.now())); } catch {}
    subs.forEach(fn => { try { fn(s); } catch {} });
    applyEffects(s);
  }
  function update(patchObj) {
    const s = Object.assign({}, get(), patchObj || {});
    save(s);
    return s;
  }

  CT.settings = get;
  CT.updateSettings = update;
  CT.onSettings = (fn) => { if (typeof fn === "function") subs.add(fn); return () => subs.delete(fn); };

  // cross-tab sync via storage + (optional) BroadcastChannel
  window.addEventListener("storage", (e) => {
    if (e.key === LS.SETTINGS || e.key === "ct_settings_poke") applyEffects(get());
  });
  try {
    const bc = new BroadcastChannel("ct_settings");
    bc.onmessage = () => applyEffects(get());
    subs.add(() => bc.postMessage({ type: "updated", at: Date.now() }));
  } catch {}

  // ---------- effect hooks (privacy/DND/sound/avatar/support) ----------
  let cssInjected = false;
  function ensureCSS() {
    if (cssInjected) return;
    cssInjected = true;
    const style = document.createElement("style");
    style.textContent = `
      .ct-hide-likes [data-ui="likes"], .ct-hide-likes .likes-count{display:none!important}
      .ct-hide-comments [data-ui="comments"], .ct-hide-comments .comments-block{display:none!important}
      .ct-hide-online .online-dot{visibility:hidden!important}
    `;
    document.head.appendChild(style);
  }

  function withinDND(dnd){
    if (!dnd || !dnd.enabled) return false;
    const [sh,sm]=(dnd.start||"22:00").split(":").map(Number);
    const [eh,em]=(dnd.end||"08:00").split(":").map(Number);
    const now=new Date(); const cur=now.getHours()*60+now.getMinutes();
    const start=sh*60+sm, end=eh*60+em;
    return (start<=end) ? (cur>=start && cur<=end) : (cur>=start || cur<=end);
  }

  function beep(){
    try{
      const C=window.AudioContext||window.webkitAudioContext; if(!C) return;
      const ctx=new C(); const o=ctx.createOscillator(); const g=ctx.createGain();
      o.type="sine"; o.frequency.value=880; o.connect(g); g.connect(ctx.destination);
      g.gain.setValueAtTime(0.0001, ctx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.08, ctx.currentTime+0.01);
      o.start();
      setTimeout(()=>{ g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime+0.05); o.stop(ctx.currentTime+0.06); }, 60);
    }catch{}
  }

  function addNotif(text){
    const s=get();
    if (!s.notifications.channels.inapp) return;
    if (withinDND(s.notifications.dnd)) return;
    const arr=Storage.get(LS.NOTIF,[]);
    arr.unshift({ id:"n_"+Date.now(), text:String(text||""), time:nowISO() });
    Storage.set(LS.NOTIF,arr);
    if (s.notifications.channels.sound) beep();
  }
  // Do not override if already defined by your pages
  CT.addNotif = CT.addNotif || addNotif;

  // Expose a helper for inbound-message pings (use it where you receive messages)
  CT.notifyMessage = function(){
    const s=get();
    if (s.notifications.dm && s.notifications.channels.inapp && !withinDND(s.notifications.dnd)) addNotif("New message received.");
    if (s.notifications.dm && s.notifications.channels.sound && !withinDND(s.notifications.dnd)) beep();
  };

  function applyHeaderAvatar(s){
    const prof=(Storage.get(LS.PROFILE,{})["Me"]||{});
    const avatar = s.profile.avatarUrl || prof.avatar || prof.avatarUrl || "https://i.pravatar.cc/100?u=me";
    $$('img#myProfile, img[data-ct="myProfile"]').forEach(img=>{
      img.src=avatar; img.alt=(prof.displayName || s.profile.displayName || "Me");
    });
  }

  function renderSupportButtons(s){
    $$('[data-support="button"]').forEach(btn=>{
      const url=s.monetization.paywall||"";
      if(!url){ btn.style.display="none"; return; }
      btn.style.display=""; btn.onclick=(e)=>{ e.preventDefault(); window.open(url,"_blank","noopener"); };
    });
  }

  function applyPrivacy(s){
    ensureCSS();
    const html=document.documentElement;
    html.classList.toggle("ct-hide-likes", !s.privacy.showLikes);
    html.classList.toggle("ct-hide-comments", !s.privacy.showComments);
    html.classList.toggle("ct-hide-online", !s.privacy.online);
  }

  function applyEffects(s){
    s = s || get();
    applyHeaderAvatar(s);
    renderSupportButtons(s);
    applyPrivacy(s);
  }

  // ---------- optional backend sync (/api/settings) ----------
  async function fetchMe(){
    try{
      const r=await fetch(CT.API_BASE+"/api/me",{credentials:"include"});
      const j=await r.json(); return j && j.user ? j.user : null;
    }catch{ return null; }
  }
  async function pullFromServer(){
    try{
      const r=await fetch(CT.API_BASE+"/api/settings",{credentials:"include"});
      if(!r.ok) return;
      const j=await r.json();
      if(j && j.ok && j.settings){
        // merge server → local (server wins)
        save(Object.assign({}, get(), j.settings));
      }
    }catch{}
  }
  async function pushToServer(){
    try{
      await fetch(CT.API_BASE+"/api/settings",{
        method:"PUT",
        headers:{ "content-type":"application/json" },
        credentials:"include",
        body:JSON.stringify({ settings:get() })
      });
    }catch{}
  }
  CT.onSettings(async ()=>{ if (await fetchMe()) pushToServer(); });

  // ---------- boot ----------
  (async function boot(){
    ensureDefaults();
    applyEffects(get());
    if (await fetchMe()) pullFromServer();
  })();

  // Convenience exports
  CT.notify = function(text){ addNotif(text); };
  CT.isDND  = function(){ return withinDND(get().notifications.dnd); };
  CT.renderMonetizationButtons = function(scope){ renderSupportButtons(get(), scope||document); };

})();
