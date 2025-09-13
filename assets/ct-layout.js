/* Chatternet Layout Shim (NAV-ABOVE-BLUE-BAR) */
(function () {
  "use strict";
  var MENU_SELS=['.wsite-nav','.wsite-menu-default','.wsite-menus','.w-nav','.nav-wrapper','.navbar','.siteHeader .nav','.desktop-nav','.top-nav','nav[role="navigation"]','.site-navigation'];
  function menuBottomPx(){
    var best=120;
    for (var i=0;i<MENU_SELS.length;i++){
      var el=document.querySelector(MENU_SELS[i]); if(!el) continue;
      var r=el.getBoundingClientRect(), h=r.height;
      var plausible = h>=36 && h<=160 && r.top>=-10 && r.top<=200;
      if (plausible) best=Math.max(best, Math.round(r.bottom));
    }
    var clamped=Math.max(80, Math.min(160, best));
    try{ var force=localStorage.getItem('ct_force_header_px'); if(force) clamped=parseInt(force,10)||clamped; }catch(e){}
    return clamped;
  }
  function apply(){
    var top=menuBottomPx();
    var root=document.documentElement;
    root.style.setProperty('--ct-header-bottom', top + 'px');
    root.style.setProperty('--ct-scroll-pad', (top+10) + 'px');
    root.classList.add('ct-layout-ready');
  }
  apply();
  window.addEventListener('resize', apply, {passive:true});
  window.addEventListener('orientationchange', apply, {passive:true});
})();
