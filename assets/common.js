/* Chatternet Common Helpers (keeps your real server)
   File: /assets/common.js
*/
(function(){
  "use strict";

  // ----- API base (persist)
  function getApiBase(){
    var b = window.CT_API_BASE || localStorage.getItem('ct_api_base') || 'https://chatternet-backend-1.onrender.com';
    b = String(b).replace(/\/+$/,'');
    window.CT_API_BASE = b;
    try { localStorage.setItem('ct_api_base', b); } catch(e){}
    return b;
  }

  // ----- Fetch wrapper (JSON)
  async function ctApi(path, opts){
    var base = getApiBase();
    var url = path.startsWith('http') ? path : (base + path);
    var o = Object.assign({
      method: 'GET',
      headers: { 'Accept':'application/json' },
      credentials: 'include'
    }, opts || {});
    if (o.body && typeof o.body === 'object' && !(o.body instanceof FormData)) {
      o.headers['Content-Type'] = 'application/json';
      o.body = JSON.stringify(o.body);
    }
    var res = await fetch(url, o);
    var text = await res.text();
    var data = text ? JSON.parse(text) : {};
    if(!res.ok) throw (data || { error:true, status:res.status });
    return data;
  }

  // ----- Session helpers (fixed routes)
  window.ctGetMe = async function(){
    try { const r = await ctApi('/api/me'); return r.user || null; }
    catch { return null; }
  };
  window.ctLogout = async function(){
    try { await ctApi('/api/logout', { method:'POST' }); } catch(e){}
    try { localStorage.removeItem('ct_profile_data_v1'); } catch(e){}
    location.href = 'index.html';
  };

  // ----- Intercept "Messages" links → overlay
  document.addEventListener('click', function(e){
    var a = e.target.closest && e.target.closest('a[href*="messages.html"]');
    if(!a) return;
    if (window.ctOpen) { e.preventDefault(); return void window.ctOpen(); }
    if (window.ChatternetMessenger && typeof window.ChatternetMessenger.open==='function') {
      e.preventDefault(); return void window.ChatternetMessenger.open();
    }
  }, true);

  // Expose
  window.ctApi = ctApi;
  window.getApiBase = getApiBase;
})();
