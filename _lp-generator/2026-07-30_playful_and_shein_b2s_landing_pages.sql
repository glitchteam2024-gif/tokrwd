-- 2026-07-30 — landing_pages rows for PLAYFUL REWARDS (US/GB/CA/AU) and SHEIN BACK TO SCHOOL (US).
--
-- RUN THIS IN SUPABASE (SQL editor). It is written to be re-runnable and to FAIL LOUDLY rather than
-- half-apply. Shape copied from migrations/2026-07-26_sweep_landing_pages.sql, which is verified live.
--
-- ══ WHY NOT THE ADMIN MODAL ══════════════════════════════════════════════════════════════════
-- Two reasons, both silent if you use the UI:
--   1. `save_landing_page` (api/admin.js) writes `slug: … : null` UNCONDITIONALLY, so a field the
--      modal does not post NULLs the slug — and /api/link/<slug> then routes nothing.
--   2. The modal never writes `geo` AT ALL (it is absent from the row object). A NULL geo is not
--      neutral: the per-geo assign guard compares String(geo||'').toLowerCase(), so two NULL-geo
--      rows compare EQUAL and the second affiliate assignment 409s with "neither has a geo
--      assigned". Every row below sets geo explicitly.
--
-- ══ ORDER OF OPERATIONS — DO NOT SKIP ════════════════════════════════════════════════════════
--   1. offers.destination_by_geo populated for Playful FIRST. Without it every geo row resolves to
--      the same destination_url and the per-geo split does nothing. (api/link/[slug].js →
--      pickGeoDestination). Keep offers.destination_url non-empty too — affiliate-links.js only
--      routes through the redirector when the offer has one.
--   2. offers.no_landing_page ticked on any offer that is still Draft. Without it an approved
--      creative falls back to the affiliate's PROFILE-LEVEL, OFFER-AGNOSTIC default_link — so an
--      affiliate whose default is a Freecash link sees a Freecash link on a Playful creative under
--      a green "Approved" label, and those conversions settle against Freecash.
--   3. This script.
--   4. Assign affiliates (Landing Pages panel → person icon). ONE GEO PER AFFILIATE — see the note
--      at the bottom, this one is not optional.
--   5. enforce_assignment flags LAST, and only once both rosters are mirrored.
--
-- ⚠️ REVSHARE (Playful): leave offers.payout_by_geo and offers.payout EMPTY — the first flattens the
--    price, the second inverts chargebacks. Set the cut with offers.sprk_cut_pct.

BEGIN;

-- ── 0. Confirm the offer names match reality before anything writes ──────────────────────────
-- Offer names are matched by STRING below. If either RAISE fires, run this first and fix the
-- literal to match exactly (it is case- and whitespace-sensitive):
--
--     SELECT id, name, code, status FROM offers WHERE name ILIKE '%playful%' OR name ILIKE '%shein%';
--
-- Failing here is the intended behaviour. The alternative — a JOIN that matches nothing — inserts
-- ZERO rows, reports success, and leaves you wondering why the door 404s.
-- Explicitly TAGGED dollar quoting ($do$, not $$). The offer name below contains a literal '$1000',
-- so an untagged $$ block sits one character away from a quoting accident if this text is ever
-- edited. A tag costs nothing and removes the whole class of problem.
DO $do$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM offers WHERE name = 'Playful Rewards' AND coalesce(status, '') <> 'archived') THEN
    RAISE EXCEPTION 'No live offer named "Playful Rewards". Run the SELECT above and correct the literal.';
  END IF;
  IF (SELECT count(*) FROM offers WHERE name = 'Playful Rewards' AND coalesce(status, '') <> 'archived') > 1 THEN
    RAISE EXCEPTION 'More than one live offer named "Playful Rewards" — disambiguate by id before running this.';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM offers WHERE name = 'Rewards US - Shein $1000 Back to School' AND coalesce(status, '') <> 'archived') THEN
    RAISE EXCEPTION 'No live offer named "Rewards US - Shein $1000 Back to School". Run the SELECT above and correct the literal.';
  END IF;
  IF (SELECT count(*) FROM offers WHERE name = 'Rewards US - Shein $1000 Back to School' AND coalesce(status, '') <> 'archived') > 1 THEN
    RAISE EXCEPTION 'More than one live offer with that Shein B2S name — disambiguate by id before running this.';
  END IF;
END $do$;

-- ── 1. The rows ──────────────────────────────────────────────────────────────────────────────
-- NO ON CONFLICT. landing_pages.slug has NO unique constraint — `ON CONFLICT (slug)` raises 42P10
-- and rolls the whole transaction back. WHERE NOT EXISTS gives the same re-runnable behaviour and
-- deliberately ignores archived rows, so a retired slug can be re-created.
--
-- `link` names the FIRST clone of that geo's slice; capacity is the clone count. Affiliates are
-- identified by ?s1=<SPK>, never by the path — the numbered pool is URL-footprint spread, not
-- identity. enforce_assignment FALSE everywhere: flipping it before landing_page_affiliates is
-- populated 404s every resolved owner.
INSERT INTO landing_pages (name, slug, link, offer_id, status, capacity, geo, enforce_assignment)
SELECT v.name, v.slug, v.link, o.id, v.status, v.capacity::int, v.geo, v.enforce_assignment::boolean
  FROM (VALUES
    ('Playful Rewards (US)', 'playful-us', 'https://www.tokrwd.co/PR50/US1', 'Playful Rewards', 'active', 30, 'us', false),
    ('Playful Rewards (GB)', 'playful-gb', 'https://www.tokrwd.co/PR50/GB1', 'Playful Rewards', 'active', 30, 'gb', false),
    ('Playful Rewards (CA)', 'playful-ca', 'https://www.tokrwd.co/PR50/CA1', 'Playful Rewards', 'active', 30, 'ca', false),
    ('Playful Rewards (AU)', 'playful-au', 'https://www.tokrwd.co/PR50/AU1', 'Playful Rewards', 'active', 30, 'au', false),
    ('Rewards US - Shein $1000 Back to School (US)', 'shein-b2s-us', 'https://www.tokrwd.co/SB50/US1',
       'Rewards US - Shein $1000 Back to School', 'active', 30, 'us', false)
  ) AS v(name, slug, link, offer_name, status, capacity, geo, enforce_assignment)
  JOIN offers o ON o.name = v.offer_name AND coalesce(o.status, '') <> 'archived'
 WHERE NOT EXISTS (
   SELECT 1 FROM landing_pages lp WHERE lp.slug = v.slug AND coalesce(lp.status, '') <> 'archived'
 );

-- ── 2. Prove it landed, before you commit ────────────────────────────────────────────────────
-- Expect 5 rows, every geo non-null, every enforce_assignment false.
SELECT lp.slug, lp.geo, lp.capacity, lp.status, lp.enforce_assignment, lp.link, o.name AS offer
  FROM landing_pages lp
  JOIN offers o ON o.id = lp.offer_id
 WHERE lp.slug IN ('playful-us','playful-gb','playful-ca','playful-au','shein-b2s-us')
 ORDER BY o.name, lp.geo;

COMMIT;

-- ══ AFTER COMMITTING ═════════════════════════════════════════════════════════════════════════
--
-- ⚠️ ASSIGN EACH AFFILIATE TO EXACTLY ONE PLAYFUL GEO.
--    The assign guard (api/admin.js) is per-GEO, so it will happily let one affiliate hold all four.
--    The RESOLVER will not: api/_lib/affiliate-links.js:250 does `by_offer[lp.offer_id] = link`
--    inside a loop over rows fetched with NO .order(), so multiple geo rows for one offer collapse
--    to ONE link — last row wins, ordering undefined. The affiliate gets GB on one page load and AU
--    on the next and cannot reach the others. docs/2026-07-25_per-geo-links-creative-hub.md opens
--    "Nothing here is implemented." Until it is: one geo per affiliate.
--
-- ⚠️ SHEIN B2S IS A SEPARATE OFFER FROM THE STANDING SHEIN $750.
--    Different offer row, different door slug (shein-b2s-us vs shein-us), different lander family
--    (SB50 vs SH50). They are NOT two geos of one thing. Do not assign an affiliate to both and
--    expect two links — same collapse as above, and both rows are geo 'us', so the per-geo guard
--    will actually 409 the second assignment. That 409 is correct.
--
-- To roll back just these rows:
--   UPDATE landing_pages SET status = 'archived'
--    WHERE slug IN ('playful-us','playful-gb','playful-ca','playful-au','shein-b2s-us');
