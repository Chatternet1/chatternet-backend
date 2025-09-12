<script>
// Chatternet layout shim — keeps your blue bars & overlays tucked right under the Weebly header.
(function () {
  "use strict";

  // Every selector Weebly themes and your pages commonly use for the top header/nav area.
  var HEADER_SELS = [
    '.wsite-header', '.wsite-menus', '.wsite-nav', '.w-nav', '.w-nav-header',
    '.edison-header', 'header', '.navbar', '.nav-wrapper', '.siteHeader',
    '.desktop-nav', '.top-nav', '.wsite-theme-header'
  ];

  function headerBottomPx() {
    var b = 0;
    for (var i = 0; i < HEADER_SELS.length; i++) {
      var el = document.querySelector(HEADER_SELS[i]);
      if (!el) continue;
      var r = el.getBoundingClientRect();
      var mb = parseFloat(getComputedStyle(el).marginBottom || 0);
      // compute from page top (includes scroll)
      var bottom = (r.bottom + mb) + window.scrollY;
      if (bottom > b) b = bottom;
    }
    return Math.round(b);
  }

  function setVars() {
    // The physical pixel line where the site header ends:
    var siteHeaderBottom = headerBottomPx();

    // Convert to viewport offset (sticky top wants a viewport coordinate).
    var viewportTop = siteHeaderBottom - window.scrollY;
    if (viewportTop < 0) viewportTop = 0;

    // Expose as CSS vars
    var root = document.documentElement;
    root.style.setProperty('--ct-header-bottom', viewportTop + 'px');

    // Nice: make anchor jumps land below the header
    root.style.setProperty('--ct-scroll-pad', (viewportTop + 10) + 'px');
    root.style.scrollPaddingTop = 'var(--ct-scroll-pad)';

    // Mark ready once to allow pages to target when the value exists
    if (!root.classList.contains('ct-layout-ready')) {
      root.classList.add('ct-layout-ready');
    }
  }

  // Run now and whenever things might move.
  setVars();
  ['load','resize','orientationchange','scroll'].forEach(function(ev){
    window.addEventListener(ev, setVars, { passive: true });
  });

  // If Weebly swaps headers in after load, watch DOM and recalc.
  try {
    var mo = new MutationObserver(function(){ setVars(); });
    mo.observe(document.documentElement, { childList: true, subtree: true });
  } catch(e) {}
})();
</script>
