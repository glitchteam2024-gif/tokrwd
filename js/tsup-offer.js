/*!
 * Testerup (TSUP) offer wiring — single-file include.
 *
 * WHY THIS FILE EXISTS:
 *   The raw offer link is kept OUT of the lander HTML on purpose. The lander
 *   (/TSUP/index.html) never contains the destination URL — it only loads this
 *   script, which builds the link at runtime and attaches it to the CTA. Swap
 *   the offer here and every TSUP lander updates; the markup never changes.
 *
 * WHAT IT DOES:
 *   1. Reads the incoming SubID (?s1=) off the lander URL (the tagged click).
 *   2. Appends it as the ONE outbound param, and appends nothing when there is none:
 *        https://appflowconnect.com/c/testerup-us-mon-off?s1=<incoming s1>
 *   3. Wires the CTA (+ the Quick Tip "Got it" button) straight to that URL.
 *
 * s1 CARRY-OVER:
 *   Whatever s1 value rides the lander URL (?s1=SPK123) is url-encoded and
 *   placed after s1= at the end of the offer link. If no s1 is present we fall
 *   back to the mc_attr-derived id. If neither exists the link carries NO s1 at all —
 *   an untagged visit attributes to nobody rather than to a blank sub-id.
 */
(function () {
  'use strict';

  // ---- OUR offer link, on OUR cloaker domain. ----
  // Was the bare network URL monetisetrk8.co.uk/?a=26648&c=56132 — same advertiser and
  // campaign, but a hop we do not run: nothing we can cap, kill, or reconcile, and it
  // ignored this repo's OFFER_LINKS entirely. /c/testerup-us-mon-off resolves to that
  // same campaign (a=26648&c=56132) and forwards the sub-id as s1.
  var OFFER_BASE = 'https://appflowconnect.com/c/testerup-us-mon-off';

  // ---- Resolve the incoming SubID (s1) from the lander URL. ----
  var q = new URLSearchParams(location.search);
  var s1 = q.get('s1');
  if (!s1) {
    // Fallback: derive from mc_attr (e=<spark> .. c=<code>) if s1 wasn't passed directly.
    var mc = q.get('mc_attr') || '', f = {};
    mc.split('..').forEach(function (kv) {
      var i = kv.indexOf('=');
      if (i > 0) f[kv.slice(0, i)] = kv.slice(i + 1);
    });
    s1 = f.e || f.c || '';
  }

  /* SPRK-S1-ONLY v5 — one param out: the affiliate code, nothing else.
     s3 used to ride along here for a per-ad-account breakdown; it does not any more.
     An empty code appends NOTHING — the old base ended in '?s1=' so an untagged visit shipped a
     blank s1=, which reads downstream as a real-but-empty sub-id rather than as no sub-id. */
  var offerUrl = s1
    ? OFFER_BASE + (OFFER_BASE.indexOf('?') > -1 ? '&' : '?') + 's1=' + encodeURIComponent(s1)
    : OFFER_BASE;

  // ---- Wire the CTA with the Quick Tip interstitial, then continue to the offer. ----
  function wire() {
    var overlay = document.getElementById('tipOverlay');
    var tipGo = document.getElementById('tipGo');
    if (tipGo) tipGo.href = offerUrl; // "Got it" goes to the offer

    function closeTip() {
      if (overlay) overlay.hidden = true;
      document.body.style.overflow = '';
    }

    document.querySelectorAll('a.offer-link, a.store-combo').forEach(function (a) {
      a.setAttribute('href', offerUrl);
      /* NO CLICK INTERCEPT. This used to be `a.addEventListener('click', openTip)`, and openTip()
         calls preventDefault() — so the FIRST tap opened the overlay instead of going to the offer
         and the visitor had to find 'Got it' to leave. That is the "they tap the button and nothing
         happens" report, fixed across every other lander on 2026-08-17; this file was missed.
         The href is already the finished offer URL, so the anchor now navigates natively on the
         first tap, works with JS half-loaded, and long-press / open-in-new-tab behave properly.
         The overlay markup stays and tipGo carries the same URL. Do not re-bind this. */
    });

    var tipClose = document.getElementById('tipClose');
    if (tipClose) tipClose.addEventListener('click', closeTip);
    if (overlay) overlay.addEventListener('click', function (e) {
      if (e.target === overlay) closeTip();
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', wire);
  } else {
    wire();
  }
})();
