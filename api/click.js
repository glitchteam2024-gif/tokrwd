/**
 * /api/click — the first-party click stamp (routed at /click).
 *
 * Every lander CTA points here, same-origin on whichever alias domain served the
 * page:
 *
 *   /click?u=<finished offer URL>&s1=<raw wire>&lp=<lander path>&t=<ttclid>
 *
 * The page still builds the finished offer URL itself — base + exactly ONE param
 * carrying the code, the contract shipped 2026-08-20 — and the gate forwards that
 * URL unchanged. What the gate adds is the thing a beacon can never guarantee: a
 * server-side row for every single CTA click (click_id, raw wire, IP, geo,
 * creative path) written from inside the redirect itself, so a click cannot land
 * on the network without first landing in our log.
 *
 * ⚠️ THE GATE APPENDS EXACTLY ONE THING (2026-08-21): the click token, in the slot
 * the destination's network reads `cid=` from (`s5` on CAKE, `sub2` on Everflow).
 * That is a second parameter on the wire and it is deliberate — see the block at
 * the append site for the measurement that justifies it. The page's own param is
 * never touched, so the affiliate code still arrives exactly as it did.
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
  gateClickSlotFor,
  getGateOverride,
  isAllowedGateDestination,
} from './_lib/links-config.js';
import { deriveGateKey, gateLogRow, mintClickId, sendGateLog } from './_lib/gate-log.js';

/* The probe secret is the ingest key: one shared secret between our own two deploys, already
 * required to be set for the click log to work at all. A probe reveals only whether a URL we
 * already serve would be accepted, so this is about not handing out a free oracle, not about
 * protecting the click path. */
const PROBE_KEY = process.env.GATE_INGEST_KEY || '';
function probeKeyOk(req) {
  if (!PROBE_KEY) return false;                       // unset → probe mode simply does not exist
  const got = (req && req.headers && req.headers['x-gate-key']) || '';
  return got === PROBE_KEY;
}

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

    /* ── PROBE MODE ────────────────────────────────────────────────────────────
     * Mass link-testing needs to ask "would this click work?" thousands of times without
     * (a) firing a real click at the network or (b) writing thousands of fake rows into the
     * click log. Both would make the test worse than useless: one costs money at the network,
     * the other poisons the very data the tab reports.
     *
     * So a keyed probe runs the ENTIRE resolution — allowlist, override table, slot choice,
     * URL assembly — and then answers with what it WOULD have done instead of doing it. No
     * row, no 302, no network contact.
     *
     * Keyed on the ingest secret so it is not a public oracle for what our allowlist accepts;
     * an unkeyed `probe=1` is ignored entirely, so a crafted URL cannot suppress a real click's
     * logging by adding the param. */
    if (qparam(query, 'probe') === '1' && probeKeyOk(req)) {
      return res.status(200).json({
        ok: true,
        target,
        via,
        slot: gateClickSlotFor(target),
        key: deriveGateKey(lp),
      });
    }

    /* ── THE CLICK TOKEN (2026-08-21) ──────────────────────────────────────────
     * One unique value per click, riding the slot the destination's network reads its
     * `cid=` from. This is the SECOND parameter on the wire, and it is deliberate.
     *
     * WHY IT IS WORTH BREAKING "one param and the link" FOR. A conversion that comes back
     * with no transaction id and no click token has only `(network, spark code)` to be
     * identified by, and the postback then has to fall back to collapsing anything on that
     * pair inside 120 seconds. Measured on production 2026-08-21: 76% of gross arrives with
     * no usable transaction id, and the Monetise click slot is empty on 98.7% of postbacks —
     * so most of the money is currently carried by an identifier that cannot tell two real
     * conversions apart. This token is what makes them distinguishable.
     *
     * It does NOT change what identifies the affiliate: the code still rides slot 1 exactly
     * as before, and a gate click row carries no owner, so a postback that matches on this
     * token still attributes through the spark code (postback.ts falls through when
     * `clickRow.owner_user_id` is null). Dedup precision, not a new attribution path. */
    const clickId = mintClickId();
    const slot = gateClickSlotFor(target);
    target = target + (target.indexOf('?') > -1 ? '&' : '?') + slot + '=' + encodeURIComponent(clickId);

    // Log BEFORE the redirect so the write happens inside the invocation, not after
    // res.end() where Vercel may drop or defer it. Capped and fail-open: a slow or
    // dead ingest costs at most capMs and a lost row, never the click.
    await sendGateLog(gateLogRow(req, { key, lp, s1, dest: target, ttclid, via, clickId }));

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
