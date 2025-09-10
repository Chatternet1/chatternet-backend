/* Chatternet Common (header helpers + messenger boot)
   File: public/assets/common.js
   Default backend base: https://chatternet-backend-1.onrender.com
*/
(function(){
  "use strict";

  // ---------- tiny utils ----------
  var DEFAULT_BASE = "https://chatternet-backend-1.onrender.com";
  function endTrim(u){ return String(u||"").replace(/\/+$/,""); }
  function lsGet(k,f){ try{ var v=localStorage.getItem(k); return v?JSON.parse(v):f; }catch(_){ return f; } }
  function lsSet(k,v){ try{ localStorage.setItem(k, JSON.stringify(v)); }catch(_){ } }
  function esc(s){
    s = String(s==null?"":s);
    return s.replace(/&/g,"&amp;").replace(/</g,"&lt;")
            .replace(/>/g,"&gt;").replace(/"/g,"&quot;")
            .replace(/'/g,"&#39;");
  }
  function face(n){ return "https://i.pravatar.cc/120?u="+encodeURIComponent(n||"user"); }

  // ---------- CT namespace ----------
  var CT = window.CT || (window.CT = {});
  CT.API_BASE = endTrim(localStorage.getItem("ct_api_base") || CT.API_BASE || DEFAULT_BASE);

  CT.getApiBase = function(){ return CT.API_BASE; };
  CT.setApiBase = function(url){
    var clean = endTrim(url||DEFAULT_BASE);
    CT.API_BASE = clean;
    try{ localStorage.setItem("ct_api_base", clean); }catch(_){}
    return clean;
  };

  // expose a simple loader
  CT.loadScript = function(urls, done){
    urls = Array.isArray(urls) ? urls : [String(urls||"")];
    (function next(i){
      if(i>=urls.length){ done && done(false); return; }
      var s=document.createElement("script");
      s.src = urls[i]; s.async = true;
      s.onload = function(){ done && done(true); };
      s.onerror= function(){ s.remove(); next(i+1); };
      (document.head || document.documentElement).appendChild(s);
    })(0);
  };

  // ensure Messenger exists (if a page forgot to include assets/messenger.js)
  CT.ensureMessenger = function(onReady){
    if (window.ChatternetMessenger && typeof window.ChatternetMessenger.open==="function"){
      onReady && onReady(); return;
    }
    var base = CT.getApiBase();
    var paths = [
      endTrim(base)+"/assets/messenger.js",
      "/assets/messenger.js",
      "assets/messenger.js",
      "/messenger.js",
      "messenger.js"
    ];
    CT.loadScript(paths, function(ok){
      if (ok && window.ChatternetMessenger && window.ChatternetMessenger.open){
        onReady && onReady();
      } else {
        // as a last resort, do nothing (page can still navigate to messages.html)
        onReady && onReady();
      }
    });
  };

  // ---------- Header wiring (id-based) ----------
  // Safe: won’t throw if elements don’t exist.
  CT.wireHeader = CT.wireHeader || function(scope){
    scope = scope || document;

    // Avatar
    var profile = (lsGet("ct_profile_data_v1", {})["Me"] || {});
    var img = scope.querySelector("#myProfile");
    if (img){
      img.src = profile.avatar || profile.avatarUrl || face("Me");
      img.alt = profile.displayName || "Me";
      img.style.cursor = "pointer";
      img.onclick = function(){ try{ location.href="profile.html"; }catch(_){} };
    }

    // Messages button -> overlay
    var btn = scope.querySelector("#btnMsgs");
    if (btn){
      btn.addEventListener("click", function(e){
        e.preventDefault(); e.stopPropagation();
        if (window.ChatternetMessenger && window.ChatternetMessenger.open){
          window.ChatternetMessenger.open("");
        } else {
          CT.ensureMessenger(function(){
            if (window.ChatternetMessenger && window.ChatternetMessenger.open){
              window.ChatternetMessenger.open("");
            } else {
              // fallback if messenger truly not available
              location.href = "messages.html";
            }
          });
        }
      });
    }
  };

  // Bind message-looking links/buttons globally (before messenger loads)
  function looksLikeMessage(el){
    if (!el) return false;
    var txt = (el.textContent||"").trim().toLowerCase();
    var href = (el.getAttribute && el.getAttribute("href")||"").toLowerCase();
    return el.id==="btnMsgs" ||
           txt==="messages" || txt==="message" || txt.indexOf("message")>-1 ||
           href.endsWith("messages.html") || href.indexOf("messages.html")>-1 ||
           el.hasAttribute("data-message") || el.getAttribute("data-action")==="message" ||
           el.classList.contains("message") || el.classList.contains("btn-message");
  }

  document.addEventListener("click", function(e){
    var btn = e.target && e.target.closest && e.target.closest("a,button");
    if (!btn) return;

    // If messenger is already present, let messenger.js handle it.
    if (window.ChatternetMessenger && window.ChatternetMessenger.open) return;

    if (looksLikeMessage(btn)){
      e.preventDefault(); e.stopPropagation();
      CT.ensureMessenger(function(){
        if (window.ChatternetMessenger && window.ChatternetMessenger.open){
          window.ChatternetMessenger.open("");
        } else {
          location.href="messages.html";
        }
      });
    }
  }, true);

  // ---------- Notifications helpers (local demo) ----------
  CT.addNotif = CT.addNotif || function(text){
    var arr = lsGet("ct_notifications_v1", []);
    arr.unshift({ id:"n_"+Date.now(), text:String(text||""), time:new Date().toISOString() });
    lsSet("ct_notifications_v1", arr);
  };
  CT.addInbox = CT.addInbox || function(text){
    var arr = lsGet("ct_inbox_v1", []);
    arr.unshift({ id:"m_"+Date.now(), text:String(text||""), time:new Date().toISOString() });
    lsSet("ct_inbox_v1", arr);
  };

  // ---------- Global shorthands that auto-load messenger ----------
  window.ctOpen = window.ctOpen || function(){
    if (window.ChatternetMessenger && window.ChatternetMessenger.open) return window.ChatternetMessenger.open("");
    CT.ensureMessenger(function(){ window.ChatternetMessenger && window.ChatternetMessenger.open && window.ChatternetMessenger.open(""); });
  };
  window.ctMessage = window.ctMessage || function(name){
    if (window.ChatternetMessenger && window.ChatternetMessenger.open) return window.ChatternetMessenger.open(name||"");
    CT.ensureMessenger(function(){ window.ChatternetMessenger && window.ChatternetMessenger.open && window.ChatternetMessenger.open(name||""); });
  };

  // Auto-wire header on DOM ready
  document.addEventListener("DOMContentLoaded", function(){
    try{ CT.wireHeader(document); }catch(_){}
  });

  // Re-hydrate avatar/name if profile changes in another tab/iframe
  window.addEventListener("storage", function(ev){
    if (ev.key === "ct_profile_data_v1"){
      try{ CT.wireHeader(document); }catch(_){}
    }
  });

  // Export a few utilities (optional)
  CT.util = CT.util || {
    esc: esc,
    face: face,
    get: lsGet,
    set: lsSet
  };
})();
