/* assets/common.js  — shared helpers for Chatternet (frontend)  */

// --- error overlay
(function(){
  if(document.getElementById('ct_err_overlay')) return;
  const o = document.createElement('div');
  o.id='ct_err_overlay';
  o.style.cssText='position:fixed;inset:0;display:none;align-items:flex-start;justify-content:center;background:rgba(0,0,0,.55);z-index:99999';
  o.innerHTML = '<div style="margin-top:24px;background:#fff;color:#111;border-radius:12px;max-width:900px;width:92%;box-shadow:0 10px 30px rgba(0,0,0,.3);padding:16px"><h3 style="margin:4px 0 10px">Error</h3><pre id="ct_err_text" style="white-space:pre-wrap;overflow:auto;background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:10px;max-height:50vh"></pre><div style="text-align:right"><button onclick="document.getElementById(\'ct_err_overlay\').style.display=\'none\'" style="padding:8px 12px;border:1px solid #d7d7d7;border-radius:10px;background:#fff;cursor:pointer">Close</button></div></div>';
  document.body.appendChild(o);
  function show(msg){ const t=document.getElementById('ct_err_text'); t.textContent=String(msg||'Unknown'); o.style.display='flex'; }
  window.addEventListener('error', e=>show(e.error? (e.error.stack||e.error.message||e.message):e.message));
  window.addEventListener('unhandledrejection', e=>show(e.reason && (e.reason.stack||e.reason.message||String(e.reason))));
})();

// --- backend base
(function(){
  let base = localStorage.getItem('ct_api_base') || window.CT_API_BASE || '';
  if(!base){
    const guess = location.origin.replace(/\/+$/,'');
    base = guess.includes('localhost') ? 'http://localhost:8080' : guess;
    localStorage.setItem('ct_api_base', base);
  }
  window.CT_API_BASE = base.replace(/\/+$/,'');
})();

// --- api helper (always credentials: include)
window.ctApi = async function(path, opts={}){
  const url = (window.CT_API_BASE||'') + path;
  const res = await fetch(url, {
    credentials: 'include',
    headers: { 'Content-Type':'application/json', ...(opts.headers||{}) },
    ...opts
  });
  const text = await res.text();
  let json = {}; try{ json = text ? JSON.parse(text) : {}; }catch{ json = { raw:text }; }
  if(!res.ok) throw new Error(json.error||res.statusText||'Request failed');
  return json;
};

// --- session helpers
window.ctGetMe = async function(){
  try{ const r = await ctApi('/api/auth/me'); return r.user || null; }
  catch{ return null; }
};
window.ctLogout = async function(){
  try{ await ctApi('/api/auth/logout', { method:'POST' }); }catch{}
  try{ localStorage.setItem('ct_settings_poke', String(Date.now())); }catch{}
  if(location.pathname.toLowerCase().includes('auth.html')) return;
  location.href = 'auth.html';
};

// --- quick nav updater (optional)
window.ctPaintNav = async function(){
  const me = await ctGetMe();
  const el = document.querySelector('#myProfile');
  if(el){
    if(me){ el.src = me.avatar_url || `https://i.pravatar.cc/100?u=${encodeURIComponent(me.handle)}`; el.alt = me.display_name || me.handle; el.style.cursor='pointer'; el.onclick=()=>location.href='profile.html'; }
    else  { el.src = `https://i.pravatar.cc/100?u=anon`; el.alt='Sign in'; el.style.cursor='pointer'; el.onclick=()=>location.href='auth.html'; }
  }
};

// auto-paint (safe if image isn’t present)
window.addEventListener('load', ()=>{ try{ ctPaintNav(); }catch{} });
