-- 2026-08-09 — NOTKERMAN's supplied Shein page, on ALL SEVEN Shein offers, locked to him on each.
--
-- RUN THIS IN SUPABASE (SQL editor). One transaction, re-runnable, written to fail loudly rather
-- than half-apply. Pairs with _lp-generator/kerman-shein.js, which emits 708 files across seven
-- clone families and fires the seven door slugs below.
--
--   affiliate   notkermanh@gmail.com   aff 32
--   auth id     70fe943b-a245-4fa3-9ef4-cca6ddec906c   (auth.users, NOT user_profiles —
--               user_profiles.user_id is NULL on live rows, so a join on it returns nothing)
--
--   offer                                          geo  amount   slug                                    link
--   Rewards US - Shein $1000 Back to School        us   $1,000   shein-b2s-us-kerman                     /SK50/US1
--   Rewards UK - Shein £1000 Back to School        gb   £1,000   shein-b2s-gb-kerman                     /SK51/GB1
--   Rewards US - Flash Poll - Shein $750           us   $750     flash-poll-shein-2-us-kerman            /SK52/US1
--   Rewards UK - Flash Poll - Shein £750           gb   £750     flash-poll-shein-gb-kerman              /SK53/GB1
--   Rewards US - 2x Rewards - Shein $750 Bonus     us   $750     2x-rewards-shein-bonus-us-kerman        /SK54/US1
--   Rewards US - Retail Style - Shein $750         us   $750     retail-style-shein-us-kerman            /SK55/US1
--   Rewards AU - Product Reviewer Shein Bonus $750 au   $750     product-reviewer-shein-bonus-au-kerman  /SK56/AU1
--
-- ══ THE AMOUNT ON THE PAGE IS NOT THE SAME ON ALL SEVEN ══════════════════════════════════════
-- His file hardcodes $1,000 in ten places. Four of these offers pay 750 and three are non-USD, so
-- the generator substitutes the amount and currency per variant and FAILS THE BUILD if a stray
-- symbol from the wrong currency survives. If you re-point a slug at a different offer here, you
-- must also change that variant's `amount` in kerman-shein.js and re-run — otherwise the page
-- promises a figure the offer does not pay.
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
--   all seven slugs                        FREE (only applepay750-us-kerman exists today)
--   all seven offers                       status=active, cap_mode=fcfs, enforce_assignment=false
--                                          -> he needs no offer_assignments row for any of them
--   destination_by_geo[<GEO>]              present on all seven (landerProblem uppercases lp.geo)
--   his active rows on these offers        ZERO — so step 2 is a no-op today. Kept anyway: the
--                                          picker is live and he could claim a house design at any
--                                          moment, and two active rows on one offer make the
--                                          served link a coin flip (Ashlyn, 2026-08-04).
--   708 files, 100 clones per family       one md5 within each family, 7 distinct across them
--   node api/_lib/_tracking-audit.test.mjs   6 passed, 0 failed
--   node api/_lib/_links-config.test.mjs   190 passed, 0 failed
--   images/landers/<slug>.png              all seven committed to SPRKNetworkAds, 800x450
--
-- The doors only answer once tokrwd is deployed AND these rows exist. After both, for each slug:
--   curl -sI 'https://sprktrax.org/api/link/<slug>?s1=SPK-TEST-0000'  -> 302
--   curl -sI 'https://sprktrax.org/api/link/<slug>'                   -> 404
-- The 404 is the attribution gate, not a bug: the door hard-refuses a click with no s1.

BEGIN;

-- ── 1. The seven pages ───────────────────────────────────────────────────────────────────────
-- capacity 1 is doing three jobs at once: it is the single-tenant LOCK (claimSlot returns
-- {slot:null, full:true} for everyone else), it is the PRIVACY rule (get_offer_landing_pages
-- hides a capacity-1 row from everyone but its holder), and it is the CONTRACT WITH THE CLONE
-- SLICE — lpSlotLink swaps the trailing digits with no existence check, so a capacity larger than
-- the clones actually deployed hands out live, paid 404s. 100 clones ship per family; capacity 1.
-- self_serve MUST be true or he gets Trap 4: chosen_id comes back null, no "Your page" chip, and
-- every house design renders as an enabled "Use this design" that would release his own page.
-- template_key 'z' sorts each after that offer's house a/b/c.
INSERT INTO landing_pages
  (name, offer_id, link, slug, capacity, geo, status,
   self_serve, template_key, template_name, template_blurb, preview_image)
SELECT v.name, v.offer_id::uuid, v.link, v.slug, 1, v.geo, 'active',
       true, 'z', 'Fitting Room', 'Reserved page. Not available to other affiliates.',
       '/images/landers/' || v.slug || '.png'
FROM (VALUES
  ('Shein $1000 Back to School — notkerman (US)',  '7018d82b-f19d-4759-9910-de9e837774e5', 'https://www.tokrwd.co/SK50/US1', 'shein-b2s-us-kerman',                    'us'),
  ('Shein £1000 Back to School — notkerman (UK)',  '01a705a9-c479-4bec-aaed-bd0b038bc4d7', 'https://www.tokrwd.co/SK51/GB1', 'shein-b2s-gb-kerman',                    'gb'),
  ('Shein $750 Flash Poll — notkerman (US)',       '4b430587-1cbc-4542-82d9-0ef0c5d61d7c', 'https://www.tokrwd.co/SK52/US1', 'flash-poll-shein-2-us-kerman',           'us'),
  ('Shein £750 Flash Poll — notkerman (UK)',       'b4efc3f5-491e-485e-aad8-f57145d6d4d9', 'https://www.tokrwd.co/SK53/GB1', 'flash-poll-shein-gb-kerman',             'gb'),
  ('Shein $750 2x Rewards — notkerman (US)',       'f56469f1-12a1-4a6b-a8c2-81dfa9359075', 'https://www.tokrwd.co/SK54/US1', '2x-rewards-shein-bonus-us-kerman',       'us'),
  ('Shein $750 Retail Style — notkerman (US)',     '597d4dc9-a13f-4a0e-9acc-15dd4b6ca628', 'https://www.tokrwd.co/SK55/US1', 'retail-style-shein-us-kerman',           'us'),
  ('Shein $750 Product Reviewer — notkerman (AU)', '209e39e1-02b5-4102-ad2c-600468ed4fc8', 'https://www.tokrwd.co/SK56/AU1', 'product-reviewer-shein-bonus-au-kerman', 'au')
) AS v(name, offer_id, link, slug, geo)
WHERE NOT EXISTS (
  SELECT 1 FROM landing_pages lp WHERE lower(lp.slug) = v.slug
);

-- ── 2. RELEASE FIRST. Archive any OTHER design he holds on any of these seven offers. ────────
-- A no-op as measured on 2026-08-09 (he holds none on any Shein offer). Kept because the picker
-- is live: two active rows on one offer make resolveAffiliateOfferLinks key by_offer[offer_id] in
-- a forEach with NO .order(), so which link he is served is undefined and flips between page
-- loads. Nothing errors. Exactly what happened to Ashlyn on 2026-08-04.
-- 'archived' rather than DELETE: keeps the audit trail, and every reader filters status='active',
-- so an archived row holds no slot and resolves nothing.
UPDATE landing_page_affiliates lpa
   SET status = 'archived'
  FROM landing_pages lp
 WHERE lpa.landing_page_id = lp.id
   AND lpa.user_id = '70fe943b-a245-4fa3-9ef4-cca6ddec906c'
   AND lp.offer_id IN (
     '7018d82b-f19d-4759-9910-de9e837774e5','01a705a9-c479-4bec-aaed-bd0b038bc4d7',
     '4b430587-1cbc-4542-82d9-0ef0c5d61d7c','b4efc3f5-491e-485e-aad8-f57145d6d4d9',
     'f56469f1-12a1-4a6b-a8c2-81dfa9359075','597d4dc9-a13f-4a0e-9acc-15dd4b6ca628',
     '209e39e1-02b5-4102-ad2c-600468ed4fc8')
   AND lp.slug NOT LIKE '%-kerman'
   AND lpa.status = 'active';

-- ── 3. Then claim, one seat per page. ────────────────────────────────────────────────────────
-- slot 1 explicitly: lpSlotLink(link, null) returns the link unchanged so a NULL slot *works*,
-- but it is inconsistent with rotation and with every other assignment. A capacity-1 page never
-- rotates anyway (taken=[1], capacity 1 -> full -> skipped_full), which is why /SK5x/<GEO>1 is
-- stable. NOTE it keys off the LANDER's offer_id, never the junction's denormalised copy (Trap 8).
INSERT INTO landing_page_affiliates
  (landing_page_id, user_id, offer_id, status, slot, slot_cycle, slot_claimed_at, chosen_by)
SELECT lp.id, u.id, lp.offer_id, 'active', 1, '2026-08', now(), 'admin'
FROM landing_pages lp
CROSS JOIN auth.users u
WHERE lp.slug IN (
        'shein-b2s-us-kerman','shein-b2s-gb-kerman','flash-poll-shein-2-us-kerman',
        'flash-poll-shein-gb-kerman','2x-rewards-shein-bonus-us-kerman',
        'retail-style-shein-us-kerman','product-reviewer-shein-bonus-au-kerman')
  AND lower(u.email) = 'notkermanh@gmail.com'
ON CONFLICT (landing_page_id, user_id)
DO UPDATE SET status = 'active', slot = 1, slot_cycle = '2026-08',
              slot_claimed_at = now(), chosen_by = 'admin';

COMMIT;

-- ══ POST-CHECK — run these after COMMIT ══════════════════════════════════════════════════════

-- (a) Seven rows, all active, all slot 1, each on its own slug. Expect exactly 7.
SELECT o.name, lp.slug, lp.geo, lp.capacity, lp.self_serve, lpa.status, lpa.slot, lpa.chosen_by
  FROM landing_page_affiliates lpa
  JOIN landing_pages lp ON lp.id = lpa.landing_page_id
  JOIN offers o ON o.id = lp.offer_id
 WHERE lpa.user_id = '70fe943b-a245-4fa3-9ef4-cca6ddec906c'
   AND lp.slug LIKE '%-kerman' AND lp.slug <> 'applepay750-us-kerman'
 ORDER BY o.name;

-- (b) His Apple Pay page must be untouched — active, slot 1. Nothing here writes to it.
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

-- (d) Every Shein design with holder counts — his should read held=1, capacity=1, template z.
SELECT o.name, lp.slug, lp.capacity, lp.self_serve, lp.template_key,
       count(a.id) FILTER (WHERE a.status = 'active') AS held
  FROM landing_pages lp
  JOIN offers o ON o.id = lp.offer_id
  LEFT JOIN landing_page_affiliates a ON a.landing_page_id = lp.id
 WHERE o.name ILIKE '%shein%'
 GROUP BY 1,2,3,4,5 ORDER BY 1, lp.template_key;

-- ══ OPTIONAL — trim the house designs out of his picker, on all seven offers ═════════════════
-- Only if you want him to see nothing but his own page. One row per (design, affiliate); it is a
-- picker-DISPLAY rule, not access control, and it covers nobody who joins an offer later.
--
-- ⚠️ NEVER run this against a design he is CURRENTLY ACTIVE on — the DO UPDATE would flip his live
--    row to 'hidden' in place and every consequence is silent: his served link vanishes, and his
--    clone number is freed for someone else while the row still holds it. The NOT LIKE '%-kerman'
--    below is what keeps his own seven out of it.
--
-- INSERT INTO landing_page_affiliates (landing_page_id, user_id, offer_id, status)
-- SELECT lp.id, u.id, lp.offer_id, 'hidden'
-- FROM landing_pages lp
-- JOIN offers o ON o.id = lp.offer_id
-- CROSS JOIN auth.users u
-- WHERE o.name ILIKE '%shein%' AND lp.slug NOT LIKE '%-kerman'
--   AND lower(u.email) = 'notkermanh@gmail.com'
-- ON CONFLICT (landing_page_id, user_id) DO UPDATE SET status = 'hidden';
