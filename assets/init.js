/* Chatternet bootstrap — load messenger overlay and wire header on every page
   Path: /public/assets/init.js
*/
(function () {
  "use strict";

  var HARD = "https://chatternet-backend-1.onrender.com";
  try {
    localStorage.setItem("CT_API_BASE", HARD);
    localStorage.setItem("ct_api_base", HARD);
  } catch (_) {}
  var BASE = (window.CT_API_BASE || localStorage.getItem("ct_api_base") || HARD).replace(/\/+$/, "");

  function loadChain(urls, done) {
    (function next(i) {
      if (i >= urls.length) return done(false);
      var s = document.createElement("script");
      s.src = urls[i]; s.async = true;
      s.onload = function () { done(true); };
      s.onerror = function () { s.remove(); next(i + 1); };
      (document.head || document.documentElement).appendChild(s);
    })(0);
  }

  function looksLikeMessage(el){
    if (!el) return false;
    var txt = (el.textContent||"").trim().toLowerCase();
    var href = (el.getAttribute && el.getAttribute("href") || "").toLowerCase();
    return el.id==="btnMsgs" ||
           txt==="messages" || txt==="message" || txt.indexOf("message")>-1 ||
           href.endsWith("messages.html") || href.indexOf("messages.html")>-1 ||
           el.hasAttribute("data-message") || el.getAttribute("data-action")==="message" ||
           el.classList.contains("message") || el.classList.contains("btn-message");
  }

  function afterLoad(){
    // If messenger is present, expose helpers & wire header
    if (window.ChatternetMessenger) {
      window.ctOpen    = window.ctOpen    || function(){ window.ChatternetMessenger.open(""); };
      window.ctMessage = window.ctMessage || function(n){ window.ChatternetMessenger.open(n||""); };
    }

    // If CT (from messenger.js) exists, wire header avatar + btn
    if (window.CT && typeof CT.wireHeader === "function") {
      try { CT.wireHeader(document); } catch(_){}
    }

    // Intercept any Messages links/buttons (safe even if messenger loads a bit later)
    document.addEventListener("click", function(e){
      var btn = e.target && e.target.closest && e.target.closest("a,button");
      if (!btn) return;
      if (looksLikeMessage(btn)) {
        if (window.ChatternetMessenger && typeof window.ChatternetMessenger.open === "function") {
          e.preventDefault(); e.stopPropagation();
          window.ChatternetMessenger.open("");
        } else {
          // Fallback: go to messages.html which will open overlay
          // (or do nothing if that page does not exist)
        }
      }
    }, true);
  }

  // Try loading messenger from backend, then local copies
  var candidates = [
    BASE + "/assets/messenger.js",
    "/assets/messenger.js",
    "assets/messenger.js",
    "/messenger.js",
    "messenger.js"
  ];
  loadChain(candidates, function(){ afterLoad(); });
})();
