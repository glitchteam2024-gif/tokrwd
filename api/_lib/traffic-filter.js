// api/_lib/traffic-filter.js — corroboration layer for /r.
//
// The four original gates (campid, device, ttclid, bot-UA) all stay exactly as they are. This
// module only ADDS rejections, and only where two independent signals CONTRADICT each other.
// Nothing here can reject a request that the old gates would have passed unless something about
// it is self-inconsistent.
//
// WHY CONTRADICTION AND NOT MORE REQUIREMENTS
// Every "require header X" rule tested during research turned out to cost more real buyers than
// bots, because the headers that bots forge easily are the same ones real iPhones never send:
//
//   · Sec-CH-UA-* : Chromium sends them; Safari, Safari iOS and Firefox return false for ALL
//                   versions in MDN's compat data (WebKit's standards position is still open).
//                   REQUIRING them drops every iPhone buyer while headless Chromium sails
//                   through — it inverts the threat model. So: read them, never require them.
//   · ttclid shape: there is no published format. Real values measured in the wild span an
//                   underscore form (297 chars, no dots) and a dot form (336 chars), plus a
//                   shorter E.C.P.Preview_ variant. A charset regex or a length floor would
//                   reject genuine click IDs. So: score the shape, never reject on it.
//   · ttclid presence is already required upstream; note it is not a pure bot signal either —
//                   Brave 1.83.x strips the param unconditionally, as do AdGuard and Safari
//                   Link Tracking Protection. Small tail for in-app clicks, real all the same.
//
// WHAT A CONTRADICTION BUYS
// The demonstrated bypass was that `d` is client-asserted: a desktop client that simply POSTs
// `d=m` was served the real destination. Against a scripted replayer, forging a UA header costs
// the same as forging a body field, so server-side UA alone is not a wall. It IS decisive
// against someone driving a real browser, where page JS can edit the POST body but cannot edit
// the User-Agent or the Origin the browser attaches.

/** Explicit desktop platform tokens. Presence alone is not enough — see isPositivelyDesktop. */
const DESKTOP_PLATFORM = /(Windows NT|Macintosh|X11|CrOS)/i;

/** Any token that means "this is a handheld". Mirrors the Carrd embed's own mobile test. */
const MOBILE_TOKEN = /Mobile|Android|iP(hone|od)|IEMobile|BlackBerry|Kindle|Silk-Accelerated|(hpw|web)OS|Opera M(obi|ini)/i;

/**
 * Positive desktop evidence, deliberately conservative: a desktop platform token AND no mobile
 * token anywhere. An unrecognised or absent UA is NOT desktop — it falls through and is left to
 * the existing gates, because guessing "desktop" from an unknown string is how real buyers on
 * unusual in-app browsers get dropped.
 *
 * Note iPadOS 13+ Safari reports `Macintosh` with no `Mobile`, so it lands here as desktop. That
 * is a false NEGATIVE for the tablet rule, not a lost buyer — the embed classifies it the same
 * way, so client and server agree and no contradiction is raised.
 */
export function isPositivelyDesktop(ua) {
  const s = String(ua || '');
  if (!s) return false;
  return DESKTOP_PLATFORM.test(s) && !MOBILE_TOKEN.test(s);
}

/** True when the UA carries a handheld token. */
export function looksMobile(ua) {
  return MOBILE_TOKEN.test(String(ua || ''));
}

/** Client hints are optional by spec; '' means "not told", never "bot". */
function chMobile(headers) {
  const v = String((headers && headers['sec-ch-ua-mobile']) || '').trim();
  return v === '?0' ? 'desktop' : v === '?1' ? 'mobile' : '';
}

function chPlatform(headers) {
  const raw = String((headers && headers['sec-ch-ua-platform']) || '').trim().replace(/^"|"$/g, '');
  if (!raw) return '';
  return /^(Windows|macOS|Linux|Chrome OS|Chromium OS)$/i.test(raw) ? 'desktop'
    : /^(Android|iOS)$/i.test(raw) ? 'mobile' : '';
}

/**
 * A real browser attaches Origin to every cross-origin POST — it is set by the browser and is
 * not writable from page JS. curl / python-requests omit it unless told. Absence is therefore a
 * genuine "this was not a browser XHR" signal.
 *
 * Scored, not gated: a privacy extension or an exotic in-app webview could strip it, and losing
 * a buyer costs more than letting a scripted request through.
 */
function hasBrowserOrigin(headers) {
  const o = String((headers && headers.origin) || '').trim();
  return !!o && /^https?:\/\//i.test(o);
}

/** Obviously-placeholder click ids (`x`, `1`, `test`). Scored only — never a reject. */
function ttclidLooksPlaceholder(ttclid) {
  const v = String(ttclid || '').trim();
  if (!v) return false;
  if (v.length <= 8) return true;
  return /^(test|demo|sample|abc|xxx|placeholder)/i.test(v);
}

/**
 * Evaluate a /r request for self-consistency.
 *
 * Returns { reject, reasons, score }. `reject` is true ONLY on a hard contradiction — two
 * independent signals that cannot both be true of the same visitor. Soft signals accumulate in
 * `score` for observability and are deliberately NOT wired to a rejection threshold: every soft
 * signal here has a plausible innocent cause, and this system's stated priority is that real
 * TikTok users get through.
 */
export function evaluateRequest({ userAgent, clientDevice, headers, ttclid } = {}) {
  const ua = String(userAgent || '');
  const claimsMobile = String(clientDevice || '').toLowerCase() === 'm';
  const h = headers || {};
  const reasons = [];
  let score = 0;

  // ── hard contradictions ────────────────────────────────────────────────────
  // Each is "the client told us one thing, the browser told us another". Only raised when the
  // client actually claims mobile, so an honest d=d/d=t is left to the existing device gate.
  if (claimsMobile && isPositivelyDesktop(ua)) {
    reasons.push('claimed mobile but the user-agent is positively desktop');
  }
  if (claimsMobile && chMobile(h) === 'desktop') {
    // Sec-CH-UA-Mobile is a stated PREFERENCE, so ?1 proves nothing — but ?0 arriving next to a
    // mobile claim is a genuine, low-false-positive lie detector. Chromium sends this by default
    // with no Accept-CH opt-in, and the WICG default allowlist of `*` means it survives the
    // cross-origin XHR. Absent (Safari, Firefox) is simply not evidence either way.
    reasons.push('claimed mobile but Sec-CH-UA-Mobile is ?0');
  }
  if (claimsMobile && chPlatform(h) === 'desktop' && !looksMobile(ua)) {
    reasons.push('claimed mobile but Sec-CH-UA-Platform is a desktop OS');
  }

  // ── soft signals: recorded, never decisive ─────────────────────────────────
  if (!hasBrowserOrigin(h)) { score += 2; }
  if (ttclidLooksPlaceholder(ttclid)) { score += 2; }
  if (!ua) { score += 1; }

  return { reject: reasons.length > 0, reasons, score };
}
