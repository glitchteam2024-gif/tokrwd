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
 *      escape blocked, user tapped "continue here", the post-tap watchdog fired, or
 *      the strand net carried a visitor who never interacted at all.
 *   6. THE SCHEME IS ONLY EVER FIRED BY A TAP (2026-08-10). Nothing on this page
 *      navigates to an OS scheme on a timer. A gesture is not decoration here: iOS
 *      honours a custom scheme far more readily when it carries user activation, and
 *      the auto-fire this replaced was the case most likely to be silently dropped.
 *      A future edit that "helpfully" restores an automatic escape reverses that, and
 *      re-adds the AUTO_FIRE signature below.
 *
 * Our own QA harness (api/signatures.js) scores this page over BLOCK_THRESHOLD on
 * SCHEME_BREAKOUT + INAPP_UA_SNIFF (90). It USED to also trip AUTO_FIRE (weight 40,
 * total 130); rule 6 removed it. That is expected and correct — the detector's job is
 * to find this mechanism, and this is the one page that runs it on purpose. If it
 * starts matching anywhere ELSE in the repo, that is a real finding;
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
    '50fc', '50fcii', '50tu', 'ac50', 'acash', 'acsm', 'ah50', 'ashl', 'ashurl', 'as50', 'sasurl', 'af50', 'ak50', 'ap50', 'apay1k',
    'ac51', 'ac52', 'af51', 'af52', 'ak51', 'ak52', 'ap51', 'ap52',
    // Slices 53 + 54, added 2026-08-09. MUST stay in sync with PRELANDER_ALLOWED_ROOTS in
    // api/_lib/links-config.js — _links-config.test.mjs reads this file off disk and fails the
    // build when the two lists differ.
    'ac53', 'ac54', 'af53', 'af54', 'ak53', 'ak54', 'ap53', 'ap54',
    'ac55', 'af55', 'ak55', 'ap55',
    // Bespoke, single-affiliate pages: acsm/as50/sasurl, ashl/ah50/ashurl, plus the two that
    // belong to notkerman — kerm/km50/saskrurl (Apple Pay) and shkm/sk50/shkrurl (Shein).
    // NOTE: no apostrophes in this block. _links-config.test.mjs parses these roots by scanning
    // for single-quoted literals, so a contraction in a comment reads as a string and fails.
    'kerm', 'km50', 'saskrurl',
    'shkm', 'sk50', 'sk51', 'sk52', 'sk53', 'sk54', 'sk55', 'sk56', 'shkrurl',
    // ravi/rv50..rv53/ravurl is ONE design on all four English geos of Playful Rewards, one
    // clone family each; only the flagship carries a vanity path. Printed by
    // node _lp-generator/ravi-playful.js on every run.
    'ravi', 'rv50', 'rv51', 'rv52', 'rv53', 'ravurl',
    'apay750', 'apayfp', 'cash', 'cb', 'cb50', 'cbak', 'clfc', 'clfcca', 'clfcuk',
    'cltu', 'cr50', 'cs50', 'esgp', 'fc', 'fcash', 'fctt.html', 'gp', 'pg50', 'pgrd',
    'play', 'pr50', 'rs', 'rs50', 'rewards', 'sb50', 'seph', 'sh50', 'shb2s', 'shein',
    'shrtl', 'sr50',
    'sp50', 'tsup',
    'tu', 'uber', 'ue50', 'trt'
  ];

  /** Never forwardable, whatever the allowlist says. Belt to the allowlist's braces. */
  // 'safe' is here for the same reason as 'pre': to=/safe would spend the budget landing paid
  // traffic on the page whose entire job is to be the one that does NOT convert.
  var RESERVED_ROOTS = ['api', 'c', 'r', 'pre', 'admin', 'js', 'images', 'postback', 'safe'];

  /* ESCAPE_AT_MS (250) was the auto-fire delay and is GONE as of 2026-08-10 — the handoff is now
     tap-initiated, so there is no timer that fires a scheme. Removed rather than left at 0: a
     lingering constant is how a future edit "restores" the auto-fire without realising the gesture
     is the point. See the wiring block below. */

  /** Last resort for a visitor who never interacts at all. Deliberately long — see the strand net. */
  var STRAND_AT_MS = 15000;
  /** Reveal the manual instructions if we are still here. */
  var HINT_AT_MS = 1500;
  /** Last resort: load the lander in place rather than strand a paid click.
   *
   *  6000 -> 2000 on 2026-08-10. This timer ONLY ever runs when the handoff has already failed —
   *  a successful escape clears it via markLeft() — so every millisecond of it is time a visitor
   *  spends looking at "Almost there" for nothing. On iOS that is not an edge case: iosEscape()
   *  fires an UNDOCUMENTED scheme that WKWebView drops SILENTLY (see its comment), so when the
   *  host does not honour it, EVERY iOS visitor served the full six seconds before the lander even
   *  began loading. Stacked on the page loads either side, that was ~9s of dead air on cold paid
   *  mobile traffic, and it is the leading suspect for the drop-off this instrumentation exists to
   *  measure.
   *
   *  Why 2000 and not lower: iOS can show a "Open in Safari?" confirmation, and navigating the
   *  webview out from under that dialog would cancel a handoff that was about to succeed. 2s
   *  clears a prompt a decisive user has already answered while cutting 4s off the failure path.
   *  EscapeGaveUp below measures how often this fires — if it is near-zero the scheme is working
   *  and this can stay; if it is near-100% the kicker is buying nothing on iOS and should go. */
  var GIVE_UP_AT_MS = 2000;

  /** Fire a funnel event. Delegates to the page's own tracker (pre/index.html defines __trk over
   *  the TikTok pixel) and is a no-op anywhere that ships without one — the escape path must never
   *  depend on, or be broken by, analytics. */
  function trk(name, props) {
    try { if (typeof window.__trk === 'function') window.__trk(name, props); } catch (e) {}
  }

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
      // The visitor is stranded here by a mis-built ad link or a slice missing from ALLOWED_ROOTS.
      // No navigation follows, so this event always has time to send — it is fully reliable.
      trk('PreNoTarget', { content_name: 'pre no target' });
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
      // Not a webview, so no handoff is needed and none is attempted. Splitting this from
      // EscapeFired is what stops desktop and crawler traffic from flattering the escape rate.
      trk('EscapeDirect', { content_name: 'escape not needed' });
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
      // Second time through on this target in the same session: they left and came back, which
      // means the handoff did not stick. High counts here say the scheme is failing, not landing.
      trk('PreReturned', { content_name: 'returned to webview' });
      location.replace(target);
      return;
    }
    try {
      sessionStorage.setItem(SESSION_KEY + target, '1');
    } catch (e) { /* not fatal */ }

    // ── in-app browser: try to hand off, but never strand the click ──
    var left = false;
    var giveUp = null;
    // Set the moment a tap sends the scheme. The strand net reads it so a visitor who DID act is
    // never yanked to the in-webview lander underneath a handoff that is still resolving.
    var escaped = false;

    /** Show the manual route: the instructions, Copy link, and Continue here.
     *
     *  TWO STAGES, because the right advice depends on whether they have tried the arrow yet.
     *  Before a tap, telling someone to hunt for the OS menu is wrong — the arrow is right there
     *  and is the path most likely to work. Only AFTER a tap has failed to hand off does the OS
     *  menu become the useful instruction. Shipping the post-tap copy on the 1.5s timer would have
     *  told every visitor to go menu-diving past a button they had not pressed. */
    function reveal(afterTap) {
      if (card) card.setAttribute('data-stage', 'hint');
      if (!hint) return;
      hint.textContent = afterTap
        ? (isAndroid
            ? 'Still here? Tap the ⋮ menu at the top and choose "Open in browser".'
            : 'Still here? Tap the ••• menu at the bottom and choose "Open in browser".')
        : 'Tap the arrow above to open your reward page, or carry on here.';
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
      reveal(true);
    });
    window.addEventListener('pagehide', markLeft);

    if (stay) {
      stay.addEventListener('click', function () {
        // They gave up on the handoff and chose to carry on inside the webview. Every one of these
        // is a visitor the kicker cost time and did not help.
        trk('PreManual', { content_name: 'continue here' });
      });
    }

    // ── TAP-INITIATED, NOT AUTO-FIRED (2026-08-10) ───────────────────────────────────────────
    // The scheme used to go out on a 250ms timer with no gesture behind it. Two reasons that was
    // the wrong shape, and they compound:
    //
    //   1. iOS. A custom scheme carried by USER ACTIVATION is honoured far more readily than a
    //      programmatic navigation the visitor never asked for. iosEscape() fires an undocumented
    //      scheme that WKWebView drops SILENTLY — an auto-fire is the case most likely to be
    //      dropped, and it was firing for every single in-app visitor.
    //   2. The wait was pure loss. When the scheme was dropped the visitor sat watching a spinner
    //      until the watchdog rescued them, having never been asked to do anything.
    //
    // It also removes AUTO_FIRE (weight 40) from this page's own signature score in
    // api/signatures.js — 130 -> 90. Still over BLOCK_THRESHOLD on SCHEME_BREAKOUT +
    // INAPP_UA_SNIFF, which is expected and correct for the one page that runs this on purpose,
    // but strictly less machinery pointed at the visitor.
    //
    // ⚠️ RULE 5 STILL HOLDS: the click is never lost. Nothing auto-fires a SCHEME any more, but a
    //    visitor who never taps is still carried to the lander in place by the strand net below.
    //    Removing that net would turn every undecided visitor into a paid click that bought a
    //    dead-end page.
    if (open) {
      open.addEventListener('click', function (e) {
        e.preventDefault();
        escaped = true;
        trk('EscapeFired', { content_name: isIOS ? 'escape ios' : (isAndroid ? 'escape android' : 'escape other') });

        // Reveal on the FIRST tap. On iOS the scheme is best-effort and gets dropped silently, so
        // a tap that appears to do nothing must still leave the visitor somewhere to go.
        reveal(true);
        escape_(target);

        // The watchdog starts HERE, not on page load. It only ever runs when a real tap has
        // already failed to hand off, which is the only moment its 2s is meaningful — before the
        // tap there is nothing to wait for.
        if (giveUp) clearTimeout(giveUp);
        giveUp = setTimeout(function () {
          if (left || document.hidden) return;
          // THE KEY METRIC. Reaching here means a genuine tap did NOT hand off — the strongest
          // evidence available that the scheme is being dropped, because it now carries user
          // activation and still failed. RELIABLE: fires 2s in, SDK long loaded.
          //
          // Ratio against EscapeFired. Near-zero => the scheme lands, the kicker earns its place.
          // Near-parity => it is dropped even from a real gesture, the kicker is buying nothing on
          // iOS, and it should come out.
          trk('EscapeGaveUp', { content_name: isIOS ? 'gave up ios' : (isAndroid ? 'gave up android' : 'gave up other') });
          location.replace(target);
        }, GIVE_UP_AT_MS);
      });
    }

    // Surface the manual route on its own timer so a visitor who hesitates still sees "Continue
    // here" without having to tap the arrow first.
    setTimeout(function () {
      if (left || document.hidden) return;
      reveal();
    }, HINT_AT_MS);

    // ── The strand net ───────────────────────────────────────────────────────────────────────
    // No tap, no scheme, no navigation — just a paid visitor sitting on a page that is not the
    // offer. Long on purpose: this is a floor, not a flow, and it must never pre-empt someone who
    // is reading the page or answering an "Open in Safari?" prompt. Anyone still here at
    // STRAND_AT_MS has not engaged, so putting the lander in front of them is strictly better than
    // leaving them where they are.
    setTimeout(function () {
      if (left || document.hidden || escaped) return;
      trk('PreStranded', { content_name: 'no interaction' });
      location.replace(target);
    }, STRAND_AT_MS);

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
