/* === Chatternet global layout bootstrap (drop-in) ======================
   Loads /assets/ct-layout.js once and applies safe defaults so every
   page puts the blue .top-bar directly under the Weebly header.
   Works on Render and Weebly (with absolute fallback URL).
======================================================================= */
(function () {
  var LAYOUT_ID = 'ct-layout-js';
  var CSS_ID    = 'ct-layout-css';

  function injectCSS(css, id){
    if (id && document.getElementById(id)) return;
    var st = document.createElement('style');
    if (id) st.id = id;
    st.textContent = css;
    document.head.appendChild(st);
  }
  function loadOnce(url, id){
    if (id && document.getElementById(id)) return;
    var s = document.createElement('script');
    s.src = url;
    s.async = true;
    if (id) s.id = id;
    (document.head || document.documentElement).appendChild(s);
  }

  /* 1) Global CSS so pages don’t need per-file tweaks */
  injectCSS(
    ':root{--ct-header-bottom:0px;--ct-scroll-pad:10px;}'
    + 'html{scroll-padding-top:var(--ct-scroll-pad,10px);}'
    + '.top-bar{position:sticky;top:var(--ct-header-bottom,0px);z-index:3000;}',
    CSS_ID
  );

  /* 2) Try same-origin ct-layout.js, then fall back to Render */
  (function loadLayout() {
    if (document.getElementById(LAYOUT_ID)) return;
    var s = document.createElement('script');
    s.id = LAYOUT_ID;
    s.async = true;
    s.src = '/assets/ct-layout.js';
    s.onerror = function () {
      s.remove();
      loadOnce('https://chatternet-backend-1.onrender.com/assets/ct-layout.js', LAYOUT_ID);
    };
    (document.head || document.documentElement).appendChild(s);
  })();

  /* 3) Tiny built-in fallback measurer (works even if ct-layout.js fails) */
  function clamp(n,min,max){ return Math.max(min, Math.min(max, n)); }
  function measureHeader() {
    var sels = [
      '.edison-header','.wsite-header','.nav.desktop-nav','.navbar',
      '.w-nav','.w-nav-header','header','.site-header','.app-nav','.top-nav'
    ];
    var b = 0;
    for (var i=0;i<sels.length;i++){
      var el = document.querySelector(sels[i]);
      if (!el) continue;
      var r = el.getBoundingClientRect();
      var mb = parseFloat(getComputedStyle(el).marginBottom || 0);
      b = Math.max(b, r.bottom + mb);
    }
    // Apply CSS vars
    var pad = clamp(b + 10, 0, 240);
    document.documentElement.style.setProperty('--ct-header-bottom', b + 'px');
    document.documentElement.style.setProperty('--ct-scroll-pad', pad + 'px');
  }
  function scheduleMeasures(){
    measureHeader();
    setTimeout(measureHeader, 120);
    setTimeout(measureHeader, 400);
    setTimeout(measureHeader, 1200);
  }

  scheduleMeasures();
  window.addEventListener('resize', scheduleMeasures, {passive:true});
  window.addEventListener('orientationchange', scheduleMeasures, {passive:true});
  try{
    var mo = new MutationObserver(function(){ measureHeader(); });
    mo.observe(document.documentElement, {childList:true,subtree:true,attributes:true});
  }catch(e){}
})();
