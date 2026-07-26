/**
 * Vercel Edge Middleware — stamps the visitor's country onto the sweep landers so a
 * multi-geo page shows the right figure.
 *
 * WHY THIS EXISTS
 * `cashprize` sells at US $1,000 / GB £750 / AU $750 and `sephora750` at $750 / £750.
 * A static page cannot know the visitor's country, so without this every visitor sees
 * the page's default geo — GB users promised $1,000. The pages already carry their full
 * per-geo amount map (`window.__GEO_AMOUNTS__`); all they need is `window.__GEO__`.
 *
 * WHAT IT DOES
 * Reads `x-vercel-ip-country` (derived by Vercel's edge from the connection IP — a client
 * cannot set it; Vercel overwrites `x-forwarded-for` explicitly to prevent IP spoofing)
 * and writes it to a short-lived, JS-readable `lp_geo` cookie. The page reads that cookie
 * into `window.__GEO__` before its config block runs. The static asset is served
 * untouched — no HTML rewriting, no subrequest, so there is no risk of a middleware loop.
 *
 * ⚠️ DISPLAY ONLY — this is deliberately NOT a money path.
 * `lp_geo` is a normal cookie, so a visitor can obviously set it themselves. That changes
 * the number on screen and NOTHING else: which offer the click actually resolves to, and
 * what it pays, is decided server-side at the door from `offers.destination_by_geo`
 * (SPRKNetworkAds, api/_lib/offer-geo.js) using that request's own edge geo. Do not ever
 * promote this cookie into a routing or pricing input.
 * The one real consequence of forging it is self-inflicted: you would see one amount and
 * be sent to another geo's offer. Worth knowing if a support ticket ever describes that.
 *
 * NO CLOAKING. Every visitor — including ad-review crawlers — gets byte-identical HTML;
 * the only difference is a cookie value. Nothing here inspects the user agent, and nothing
 * here can change which page is served. See the tokrwd-landers skill: a lander that behaves
 * differently for a crawler gets the whole domain flagged.
 *
 * Dependency-free on purpose: this repo has no package.json, so rather than pull in
 * `@vercel/edge` for its `next()` helper we emit the same continuation signal it does —
 * a response carrying `x-middleware-next: 1`, which tells Vercel to go on and serve the
 * matched static asset.
 */

export const config = {
  // The six canonical sweep landers AND their numbered fan-out families — a clone is a
  // byte-identical copy of its canonical page, so it needs the same geo stamp or half the
  // traffic (the half that runs on SH50/SH23 rather than /SHEIN) shows the wrong figure.
  //
  // All six families, not just the three multi-geo ones (SHEIN / SEPH / CASH): stamping the
  // cookie is a no-op on a single-geo page, and it means adding a geo to UBER later is a
  // BRANDS edit rather than a silent "why is this showing dollars in Britain" bug.
  matcher: [
    '/SHEIN', '/SEPH', '/CASH', '/APAY750', '/APAY1K', '/UBER',
    '/SH50/:path*', '/SP50/:path*', '/CS50/:path*',
    '/AP50/:path*', '/AK50/:path*', '/UE50/:path*',
  ],
};

export default function middleware(request) {
  const headers = new Headers({ 'x-middleware-next': '1' });

  const raw = request.headers.get('x-vercel-ip-country') || '';
  const geo = raw.trim().toUpperCase();

  // Same normalisation as canonGeo() in SPRKNetworkAds api/_lib/offer-geo.js: strict
  // 2-letter ISO, and UK folded to GB (the networks say "UK"; every stored code is GB).
  if (/^[A-Z]{2}$/.test(geo)) {
    const canon = geo === 'UK' ? 'GB' : geo;
    // Not HttpOnly — the page has to read it. Short Max-Age so a traveller's stale country
    // does not follow them around. SameSite=Lax survives the ad -> lander top-level nav.
    headers.append(
      'set-cookie',
      `lp_geo=${canon}; Path=/; Max-Age=300; SameSite=Lax; Secure`
    );
  }
  // No geo header (local dev, an edge that could not resolve the IP) => no cookie, and the
  // page falls back to its own default geo. Never guess a country.

  return new Response(null, { headers });
}
