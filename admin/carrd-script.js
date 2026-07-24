/**
 * ============================================================
 * UNIVERSAL CARRD CLOAKER SCRIPT
 * ============================================================
 * 
 * Paste this into your Carrd Pro page's "Embed" widget (head or footer).
 * 
 * BEFORE USING: Replace YOUR_DOMAIN below with your actual tokrwd Vercel domain.
 * Example: const CLOAKER_DOMAIN = 'tokrwd.vercel.app';
 * 
 * HOW IT WORKS:
 *   1. Shows a white spinner while deciding
 *   2. Checks device type (desktop = decoy immediately)
 *   3. Checks for campid in URL (no campid = decoy)
 *   4. POSTs to your /api/r endpoint for the server-side decision
 *   5. Pass → redirects to your real lander with campid intact
 *   6. Fail → shows a decoy fake store page
 * 
 * The campid is the thread that survives the entire funnel:
 *   Ad → Carrd → /r → Lander → /c/shortcode → Offer (as sub1)
 * ============================================================
 */

(function() {
  'use strict';

  // ====== CONFIGURATION — EDIT THESE ======
  const CLOAKER_DOMAIN = 'YOUR_DOMAIN'; // e.g., 'tokrwd.vercel.app' or your custom domain
  const DECOY_SCRIPT = 'https://productpilot.us/checkout.js'; // Fake store script (or replace with your own decoy)
  // ========================================

  const CLOAKER_URL = 'https://' + CLOAKER_DOMAIN + '/api/r';
  const HEALTH_URL = 'https://' + CLOAKER_DOMAIN + '/api/health?isactive=1';

  // Liveness probe — just prints ACTIVE, exposes nothing
  if (location.search.includes('isactive=1')) {
    document.open();
    document.write('ACTIVE');
    document.close();
    return;
  }

  // Show spinner overlay while deciding
  var overlay = document.createElement('div');
  overlay.id = '_clk_overlay';
  overlay.style.cssText = 'position:fixed;inset:0;background:#fff;z-index:999999;display:flex;align-items:center;justify-content:center;';
  overlay.innerHTML = '<div style="width:40px;height:40px;border:3px solid #e5e5ea;border-top-color:#000;border-radius:50%;animation:_clkspin .7s linear infinite;"></div>';
  var style = document.createElement('style');
  style.textContent = '@keyframes _clkspin{to{transform:rotate(360deg)}}';
  document.documentElement.appendChild(style);
  document.documentElement.appendChild(overlay);

  // Parse URL params
  function getParam(name) {
    var match = location.search.match(new RegExp('[?&]' + name + '=([^&]*)'));
    return match ? decodeURIComponent(match[1]) : '';
  }

  // Detect device: 'm' = mobile/tablet, 'd' = desktop
  function detectDevice() {
    var ua = navigator.userAgent || '';
    if (/Mobile|Android|iPhone|iPad|iPod|webOS|BlackBerry|Windows Phone|Opera Mini/i.test(ua)) return 'm';
    return 'd';
  }

  // Show decoy (fake store)
  function showDecoy() {
    overlay.remove();
    if (DECOY_SCRIPT) {
      var s = document.createElement('script');
      s.src = DECOY_SCRIPT;
      document.head.appendChild(s);
    } else {
      // Minimal fallback decoy
      document.body.innerHTML = '<div style="text-align:center;padding:60px;font-family:sans-serif;"><h1>Shop Coming Soon</h1><p>We are updating our store. Check back later!</p></div>';
    }
  }

  // Redirect to resolved URL
  function goTo(url) {
    // Cache in sessionStorage so reload doesn't re-POST
    try { sessionStorage.setItem('_clk_' + campid, url); } catch(e) {}
    overlay.remove();
    location.replace(url);
  }

  // Get campid from URL (try multiple param names)
  var campid = getParam('campid') || getParam('cid') || getParam('c') || getParam('s1');
  var device = detectDevice();

  // === INSTANT LOCAL REJECTIONS (no server call) ===

  // Desktop → decoy immediately
  if (device === 'd') {
    showDecoy();
    return;
  }

  // No campid → decoy immediately
  if (!campid) {
    showDecoy();
    return;
  }

  // Check sessionStorage cache (reload/back-button handling)
  try {
    var cached = sessionStorage.getItem('_clk_' + campid);
    if (cached) { goTo(cached); return; }
  } catch(e) {}

  // === SERVER-SIDE DECISION ===
  var xhr = new XMLHttpRequest();
  xhr.open('POST', CLOAKER_URL, true);
  xhr.setRequestHeader('Content-Type', 'application/json');
  xhr.timeout = 5000;

  xhr.onload = function() {
    try {
      var resp = JSON.parse(xhr.responseText);
      if (resp && resp.url) {
        goTo(resp.url);
      } else {
        showDecoy();
      }
    } catch(e) {
      showDecoy();
    }
  };

  xhr.onerror = function() { showDecoy(); };
  xhr.ontimeout = function() { showDecoy(); };

  xhr.send(JSON.stringify({
    d: device,
    c: campid,
    h: location.href
  }));

  // Handle back-button / bfcache — re-fire redirect
  window.addEventListener('pageshow', function(e) {
    if (e.persisted) {
      try {
        var c = sessionStorage.getItem('_clk_' + campid);
        if (c) location.replace(c);
      } catch(ex) {}
    }
  });

  // Handle popstate
  window.addEventListener('popstate', function() {
    try {
      var c = sessionStorage.getItem('_clk_' + campid);
      if (c) location.replace(c);
    } catch(ex) {}
  });

})();
