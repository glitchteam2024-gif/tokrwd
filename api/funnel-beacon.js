/**
 * Same-origin funnel beacon.
 *
 * The landers used to POST their funnel events straight to an absolute URL on our own corporate
 * domain, which put that hostname in the source of ~1,660 public pages — anyone reading
 * view-source learned who runs the site. This forwards the same payload server-side instead, so
 * the browser only ever talks to the domain it is already on.
 *
 * Deliberately fire-and-forget and deliberately silent: a lander must never be slowed, blocked or
 * broken by analytics. Every failure path returns 204, exactly as the browser's sendBeacon expects.
 */
const UPSTREAM = process.env.FUNNEL_BEACON_UPSTREAM || 'https://www.sprknetwork.ad/api/funnel-beacon';

export default async function handler(req, res) {
  // sendBeacon only ever POSTs. Anything else is not our client.
  if (req.method !== 'POST') return res.status(204).end();
  try {
    let body = req.body;
    if (typeof body !== 'string') body = JSON.stringify(body ?? {});
    // Cap it: this endpoint is public, and the real payload is a few hundred bytes.
    if (body.length > 4096) return res.status(204).end();
    // Not awaited on the response path — the visitor is mid-tap and the answer is always 204.
    fetch(UPSTREAM, {
      method: 'POST',
      headers: {
        'content-type': 'text/plain',
        // Preserve what the upstream uses for geo/in-app classification; it cannot see the
        // original connection any more now that we are in front of it.
        ...(req.headers['user-agent'] ? { 'x-forwarded-user-agent': req.headers['user-agent'] } : {}),
        ...(req.headers['x-forwarded-for'] ? { 'x-forwarded-for': req.headers['x-forwarded-for'] } : {}),
        ...(req.headers['x-vercel-ip-country'] ? { 'x-vercel-ip-country': req.headers['x-vercel-ip-country'] } : {}),
      },
      body,
    }).catch(() => {});
  } catch { /* analytics must never break the funnel */ }
  return res.status(204).end();
}
