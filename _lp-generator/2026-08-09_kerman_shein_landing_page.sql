-- 2026-08-09 — bespoke landing page for NOTKERMAN on Rewards US - Shein $1000 Back to School.
--
-- RUN THIS IN SUPABASE (SQL editor), as ONE transaction. It is re-runnable and written to fail
-- loudly rather than half-apply. Pairs with _lp-generator/kerman-shein.js, which emits
-- SHKM/US + /shkrurl + SK50/US1..US100 and fires the door slug set below.
--
--   affiliate   notkermanh@gmail.com   aff 32
--   auth id     70fe943b-a245-4fa3-9ef4-cca6ddec906c   (auth.users, NOT user_profiles —
--               user_profiles.user_id is NULL on live rows, so a join on it returns nothing)
--   offer       Rewards US - Shein $1000 Back to School   7018d82b-f19d-4759-9910-de9e837774e5
--               code FL220841 · fcfs · enforce_assignment false · pricing_mode revshare
--   slug        shein-b2s-us-kerman           (must equal DOOR_SLUG in kerman-shein.js)
--   link        https://www.tokrwd.co/SK50/US1
--
-- ══ WHICH SHEIN OFFER, AND WHY THIS ONE ══════════════════════════════════════════════════════
-- There are SEVEN active Shein offers, FOUR of them US. His page is matched to this one on its
-- own copy, not on a guess:
--   · reward stated as $1,000 in six places        -> the other three US Shein offers are $750
--   · campaign strip reads "Back to School 2026"   -> only two B2S offers exist, US and UK
--   · dollars, not pounds                          -> rules out Rewards UK - Shein £1000 B2S
-- That is a unique match. If Migi meant a different one, change the offer_id and the slug here
-- AND `DOOR_SLUG` in kerman-shein.js, then re-run the generator — the door slug is baked into all
-- 102 emitted files, so the two must move together or every click 404s at the door.
--
-- ══ WHY NOT THE ADMIN MODAL ══════════════════════════════════════════════════════════════════
-- `save_landing_page` writes {name, offer_id, link, slug, capacity, status, notes, updated_at}
-- and NOTHING ELSE — no self_serve, no template_key/name/blurb, no preview_image. A row created
-- through the form is invisible to the picker forever until SQL sets self_serve, and a create
-- defaults capacity to 50, which is wrong for a bespoke row.
--
-- ⚠️ ON CONFLICT is WRONG on landing_pages: the unique index is partial AND on an expression
--    (lower(slug) WHERE slug IS NOT NULL AND status <> 'archived'), so a plain arbiter raises
--    42P10. WHERE NOT EXISTS below. landing_page_affiliates is the opposite — a plain UNIQUE
--    (landing_page_id, user_id) — so ON CONFLICT is correct there.
--
-- ══ VERIFIED BEFORE WRITING THIS, 2026-08-09 ═════════════════════════════════════════════════
--   slug shein-b2s-us-kerman                 FREE (zero landing_pages rows)
--   his active rows on this offer            ZERO — unlike the Apple Pay build, he holds no house
--                                            design here, so step 2 is a no-op TODAY. It is kept
--                                            anyway: if he picks one in the picker between now and
--                                            whenever this runs, step 2 is the only thing standing
--                                            between him and two active rows on one offer.
--   offers.destination_by_geo has "US"       yes — landerProblem uppercases lp.geo before the lookup
--   SK50/US1..US100 + SHKM/US + /shkrurl     generated, one md5 across all 102 files (f1b34d39…)
--   node api/_lib/_tracking-audit.test.mjs   6 passed, 0 failed
--   node api/_lib/_links-config.test.mjs     190 passed, 0 failed
--   images/landers/shein-b2s-us-kerman.png   committed to SPRKNetworkAds, 800x450
--
-- The door itself only answers once tokrwd is deployed AND this row exists. After both, expect:
--   curl -sI 'https://sprktrax.org/api/link/shein-b2s-us-kerman?s1=SPK-TEST-0000'  -> 302
--   curl -sI 'https://sprktrax.org/api/link/shein-b2s-us-kerman'                   -> 404
-- The 404 is the attribution gate, not a bug: the door hard-refuses a click with no s1.

BEGIN;

-- ── 1. The page ──────────────────────────────────────────────────────────────────────────────
-- capacity 1 is doing three jobs at once: it is the single-tenant LOCK (claimSlot returns
-- {slot:null, full:true} for everyone else), it is the PRIVACY rule (get_offer_landing_pages
-- hides a capacity-1 row from everyone but its holder), and it is the CONTRACT WITH THE CLONE
-- SLICE — lpSlotLink swaps the trailing digits with no existence check, so a capacity larger than
-- the clones actually deployed hands out live, paid 404s. 100 clones ship; capacity stays 1.
-- self_serve MUST be true or he gets Trap 4: chosen_id comes back null, no "Your page" chip, and
-- every house design renders as an enabled "Use this design" that would release his own page.
-- template_key 'z' sorts it after the house a/b/c (shein-b2s-us, -b, -c).
INSERT INTO landing_pages
  (name, offer_id, link, slug, capacity, geo, status,
   self_serve, template_key, template_name, template_blurb, preview_image)
SELECT 'Shein $1000 Back to School — notkerman (US)',
       '7018d82b-f19d-4759-9910-de9e837774e5',
       'https://www.tokrwd.co/SK50/US1',
       'shein-b2s-us-kerman',
       1, 'us', 'active',
       true, 'z', 'Fitting Room', 'Reserved page. Not available to other affiliates.',
       '/images/landers/shein-b2s-us-kerman.png'
WHERE NOT EXISTS (
  SELECT 1 FROM landing_pages WHERE lower(slug) = 'shein-b2s-us-kerman'
);

-- ── 2. RELEASE FIRST. Archive any other design he holds on THIS offer. ───────────────────────
-- A no-op as measured on 2026-08-09 (he holds none here). Kept because the picker is live and he
-- could claim a house design at any moment: two active rows on one offer make
-- resolveAffiliateOfferLinks key by_offer[offer_id] in a forEach with NO .order(), so which link
-- he is served is undefined and flips between page loads. Nothing errors. This is exactly what
-- happened to Ashlyn on 2026-08-04.
-- 'archived' rather than DELETE: it keeps the audit trail, and every reader in the codebase
-- filters status='active', so an archived row holds no slot and resolves nothing.
UPDATE landing_page_affiliates lpa
   SET status = 'archived'
  FROM landing_pages lp
 WHERE lpa.landing_page_id = lp.id
   AND lpa.user_id = '70fe943b-a245-4fa3-9ef4-cca6ddec906c'
   AND lp.offer_id = '7018d82b-f19d-4759-9910-de9e837774e5'
   AND lp.slug <> 'shein-b2s-us-kerman'
   AND lpa.status = 'active';

-- ── 3. Then claim. ───────────────────────────────────────────────────────────────────────────
-- slot 1 explicitly: lpSlotLink(link, null) returns the link unchanged so a NULL slot *works*,
-- but it is inconsistent with rotation and with every other assignment. A capacity-1 page never
-- rotates anyway (taken=[1], capacity 1 -> full -> skipped_full), which is why /SK50/US1 is stable.
INSERT INTO landing_page_affiliates
  (landing_page_id, user_id, offer_id, status, slot, slot_cycle, slot_claimed_at, chosen_by)
SELECT lp.id, u.id, lp.offer_id, 'active', 1, '2026-08', now(), 'admin'
FROM landing_pages lp
CROSS JOIN auth.users u
WHERE lp.slug = 'shein-b2s-us-kerman'
  AND lower(u.email) = 'notkermanh@gmail.com'
ON CONFLICT (landing_page_id, user_id)
DO UPDATE SET status = 'active', slot = 1, slot_cycle = '2026-08',
              slot_claimed_at = now(), chosen_by = 'admin';

COMMIT;

-- ══ POST-CHECK — run these after COMMIT ══════════════════════════════════════════════════════

-- (a) He must hold EXACTLY ONE active row on this offer, on his own slug, slot 1.
SELECT lp.slug, lpa.status, lpa.slot, lpa.slot_cycle, lpa.chosen_by
  FROM landing_page_affiliates lpa
  JOIN landing_pages lp ON lp.id = lpa.landing_page_id
 WHERE lpa.user_id = '70fe943b-a245-4fa3-9ef4-cca6ddec906c'
   AND lp.offer_id = '7018d82b-f19d-4759-9910-de9e837774e5'
 ORDER BY lpa.status;

-- (b) His OTHER bespoke page must be untouched — applepay750-us-kerman, active, slot 1.
--     Nothing here writes to it; this is the receipt that nothing did.
SELECT lp.slug, lpa.status, lpa.slot, lpa.chosen_by
  FROM landing_page_affiliates lpa
  JOIN landing_pages lp ON lp.id = lpa.landing_page_id
 WHERE lpa.user_id = '70fe943b-a245-4fa3-9ef4-cca6ddec906c'
   AND lp.slug = 'applepay750-us-kerman';

-- (c) Network-wide duplicate check — worth running after ANY hand-assignment. Expect zero rows.
SELECT u.email, o.name, count(*), string_agg(lp.slug, ', ')
  FROM landing_page_affiliates lpa
  JOIN landing_pages lp ON lp.id = lpa.landing_page_id
  JOIN offers o ON o.id = lp.offer_id
  LEFT JOIN auth.users u ON u.id = lpa.user_id
 WHERE lpa.status = 'active'
 GROUP BY u.email, o.name HAVING count(*) > 1;

-- (d) Every design on the offer, with holder counts.
SELECT lp.slug, lp.capacity, lp.self_serve, lp.template_key,
       count(a.id) FILTER (WHERE a.status = 'active') AS held,
       count(a.id) FILTER (WHERE a.status = 'hidden') AS hidden_from
  FROM landing_pages lp
  LEFT JOIN landing_page_affiliates a ON a.landing_page_id = lp.id
 WHERE lp.offer_id = '7018d82b-f19d-4759-9910-de9e837774e5'
 GROUP BY 1,2,3,4 ORDER BY 4;

-- ══ OPTIONAL — trim the house designs out of his picker ══════════════════════════════════════
-- Only if you want him to see nothing but his own page. One row per (design, affiliate); it is a
-- picker-DISPLAY rule, not access control, and it covers nobody who joins the offer later.
--
-- ⚠️ NEVER run this against a design he is CURRENTLY ACTIVE on — the DO UPDATE would flip his live
--    row to 'hidden' in place and every consequence is silent: his served link vanishes, and his
--    clone number is freed for someone else while the row still holds it. After step 2 he is
--    active only on shein-b2s-us-kerman, so the three slugs below are safe.
--
-- INSERT INTO landing_page_affiliates (landing_page_id, user_id, offer_id, status)
-- SELECT lp.id, u.id, lp.offer_id, 'hidden'
-- FROM landing_pages lp CROSS JOIN auth.users u
-- WHERE lp.slug IN ('shein-b2s-us', 'shein-b2s-us-b', 'shein-b2s-us-c')
--   AND lower(u.email) = 'notkermanh@gmail.com'
-- ON CONFLICT (landing_page_id, user_id) DO UPDATE SET status = 'hidden';
