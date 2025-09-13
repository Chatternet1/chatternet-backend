/* Chatternet Common Helpers v2
   - Keeps your real server base
   - JSON fetch helper (ctApi)
   - Session helpers (ctGetMe / ctLogout) hitting /api/me + /api/logout
   - Messages overlay wiring:
       * Overlay opens on every page EXCEPT Home and Messages
       * Intercepts clicks to messages links/buttons accordingly
*/
(function(){
  "use strict";

  // Guard against double-loading
  if (window._ctCommonLoaded) return;
  window._ctCommonLoaded = true;

  /* ========= API BASE ========= */
  function getApiBase(){
    var b = window.CT_API_BASE || localStorage.getItem('ct_api_base') || 'https://chatternet-backend-1.onrender.com';
    b = String(b).replace(/\/+$/,'');
    window.CT_API_BASE = b;
    try { localStorage.setItem('ct_api_base', b); } catch(e){}
    return b;
  }

  /* ========= FETCH WRAPPER ========= */
  async function ctApi(path, opts){
    var base = getApiBase();
    var url = /^https?:/i.test(path) ? path : (base + path);
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

  /* ========= SESSION HELPERS ========= */
  window.ctGetMe = async function(){
    try { const r = await ctApi('/api/me'); return r.user || null; }
    catch { return null; }
  };
  window.ctLogout = async function(){
    try { await ctApi('/api/logout', { method:'POST' }); } catch(e){}
    try { localStorage.removeItem('ct_profile_data_v1'); } catch(e){}
    location.href = 'index.html';
  };

  /* ========= OVERLAY / MESSAGES HOOKS ========= */

  // Determine if overlay interception should be active on this page
  function overlayEnabledHere(){
    var p = (location.pathname || '').toLowerCase();
    // Disabled on Home and Messages pages
    if (p === '/' || p.endsWith('/index') || p.endsWith('/index.html') ||
        p.endsWith('/home') || p.endsWith('/home.html') ||
        p.endsWith('/messages') || p.endsWith('/messages.html')) {
      return false;
    }
    return true;
  }

  // Minimal open function (upgraded later if messenger.js defines ChatternetMessenger.open)
  if (!window.ctOpen) {
    window.ctOpen = function(){
      if (window.ChatternetMessenger && typeof window.ChatternetMessenger.open === 'function') {
        return window.ChatternetMessenger.open();
      }
      // Fallback if overlay not available yet
      location.href = 'messages.html';
    };
  }
  if (!window.ctMessage) window.ctMessage = window.ctOpen;

  // Intercept clicks to messages triggers only when enabled on this page
  if (overlayEnabledHere()) {
    // 1) Any anchor that goes to messages.html
    document.addEventListener('click', function(e){
      var a = e.target.closest && e.target.closest('a[href*="messages.html"]');
      if(!a) return;
      e.preventDefault(); e.stopPropagation();
      window.ctOpen();
    }, true);

    // 2) Buttons/links that look like "Messages"
    document.addEventListener('click', function(e){
      var el = e.target.closest && e.target.closest('a,button'); if(!el) return;
      var id=(el.id||'').toLowerCase();
      var txt=(el.textContent||'').trim().toLowerCase();
      var explicit = el.hasAttribute('data-message') || el.matches('.btn-message,.message');
      var looks = id==='btnmsgs' || txt==='messages' || txt==='message' || txt.indexOf('messages')>-1 || explicit;
      if(looks){
        e.preventDefault(); e.stopPropagation();
        window.ctOpen();
      }
    }, true);
  }

  /* ========= EXPORTS ========= */
  window.ctApi = ctApi;
  window.getApiBase = getApiBase;
})();
