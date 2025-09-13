/* Chatternet Base Stack Glue
   File: /assets/base-stack.js
   Purpose: make settings/runtime + header wiring live across all pages.
*/
(function () {
  "use strict";

  // ---------- API base ----------
  function setApiBase(u) {
    if (!u) return;
    var base = String(u).replace(/\/+$/, "");
    window.CT_API_BASE = base;
    try { localStorage.setItem("ct_api_base", base); } catch {}
  }
  // initial pick: window override -> saved -> default
  setApiBase(window.CT_API_BASE || localStorage.getItem("ct_api_base") || "https://chatternet-backend-1.onrender.com");

  // expose on CT
  var CT = (window.CT = window.CT || {});
  CT.setApiBase = setApiBase;

  // ---------- DOM ready helpers ----------
  function ready(fn){ if (document.readyState !== "loading") fn(); else document.addEventListener("DOMContentLoaded", fn); }

  ready(function(){
    // If settings-runtime is present, apply effects right away
    try {
      if (CT.renderMonetizationButtons) CT.renderMonetizationButtons(document);
      if (CT.wireHeader) CT.wireHeader(document);       // from your pages/messenger loader
      if (CT.bindMessageButtons) CT.bindMessageButtons(document);
    } catch {}

    // Support buttons anywhere: <a data-support="button">Support</a>
    try { if (CT.renderMonetizationButtons) CT.renderMonetizationButtons(document); } catch {}
  });

  // ---------- Optional message ping hook ----------
  // Your messenger can call this when it receives an inbound message:
  //   if (from !== "Me" && window.ctOnInboundMessage) window.ctOnInboundMessage();
  window.ctOnInboundMessage = function(){
    try { if (window.CT && CT.notifyMessage) CT.notifyMessage(); } catch {}
  };
})();
