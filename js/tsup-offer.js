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
 *   2. Appends it to the offer link's own s1= so attribution carries over:
 *        https://appflowconnect.com/c/testerup-us-mon-off?s1=<incoming s1>
 *   3. Wires the CTA (+ the Quick Tip "Got it" button) to that URL, showing
 *      the Quick Tip interstitial first, then continuing to the offer.
 *
 * s1 CARRY-OVER:
 *   Whatever s1 value rides the lander URL (?s1=SPK123) is url-encoded and
 *   placed after s1= at the end of the offer link. If no s1 is present we fall
 *   back to the mc_attr-derived id (same behaviour the FC lander used) so the
 *   offer link's s1 is never left empty.
 */
(function () {
  'use strict';

  // ---- OUR offer link, on OUR cloaker domain. ----
  // Was the bare network URL monetisetrk8.co.uk/?a=26648&c=56132 — same advertiser and
  // campaign, but a hop we do not run: nothing we can cap, kill, or reconcile, and it
  // ignored this repo's OFFER_LINKS entirely. /c/testerup-us-mon-off resolves to that
  // same campaign (a=26648&c=56132) and forwards the sub-id as s1.
  var OFFER_BASE = 'https://appflowconnect.com/c/testerup-us-mon-off?s1=';

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

  // ---- Build the final offer URL: incoming s1 carried onto the offer's s1=. ----
  // Forward ONLY s3 (the TikTok ad account the SPRK launcher stamps on every ad link) so the
  // per-account breakdown survives this hop. This CTA goes DIRECT to the network tracker (no SPRK
  // door): s2/s4 have no consumer here and s5 is the network's click_id echo slot, so only s3 rides.
  var s3v = q.get('s3') || '';
  var extra = s3v ? '&s3=' + encodeURIComponent(s3v) : '';
  var offerUrl = OFFER_BASE + encodeURIComponent(s1) + extra;

  // ---- Wire the CTA with the Quick Tip interstitial, then continue to the offer. ----
  function wire() {
    var overlay = document.getElementById('tipOverlay');
    var tipGo = document.getElementById('tipGo');
    if (tipGo) tipGo.href = offerUrl; // "Got it" goes to the offer

    function openTip(e) {
      if (e) e.preventDefault();
      if (!overlay) { location.href = offerUrl; return; } // no overlay -> go straight through
      overlay.hidden = false;
      document.body.style.overflow = 'hidden';
    }
    function closeTip() {
      if (overlay) overlay.hidden = true;
      document.body.style.overflow = '';
    }

    document.querySelectorAll('a.offer-link, a.store-combo').forEach(function (a) {
      a.setAttribute('href', offerUrl);     // fallback if the click handler is blocked
      a.addEventListener('click', openTip); // intercept -> show the tip first
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
