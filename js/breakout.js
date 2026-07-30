/**
 * /js/breakout.js — the ONLY file in this repo that performs an in-app-browser escape.
 *
 * It powers exactly one page, /pre (pre/index.html), which sits between /r and the
 * lander. TikTok's in-app webview has been failing on real devices, so the job here is
 * to hand the visitor to their real browser before they reach the offer page.
 *
 * ══ WHY THIS IS NOT THE CLOAKING THAT WAS REMOVED ON 2026-07-21 ══
 *
 * The archived prelanders in justincase/ were removed because of `looksLikeReview()`:
 * they scored the visitor and served ad-review traffic a DIFFERENT PAGE with a
 * DIFFERENT DESTINATION. That is cloaking and it is what gets a domain flagged.
 *
 * Nothing in this file does that. The rules it holds to, and which must survive any
 * future edit:
 *
 *   1. ONE destination for everyone. `to` decides where the visitor goes. No user
 *      agent, IP, device or bot check ever changes the destination — only which
 *      MECHANISM opens it.
 *   2. ONE page for everyone. The markup in pre/index.html is fully rendered before
 *      this script runs and is never hidden, blanked or swapped. There is no
 *      `display:none` gate and no `document.write`.
 *   3. NO review detection of any kind. There is deliberately no `looksLikeReview()`,
 *      no `navigator.webdriver` test, no plugin/WebGL fingerprint. A crawler that
 *      loads /pre gets the same page and the same lander as a buyer.
 *   4. The user agent is read for exactly one reason: an OS URL scheme only exists on
 *      one OS, and firing `x-safari-https://` in real Safari produces a visible
 *      "address is invalid" error page. So the scheme is attempted ONLY inside a
 *      detected in-app webview; every real browser is sent straight through with
 *      `location.replace`, which is also what a crawler gets.
 *   5. The click is never lost. Every path ends at the lander — escape succeeded,
 *      escape blocked, user tapped "continue here", or the watchdog fired.
 *
 * Our own QA harness (api/signatures.js) scores this page well over BLOCK_THRESHOLD,
 * on SCHEME_BREAKOUT + AUTO_FIRE + INAPP_UA_SNIFF. That is expected and correct — the
 * detector's job is to find this mechanism, and this is the one place we run it on
 * purpose. If it starts matching anywhere ELSE in the repo, that is a real finding;
 * _tracking-audit.test.mjs fails the build when it does.
 */
(function () {
  'use strict';

  /**
   * First path segment of every page /pre may forward to.
   *
   * MUST STAY IN SYNC with PRELANDER_ALLOWED_ROOTS in api/_lib/links-config.js —
   * _links-config.test.mjs reads this file off disk and fails the build if the two
   * lists differ, because a drift is silent: /r would emit a `to` this page then
   * refuses, and the visitor would sit on a prelander that goes nowhere.
   *
   * An allowlist rather than a denylist because `to` arrives from a public URL. A
   * free-form path would make /pre a way to fire /c/<slug> (minting sub-IDs with no
   * ad spend), to hit /api/*, or to point at /pre itself and loop forever.
   */
  var ALLOWED_ROOTS = [
    '50fc', '50fcii', '50tu', 'ac50', 'acash', 'af50', 'ak50', 'ap50', 'apay1k',
    'apay750', 'apayfp', 'cash', 'cb', 'cb50', 'cbak', 'clfc', 'clfcca', 'clfcuk',
    'cltu', 'cr50', 'cs50', 'esgp', 'fc', 'fcash', 'fctt.html', 'gp', 'pg50', 'pgrd',
    'play', 'pr50', 'rs', 'rs50', 'rewards', 'seph', 'sh50', 'shein', 'sp50', 'tsup',
    'tu', 'uber', 'ue50', 'trt'
  ];

  /** Never forwardable, whatever the allowlist says. Belt to the allowlist's braces. */
  var RESERVED_ROOTS = ['api', 'c', 'r', 'pre', 'admin', 'js', 'images', 'postback'];

  /** Auto-attempt the handoff once the page has painted. */
  var ESCAPE_AT_MS = 250;
  /** Reveal the manual instructions if we are still here. */
  var HINT_AT_MS = 1500;
  /** Last resort: load the lander in place rather than strand a paid click. */
  var GIVE_UP_AT_MS = 6000;

  var SESSION_KEY = 'tokrwd_pre_';

  var ua = navigator.userAgent || '';
  var isAndroid = /Android/i.test(ua);
  var isIOS = /iPhone|iPad|iPod/i.test(ua) ||
    (/Macintosh/i.test(ua) && (navigator.maxTouchPoints || 0) > 1);

  function params() {
    return new URLSearchParams(location.search);
  }

  /* ── Target resolution ──────────────────────────────────────────────────────
   * Mirrors cleanLanderPath() in api/_lib/links-config.js, and then some, because
   * this runs on a public static page with no server in front of it.
   */

  function cleanPath(raw) {
    // Split on ?/# first, exactly like the server does. JS `$` without /m also
    // matches before a trailing newline, so "/FC\n" would otherwise slip past the
    // charset test below.
    var p = String(raw == null ? '' : raw).split(/[?#]/)[0].trim();
    if (!p || p.length > 200) return '';

    // Collapse leading slashes and backslashes BEFORE anything resolves this
    // against an origin. "//evil.com/x" and "/\evil.com" are both protocol-relative
    // to `new URL()` and would otherwise leave our domain entirely.
    p = '/' + p.replace(/^[\\/]+/, '').replace(/\\/g, '/').replace(/\/{2,}/g, '/');

    if (!/^\/[A-Za-z0-9._/-]*$/.test(p)) return '';
    if (p.split('/').indexOf('..') !== -1) return '';
    if (p === '/') return '';

    var root = p.split('/')[1].toLowerCase();
    if (RESERVED_ROOTS.indexOf(root) !== -1) return '';
    if (ALLOWED_ROOTS.indexOf(root) === -1) return '';
    return p; // original casing — Vercel serves paths case-sensitively (/ESGP)
  }

  /**
   * The absolute lander URL this prelander hands over to, or '' when `to` is absent
   * or does not pass. Returning '' rather than guessing is deliberate: a guessed
   * destination would credit an offer nobody chose.
   */
  function buildTarget() {
    var path = cleanPath(params().get('to'));
    if (!path) return '';

    var u;
    try {
      u = new URL(path, location.origin);
    } catch (e) {
      return '';
    }
    // The path form above cannot produce a foreign origin, but assert it anyway —
    // this is the single check standing between a public query param and an open
    // redirect on www.tokrwd.co.
    if (u.origin !== location.origin) return '';

    var q = params();
    // `to` routes THIS page and nothing downstream. The generated landers forward
    // every param they receive to the door, so a leftover to=/50FC/FC7 would ride
    // all the way into the network's reports as junk.
    q.delete('to');
    q.delete('preview');

    var qs = q.toString();
    return u.origin + u.pathname + (qs ? '?' + qs : '');
  }

  /* ── In-app webview detection ───────────────────────────────────────────────
   * Chooses the MECHANISM only. Both branches end at the same `target`.
   */

  var IN_APP_UA = [
    /musical_ly|BytedanceWebview|Bytedance|TikTok/i,
    /Instagram/i,
    /FBAN|FBAV|FB_IAB|FB4A|FBIOS/i,
    /Messenger/i,
    /Snapchat/i,
    /Twitter/i,
    /LinkedInApp/i,
    /Line\//i,
    /MicroMessenger/i,
    /Pinterest/i
  ];

  function inAppBrowser() {
    for (var i = 0; i < IN_APP_UA.length; i++) {
      if (IN_APP_UA[i].test(ua)) return true;
    }
    // Android WebViews tag themselves `wv`.
    if (isAndroid && /\bwv\b/i.test(ua)) return true;
    // Every real iOS browser carries "Safari" (or its own CriOS/FxiOS/EdgiOS token);
    // a WKWebView embedded in an app does not.
    if (isIOS && !/Safari/i.test(ua) && !/CriOS|FxiOS|EdgiOS/i.test(ua)) return true;
    return false;
  }

  /* ── The escapes ────────────────────────────────────────────────────────────*/

  /**
   * Android: hand the https URL to whatever the user has set as their browser.
   *
   * `S.browser_fallback_url` matters — without it a device with no BROWSABLE https
   * handler throws ActivityNotFoundException and the visitor sees an error instead
   * of the page. `#` and `;` are escaped because everything after `#Intent` is a
   * ';'-delimited, '#'-terminated grammar: a `#` in a forwarded ttclid would
   * truncate the target, and a `;` can inject intent extras.
   */
  function androidEscape(target) {
    var rest = target.replace(/^https?:\/\//, '').replace(/#/g, '%23').replace(/;/g, '%3B');
    location.href = 'intent://' + rest +
      '#Intent;scheme=https;' +
      'action=android.intent.action.VIEW;' +
      'category=android.intent.category.BROWSABLE;' +
      'S.browser_fallback_url=' + encodeURIComponent(target) + ';end';
  }

  /**
   * iOS: ask for Safari. This is an undocumented scheme and WKWebView hosts drop
   * unregistered schemes silently, so treat it as best-effort — the visible
   * instructions and the "continue here" path below are the reliable route, not this.
   * Never called outside a detected webview: in real Safari it renders an error page.
   */
  function iosEscape(target) {
    location.href = 'x-safari-' + target;
  }

  function escape_(target) {
    if (isAndroid) return androidEscape(target);
    if (isIOS) return iosEscape(target);
    // Some other webview — nothing OS-specific to try, so go straight through.
    location.replace(target);
  }

  /* ── Wiring ─────────────────────────────────────────────────────────────────*/

  function init() {
    var target = buildTarget();
    var card = document.getElementById('preCard');
    var open = document.getElementById('preOpen');
    var stay = document.getElementById('preStay');
    var hint = document.getElementById('preHint');
    var copy = document.getElementById('preCopy');
    var note = document.getElementById('preNote');

    if (!target) {
      // Nothing safe to forward to. Say so in text rather than guessing a lander;
      // a guessed destination credits an offer nobody bought traffic for.
      if (note) note.textContent = 'This link is missing its destination. Please go back and tap the ad again.';
      if (open) open.style.display = 'none';
      if (stay) stay.style.display = 'none';
      return;
    }

    // Real hrefs, not "#" — the destination is visible in page source, works without
    // JS, and a crawler reading the page sees the same lander a buyer gets.
    if (open) open.setAttribute('href', target);
    if (stay) stay.setAttribute('href', target);

    // The admin panel frames this page to preview it. Render only — never navigate
    // the operator's dashboard, and never fire a scheme in their desktop Chrome.
    if (window.top !== window.self || params().get('preview') === '1') {
      if (card) card.setAttribute('data-preview', '1');
      return;
    }

    // A real browser (and any crawler) goes straight through. No scheme is attempted
    // here: x-safari-https:// in Safari itself renders an error page, and this is
    // where the healthy traffic is.
    if (!inAppBrowser()) {
      location.replace(target);
      return;
    }

    // Returning to the webview after an escape restores this page from bfcache, and
    // the Carrd embed re-fires its saved URL on popstate/pageshow. Without this guard
    // the escape attempt repeats every time the visitor comes back.
    var seen = false;
    try {
      seen = sessionStorage.getItem(SESSION_KEY + target) === '1';
    } catch (e) { /* private mode — fall through and just escape once */ }
    if (seen) {
      location.replace(target);
      return;
    }
    try {
      sessionStorage.setItem(SESSION_KEY + target, '1');
    } catch (e) { /* not fatal */ }

    // ── in-app browser: try to hand off, but never strand the click ──
    var left = false;
    var giveUp = null;

    /** Show the manual route: the instructions, Copy link, and Continue here. */
    function reveal() {
      if (card) card.setAttribute('data-stage', 'hint');
      if (hint) hint.textContent = isAndroid
        ? 'Still here? Tap the ⋮ menu at the top and choose "Open in browser".'
        : 'Still here? Tap the ••• menu at the bottom and choose "Open in browser".';
    }

    function markLeft() {
      left = true;
      if (giveUp) { clearTimeout(giveUp); giveUp = null; }
    }

    // visibilitychange + pagehide, never `blur`: the Android "open with" chooser
    // steals focus, so blur also fires when the user taps Cancel — clearing the
    // watchdog there would leave them on this page with no way forward.
    document.addEventListener('visibilitychange', function () {
      if (document.hidden) { markLeft(); return; }

      // We are BACK, and `left` must NOT stay latched. Something returned them here:
      // a cancelled chooser, a scheme WKWebView dropped, a notification, an app
      // switch. Latched, it silenced the hint AND the watchdog, leaving iOS visitors
      // staring at one button whose scheme had already failed — a dead click, and a
      // paid one.
      //
      // It deliberately does NOT re-navigate. If the handoff actually worked they are
      // reading the lander in their real browser right now, and replacing here would
      // hand them a second copy inside the webview they just escaped. Surfacing the
      // manual route is the move that helps in both cases.
      left = false;
      reveal();
    });
    window.addEventListener('pagehide', markLeft);

    if (open) {
      open.addEventListener('click', function (e) {
        e.preventDefault();
        // Reveal on the FIRST tap. On iOS the scheme is best-effort and gets dropped
        // silently, so a tap that appears to do nothing must still leave the visitor
        // somewhere to go.
        reveal();
        escape_(target);
      });
    }

    setTimeout(function () {
      if (left || document.hidden) return;
      escape_(target);
    }, ESCAPE_AT_MS);

    setTimeout(function () {
      if (left || document.hidden) return;
      reveal();
    }, HINT_AT_MS);

    // If the handoff was blocked and nobody tapped anything, load the lander in
    // place. A worse experience than the real browser, but a live click either way.
    giveUp = setTimeout(function () {
      if (left || document.hidden) return;
      location.replace(target);
    }, GIVE_UP_AT_MS);

    if (copy) {
      copy.addEventListener('click', function (e) {
        e.preventDefault();
        var done = function () { copy.textContent = 'Link copied'; };
        try {
          if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(target).then(done, function () { legacyCopy(target, done); });
          } else {
            legacyCopy(target, done);
          }
        } catch (err) {
          legacyCopy(target, done);
        }
      });
    }
  }

  function legacyCopy(text, done) {
    try {
      var el = document.createElement('textarea');
      el.value = text;
      el.style.cssText = 'position:fixed;top:0;left:0;opacity:0';
      document.body.appendChild(el);
      el.focus();
      el.select();
      document.execCommand('copy');
      document.body.removeChild(el);
      done();
    } catch (e) { /* clipboard unavailable — the buttons still work */ }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
