/* Chatternet Layout Shim v2
   Purpose:
   - Place the blue top bar directly under your Weebly site menu
   - Keep a small white gap (12px) between menu and blue bar
   - Ensure app-nav sits directly under the blue bar on every page
   Exposed CSS vars:
   - --ct-menu-bottom : pixel bottom of the site menu
   - --ct-bluebar-top : menu bottom + gap (use for sticky top)
   - --ct-header-bottom : legacy alias of --ct-bluebar-top
   - --ct-scroll-pad  : scroll-margin-top padding
*/
(function () {
  "use strict";
  var GAP = 12; // small white gap under Weebly menu

  // Candidate selectors for the actual site MENU (not the big hero/header)
  var MENU_SELS = [
    '.wsite-nav', '.wsite-menu-default', '.wsite-menus',
    '.w-nav', '.nav-wrapper', '.navbar',
    '.siteHeader .nav', '.desktop-nav', '.top-nav',
    'nav[role="navigation"]', '.site-navigation'
  ];

  function menuBottomPx(){
    var best = 120; // sensible default
    for (var i=0;i<MENU_SELS.length;i++){
      var el = document.querySelector(MENU_SELS[i]);
      if(!el) continue;
      var r = el.getBoundingClientRect();
      var h = r.height;
      // "menu-like": modest height and near the top
      var plausible = h >= 36 && h <= 160 && r.top >= -10 && r.top <= 200;
      if (plausible) best = Math.max(best, Math.round(r.bottom));
    }
    // Clamp to ignore tall hero headers pushing content too far down
    var clamped = Math.max(80, Math.min(160, best));
    // Optional hard override for tricky themes
    try {
      var force = localStorage.getItem('ct_force_header_px');
      if (force) clamped = parseInt(force,10) || clamped;
    } catch (e) {}
    return clamped;
  }

  function apply(){
    var menuBtm = menuBottomPx();
    var blueTop = menuBtm + GAP;

    var root = document.documentElement;
    root.style.setProperty('--ct-menu-bottom', menuBtm + 'px');
    root.style.setProperty('--ct-bluebar-top', blueTop + 'px');
    root.style.setProperty('--ct-header-bottom', blueTop + 'px'); // legacy alias used by older pages
    root.style.setProperty('--ct-scroll-pad', (blueTop + 10) + 'px');
    root.classList.add('ct-layout-ready');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', apply);
  } else {
    apply();
  }
  // Recompute on resize/orientation (avoid scroll to reduce jumpiness)
  window.addEventListener('resize', apply, {passive:true});
  window.addEventListener('orientationchange', apply, {passive:true});
})();
