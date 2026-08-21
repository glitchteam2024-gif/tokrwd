/**
 * /api/click — the first-party click stamp (routed at /click).
 *
 * Every lander CTA points here, same-origin on whichever alias domain served the
 * page:
 *
 *   /click?u=<finished offer URL>&s1=<raw wire>&lp=<lander path>&t=<ttclid>
 *
 * The page still builds the finished offer URL itself — base + exactly ONE param
 * carrying the code, the contract shipped 2026-08-20 — and the gate forwards it
 * BYTE FOR BYTE. What the gate adds is the thing a beacon can never guarantee: a
 * server-side row for every single CTA click (click_id, raw wire, IP, geo,
 * creative path) written from inside the redirect itself, so a click cannot land
 * on the network without first landing in our log.
 *
 * Order of operations is the design:
 *   1. resolve the target (override table, else the page's validated `u`)
 *   2. log the click (capped, fail-open) — BEFORE the redirect, so the write is
 *      guaranteed to run inside the invocation rather than after res.end(), where
 *      Vercel does not promise an un-awaited/late await ever completes
 *   3. 302 to the target
 *
 * Fail-open everywhere on the money path: an unknown override key, a dead ingest,
 * a slow ingest — none of them can cost a paid click (sendGateLog never throws and
 * caps its own wait). The only 404s are requests no lander ever emits
 * (missing/off-allowlist `u`), which is the open-redirect gate, not click handling.
 */

import {
  buildDirectUrl,
  extractSparkCode,
  getGateOverride,
  isAllowedGateDestination,
} from './_lib/links-config.js';
import { deriveGateKey, gateLogRow, sendGateLog } from './_lib/gate-log.js';

/** Read a query param that may arrive as a repeated key (Vercel gives an array). */
function qparam(query, name) {
  const v = query[name];
  if (Array.isArray(v)) return v.find(x => x != null && String(x).trim() !== '') || '';
  return v == null ? '' : String(v);
}

function noStore(res) {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  // Load-bearing: without this the network would receive our gate URL — raw wire
  // included — in the Referer header of the redirected request.
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('X-Robots-Tag', 'noindex, nofollow');
}

export default async function handler(req, res) {
  noStore(res);

  const query = req.query || {};
  const u = qparam(query, 'u').trim();
  const s1 = qparam(query, 's1').trim();
  const lp = qparam(query, 'lp').trim();
  const ttclid = qparam(query, 't').trim();

  let target = '';
  let via = 'page';

  try {
    const key = deriveGateKey(lp);

    // The override table wins when a row exists — that is the reroute/pause knob.
    // It rebuilds the outbound with the same helpers /c/ uses: one param, the
    // extracted code (or a scaler's label verbatim — extractSparkCode's contract).
    const override = getGateOverride(key);
    if (override) {
      // override.forwardParam is always set — getGateOverride resolves the s1/sub1 dialect from
      // the destination host when the row omits it, so a CAKE reroute cannot ship a dead `sub1`.
      const code = s1 ? extractSparkCode(s1) : '';
      target = buildDirectUrl(override.destination, override.forwardParam, code);
      via = 'override';
    } else if (isAllowedGateDestination(u)) {
      target = u;
    }

    if (!target) {
      return res.status(404).send('Not found');
    }

    // Log BEFORE the redirect so the write happens inside the invocation, not after
    // res.end() where Vercel may drop or defer it. Capped and fail-open: a slow or
    // dead ingest costs at most capMs and a lost row, never the click.
    await sendGateLog(gateLogRow(req, { key, lp, s1, dest: target, ttclid, via }));

    return res.redirect(302, target);
  } catch (err) {
    console.error('[click] gate error:', err && err.message);
    // Never lose a paid click to our own defect: if the response has not gone out
    // yet and the page gave us a legitimate destination, still forward the visitor.
    try {
      if (!res.headersSent && isAllowedGateDestination(u)) {
        return res.redirect(302, u);
      }
      if (!res.headersSent) {
        return res.status(404).send('Not found');
      }
    } catch { /* response already closed — nothing left to protect */ }
  }
}
