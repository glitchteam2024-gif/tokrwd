/**
 * gate-log — the one place a click on OUR wire becomes a durable row.
 *
 * Used by /api/click (the lander CTA gate), /api/c/[slug] (scaler redirector) and
 * /api/reco. Each caller 302s FIRST and logs after — the visitor never waits for
 * the database, and a dead log path costs a row, never a click.
 *
 * The row lands in SPRK's `clicks` table (entry='gate') via the gate-click ingest
 * on sprktrax.org — this repo has no database credentials of its own, and should
 * not: the ingest endpoint can write exactly one kind of row, so leaking its key
 * pollutes a log instead of exposing a service role.
 */

import { randomBytes } from 'node:crypto';

const INGEST_URL = process.env.GATE_INGEST_URL || 'https://sprktrax.org/api/gate-click';
// Shared secret with the ingest. NO committed fallback: this repo is PUBLIC, and a working key in
// public source is a forged-row primitive against a service-role writer. `GATE_INGEST_KEY` must be
// set to the SAME strong value in BOTH Vercel projects (tokrwd + SPRKNetworkAds). Until it is, the
// gate sends no key and the ingest fail-closes — clicks still redirect fine, they just are not
// logged. Losing log rows on a misconfig is correct for a log; it is not the money ledger.
const INGEST_KEY = process.env.GATE_INGEST_KEY || '';

const B62 = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';

/**
 * 22 base62 chars ≈ 131 bits — same shape the SPRK door minted, so the postback's
 * CLICK_TOKEN_SHAPE (/^[0-9A-Za-z]{22}$/) accepts these ids unchanged if a network
 * ever echoes one back.
 */
export function mintClickId(len = 22) {
  const bytes = randomBytes(len);
  let out = '';
  for (let i = 0; i < len; i++) out += B62[bytes[i] % 62];
  return out;
}

/**
 * Group key for a lander path — the unit the GATE_OVERRIDES table keys on and the
 * `clicks.slug` column groups by. Deterministic and boring on purpose:
 *
 *   /frcusa.html        → 'frcusa'
 *   /AK52/GB7           → 'ak52-gb'     (clone digits stripped)
 *   /50FC/FC12/index.html → '50fc-fc'
 *   /SHEIN/GB           → 'shein-gb'
 *
 * `lp` is client-supplied; this only ever produces a lowercase token for grouping,
 * never a routing decision on its own (overrides are opt-in rows, and a forged lp
 * can only re-route the forger's own click).
 */
export function deriveGateKey(lp) {
  const path = String(lp == null ? '' : lp).split(/[?#]/)[0].trim();
  if (!path || path.length > 200 || !/^\/?[A-Za-z0-9._/-]*$/.test(path)) return '';
  if (path.split('/').some(seg => seg === '..')) return '';
  const segs = path.replace(/\/index\.html?$/i, '').split('/').filter(Boolean);
  if (!segs.length) return '';
  const first = segs[0].replace(/\.html?$/i, '');
  if (!first) return '';
  if (segs.length === 1) return first.toLowerCase().slice(0, 64);
  const second = segs[1].replace(/\.html?$/i, '').replace(/\d+$/, '');
  return (second ? `${first}-${second}` : first).toLowerCase().slice(0, 64);
}

/** First hop of x-forwarded-for — on Vercel this is the visitor. */
export function clientIp(headers) {
  const xff = String((headers && headers['x-forwarded-for']) || '');
  return xff.split(',')[0].trim().slice(0, 64) || null;
}

function cap(v, max) {
  const s = String(v == null ? '' : v).replace(/[\u0000-\u001f\u007f]/g, ' ').trim();
  return s ? s.slice(0, max) : null;
}

/** Vercel geo headers → the fields the map needs. City arrives percent-encoded.
 *  Only the fields the ingest actually stores — no `region`, which has no column and would ride on
 *  every POST as dead payload a future reader would assume was persisted. */
export function geoFromHeaders(headers) {
  const h = headers || {};
  let city = cap(h['x-vercel-ip-city'], 100);
  if (city) { try { city = decodeURIComponent(city); } catch { /* keep raw */ } }
  const num = (v) => {
    const n = parseFloat(String(v == null ? '' : v));
    return Number.isFinite(n) ? n : null;
  };
  return {
    country: cap(h['x-vercel-ip-country'], 8),
    city,
    lat: num(h['x-vercel-ip-latitude']),
    lon: num(h['x-vercel-ip-longitude']),
  };
}

/**
 * Ship one click row to the ingest, and AWAIT it BEFORE the caller writes its 302.
 *
 * The redirect-then-log order looked cheaper (zero added latency) but is not sound on Vercel: the
 * invocation is considered complete when the response ends, so an `await` placed after `res.redirect`
 * is not guaranteed to run — a fraction of rows would silently never POST, and a frozen instance
 * could thaw and insert the row minutes late, past the 3-minute dedup window, double-counting the
 * click against its funnel-beacon twin. Logging first, capped, is the door's own proven pattern.
 *
 * Bounded and fail-open: capped at `capMs`, and every failure — timeout, dead ingest, unset key — is
 * a console line and a normal return, never a throw. The caller redirects regardless, so a slow or
 * missing ingest costs at most `capMs` of latency and a lost row, never the click.
 */
export async function sendGateLog(fields, { capMs = 800 } = {}) {
  // No key configured → nothing to authenticate with. Skip the hop rather than POST an
  // unauthenticated body the ingest will only 401. (Deploy step: set GATE_INGEST_KEY on both.)
  if (!INGEST_KEY) return;
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), capMs);
    const r = await fetch(INGEST_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-gate-key': INGEST_KEY },
      body: JSON.stringify(fields),
      signal: ctrl.signal,
    });
    clearTimeout(timer);
    if (!r.ok) console.error('[gate-log] ingest refused:', r.status);
  } catch (err) {
    console.error('[gate-log] ingest failed:', err && err.name === 'AbortError' ? 'timeout' : (err && err.message));
  }
}

/** Everything the ingest wants, assembled from a request + the caller's specifics. */
export function gateLogRow(req, { key, lp, s1, dest, ttclid, via, clickId }) {
  const headers = (req && req.headers) || {};
  const geo = geoFromHeaders(headers);
  return {
    /* The caller mints the id BEFORE building the outbound URL, because the same token has to
     * ride the wire AND land in this row — that pairing is what lets a postback resolve a
     * conversion back to one exact click. Falls back to minting here for any caller that does
     * not put a token on the wire. */
    click_id: clickId || mintClickId(),
    key: cap(key, 64),
    lp: cap(lp, 200),
    s1: cap(s1, 256),
    dest: cap(dest, 500),
    ttclid: cap(ttclid, 200),
    via: cap(via, 16),
    domain: cap(headers.host, 100),
    // 512 to MATCH the funnel beacon's cap (api-src/funnel-beacon.ts). The dedup fold in
    // door-clicks.ts keys on the verbatim ua string, so a shorter cap here would split the gate
    // row from its beacon twin for any UA over the shorter length and double-count that visitor.
    ua: cap(headers['user-agent'], 512),
    ip: clientIp(headers),
    ...geo,
  };
}
