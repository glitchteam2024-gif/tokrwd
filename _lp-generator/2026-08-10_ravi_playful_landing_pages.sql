-- 2026-08-10 — RAVITEJ's supplied Playful Rewards page, on all four ENGLISH geos, locked to him.
--
-- RUN THIS IN SUPABASE (SQL editor). One transaction, re-runnable, written to fail loudly rather
-- than half-apply. Pairs with _lp-generator/ravi-playful.js, which emits 125 files across four
-- clone families and fires the four door slugs below.
--
--   affiliate   ravitejkathuria011@gmail.com   aff 25
--   auth id     9a619c72-035e-4fec-92d9-cc2a17034317   (auth.users, NOT user_profiles —
--               user_profiles.user_id is NULL on live rows, so a join on it returns nothing)
--
--   geo  slug              link                             offer
--   us   playful-us-ravi   https://www.tokrwd.co/RV50/US1   Playful Rewards
--   gb   playful-gb-ravi   https://www.tokrwd.co/RV51/GB1   Playful Rewards   <- same offer row
--   ca   playful-ca-ravi   https://www.tokrwd.co/RV52/CA1   Playful Rewards   <- same offer row
--   au   playful-au-ravi   https://www.tokrwd.co/RV53/AU1   Playful Rewards   <- same offer row
--
-- ══ ⚠️ ALL FOUR GEOS ARE ONE OFFER. ONLY ONE MAY BE ACTIVE AT A TIME. ════════════════════════
-- This is the thing that makes this file different from every previous bespoke build, and it is
-- the reason step 4 assigns ONE row and not four.
--
-- Playful Rewards is a SINGLE offer (eaf3fdda-1474-4c9a-adb6-516247e3fca8) whose
-- destination_by_geo carries US/GB/CA/AU. The geo is decided by WHICH landing_pages row the click
-- walks. But resolveAffiliateOfferLinks (SPRKNetworkAds api/_lib/affiliate-links.js:238-251) does
--
--     by_offer[lp.offer_id] = link          -- in a forEach, with NO .order()
--
-- and it never even SELECTs lp.geo. So two or more active assignments on THIS offer collapse to
-- one map key and the app serves whichever row PostgREST happens to return last — undefined, and
-- able to flip after any write to any of them (the monthly rotation cron writes them all).
-- That map is the server-side source of truth for launch Destination URLs, so this is a MONEY
-- path: he would launch a US spark code against a GB lander, the door would resolve the GB row's
-- geo, and the visitor would land on the wrong country's offer. Nothing errors anywhere.
--
-- The guards do NOT catch it:
--   · the admin same-geo clash 409 compares geo strings, and four geos never clash;
--   · autoAssignLanders already refuses this offer outright (skipped: 'ambiguous-geo');
--   · nothing else looks.
--
-- Measured 2026-08-10: prod has ZERO affiliates holding two active landers on ANY offer. Do not
-- make Ravi the first. All four PAGES and all four ROWS exist so any geo can be switched on in
-- one statement — see "SWITCHING GEO" at the foot of this file.
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
-- ══ VERIFIED BEFORE WRITING THIS, 2026-08-10 ═════════════════════════════════════════════════
--   all four slugs                         FREE (only playful-us/gb/ca/au house rows exist)
--   offer eaf3fdda                         status=active, cap_mode=fcfs, payout NULL,
--                                          enforce_assignment=false -> no offer_assignments row needed
--   destination_by_geo                     US/GB/CA/AU all present (landerProblem uppercases lp.geo)
--   his CURRENT holding on this offer      playful-us, slot 2, status=active, chosen_by NULL
--                                          -> step 3 is NOT a no-op here. It must run.
--   125 files, 30 clones per family        one md5 within each geo slice, 4 distinct across them
--   node api/_lib/_tracking-audit.test.mjs   6 passed, 0 failed
--   node api/_lib/_links-config.test.mjs   190 passed, 0 failed
--   node api/_lib/_traffic-filter.test.mjs 20 passed, 0 failed
--   node api/_lib/_prelander-page.test.mjs 62 passed, 0 failed
--
-- ══ ⚠️ DEPLOY THE PAGES BEFORE YOU RUN THIS ══════════════════════════════════════════════════
-- These rows are what PUBLISH the design: the moment they exist the picker shows it and
-- resolveAffiliateOfferLinks starts handing out https://www.tokrwd.co/RV50/US1. If tokrwd has not
-- deployed, that URL is a 404 and NOTHING reports it — the door still answers perfectly (it
-- resolves from landing_pages and never touches the page), the picker card renders, the launcher
-- issues links, and the only symptom is clicks with no conversions. Confirm first:
--
--   curl -sI https://www.tokrwd.co/RV50/US1   -> 200      (and RV51/GB1, RV52/CA1, RV53/AU1)
--
-- Then run this. Afterwards, for each slug:
--   curl -sI 'https://sprktrax.org/api/link/<slug>?s1=SPK-TEST-0000'  -> 302
--   curl -sI 'https://sprktrax.org/api/link/<slug>'                   -> 404
-- The 404 is the attribution gate, not a bug: the door hard-refuses a click with no s1.

BEGIN;

-- ── 1. The four pages ────────────────────────────────────────────────────────────────────────
-- capacity 1 is doing three jobs at once: it is the single-tenant LOCK (claimSlot returns
-- {slot:null, full:true} for everyone else), it is the PRIVACY rule (get_offer_landing_pages
-- hides a capacity-1 row from everyone but its holder, and hides an UNHELD one from everyone —
-- which is what keeps the three unassigned geos out of every other affiliate's picker), and it is
-- the CONTRACT WITH THE CLONE SLICE: lpSlotLink swaps the trailing digits with no existence
-- check, so a capacity larger than the clones actually deployed hands out live, paid 404s.
-- 30 clones ship per family; capacity 1.
-- self_serve MUST be true or he gets Trap 4: chosen_id comes back null, no "Your page" chip, and
-- every house design renders as an enabled "Use this design" that would release his own page.
-- template_key 'z' sorts each after the house a/b/c/d.
INSERT INTO landing_pages
  (name, offer_id, link, slug, capacity, geo, status,
   self_serve, template_key, template_name, template_blurb, preview_image)
SELECT v.name, 'eaf3fdda-1474-4c9a-adb6-516247e3fca8'::uuid, v.link, v.slug, 1, v.geo, 'active',
       true, 'z', 'Play & Earn', 'Reserved page. Not available to other affiliates.',
       '/images/landers/' || v.slug || '.png'
FROM (VALUES
  ('Playful Rewards — ravitej (US)', 'https://www.tokrwd.co/RV50/US1', 'playful-us-ravi', 'us'),
  ('Playful Rewards — ravitej (UK)', 'https://www.tokrwd.co/RV51/GB1', 'playful-gb-ravi', 'gb'),
  ('Playful Rewards — ravitej (CA)', 'https://www.tokrwd.co/RV52/CA1', 'playful-ca-ravi', 'ca'),
  ('Playful Rewards — ravitej (AU)', 'https://www.tokrwd.co/RV53/AU1', 'playful-au-ravi', 'au')
) AS v(name, link, slug, geo)
WHERE NOT EXISTS (
  SELECT 1 FROM landing_pages lp WHERE lower(lp.slug) = v.slug
);

-- ── 2. Sanity: all four rows must now exist, or stop. ────────────────────────────────────────
DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM landing_pages
   WHERE slug IN ('playful-us-ravi','playful-gb-ravi','playful-ca-ravi','playful-au-ravi');
  IF n <> 4 THEN
    RAISE EXCEPTION 'expected 4 ravitej landing_pages rows, found %', n;
  END IF;
END $$;

-- ── 3. RELEASE FIRST. He IS currently on the house design. ───────────────────────────────────
-- Measured 2026-08-10: playful-us, slot 2, status='active', chosen_by NULL. This is NOT a no-op.
-- Leaving it would give him two active rows on this one offer, which is the exact coin flip
-- described at the top — and it is what happened to Ashlyn on 2026-08-04.
-- 'archived' rather than DELETE: keeps the audit trail, and every reader filters status='active',
-- so an archived row holds no slot and resolves nothing.
UPDATE landing_page_affiliates lpa
   SET status = 'archived'
  FROM landing_pages lp
 WHERE lpa.landing_page_id = lp.id
   AND lpa.user_id = '9a619c72-035e-4fec-92d9-cc2a17034317'
   AND lp.offer_id = 'eaf3fdda-1474-4c9a-adb6-516247e3fca8'
   AND lp.slug NOT LIKE '%-ravi'
   AND lpa.status = 'active';

-- ── 4. Then claim ONE seat — the US page. ────────────────────────────────────────────────────
-- ONE, not four. See the ⚠️ at the top of this file: four active rows on this single offer make
-- the served link undefined. The GB/CA/AU pages and rows exist and are ready; they stay
-- unassigned until someone deliberately switches him (see SWITCHING GEO below).
-- slot 1 explicitly: lpSlotLink(link, null) returns the link unchanged so a NULL slot *works*,
-- but it is inconsistent with rotation and with every other assignment. A capacity-1 page never
-- rotates anyway (taken=[1], capacity 1 -> full -> skipped_full), which is why /RV50/US1 is
-- stable. NOTE it keys off the LANDER's offer_id, never the junction's denormalised copy (Trap 8).
INSERT INTO landing_page_affiliates
  (landing_page_id, user_id, offer_id, status, slot, slot_cycle, slot_claimed_at, chosen_by)
SELECT lp.id, u.id, lp.offer_id, 'active', 1, '2026-08', now(), 'admin'
FROM landing_pages lp
CROSS JOIN auth.users u
WHERE lp.slug = 'playful-us-ravi'
  AND lower(u.email) = 'ravitejkathuria011@gmail.com'
ON CONFLICT (landing_page_id, user_id)
DO UPDATE SET status = 'active', slot = 1, slot_cycle = '2026-08',
              slot_claimed_at = now(), chosen_by = 'admin';

-- ── 5. Sanity: exactly ONE active row for him on this offer. ─────────────────────────────────
DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n
    FROM landing_page_affiliates lpa
    JOIN landing_pages lp ON lp.id = lpa.landing_page_id
   WHERE lpa.user_id = '9a619c72-035e-4fec-92d9-cc2a17034317'
     AND lp.offer_id = 'eaf3fdda-1474-4c9a-adb6-516247e3fca8'
     AND lpa.status = 'active';
  IF n <> 1 THEN
    RAISE EXCEPTION 'Playful Rewards must have exactly ONE active lander for this affiliate, found % — see the coin-flip note at the top', n;
  END IF;
END $$;

COMMIT;

-- ══ POST-CHECK — run these after COMMIT ══════════════════════════════════════════════════════

-- (a) Exactly one active row, on playful-us-ravi, slot 1.
SELECT o.name, lp.slug, lp.geo, lp.capacity, lp.self_serve, lpa.status, lpa.slot, lpa.chosen_by
  FROM landing_page_affiliates lpa
  JOIN landing_pages lp ON lp.id = lpa.landing_page_id
  JOIN offers o ON o.id = lp.offer_id
 WHERE lpa.user_id = '9a619c72-035e-4fec-92d9-cc2a17034317'
   AND lp.offer_id = 'eaf3fdda-1474-4c9a-adb6-516247e3fca8'
 ORDER BY lpa.status, lp.geo;

-- (b) All four pages exist, capacity 1, self_serve, only one held.
SELECT lp.slug, lp.geo, lp.capacity, lp.self_serve, lp.preview_image,
       count(a.id) FILTER (WHERE a.status = 'active') AS held
  FROM landing_pages lp
  LEFT JOIN landing_page_affiliates a ON a.landing_page_id = lp.id
 WHERE lp.slug LIKE 'playful-%-ravi'
 GROUP BY 1,2,3,4,5 ORDER BY lp.geo;

-- (c) His OTHER offers must be untouched — nothing here writes outside offer eaf3fdda.
--     He held 12 active landers across other offers on 2026-08-10; expect 11 here plus the one
--     Playful row from (a), i.e. this returns his full roster with no duplicates.
SELECT o.name, lp.slug, lpa.slot, lpa.status
  FROM landing_page_affiliates lpa
  JOIN landing_pages lp ON lp.id = lpa.landing_page_id
  JOIN offers o ON o.id = lp.offer_id
 WHERE lpa.user_id = '9a619c72-035e-4fec-92d9-cc2a17034317' AND lpa.status = 'active'
 ORDER BY o.name;

-- (d) NETWORK-WIDE: nobody may hold two active landers on one offer. Expect ZERO rows.
SELECT u.email, o.name, count(*), string_agg(lp.slug, ', ')
  FROM landing_page_affiliates lpa
  JOIN landing_pages lp ON lp.id = lpa.landing_page_id
  JOIN offers o ON o.id = lp.offer_id
  LEFT JOIN auth.users u ON u.id = lpa.user_id
 WHERE lpa.status = 'active'
 GROUP BY u.email, o.name HAVING count(*) > 1;

-- ══ SWITCHING GEO — the ONLY supported way to move him between US/GB/CA/AU ═══════════════════
-- Release then claim, in ONE statement pair, inside a transaction. Never leave two active.
-- Replace <NEW> with one of: playful-us-ravi | playful-gb-ravi | playful-ca-ravi | playful-au-ravi
--
--   BEGIN;
--   UPDATE landing_page_affiliates lpa SET status = 'archived'
--     FROM landing_pages lp
--    WHERE lpa.landing_page_id = lp.id
--      AND lpa.user_id = '9a619c72-035e-4fec-92d9-cc2a17034317'
--      AND lp.offer_id = 'eaf3fdda-1474-4c9a-adb6-516247e3fca8'
--      AND lpa.status = 'active';
--   INSERT INTO landing_page_affiliates
--     (landing_page_id, user_id, offer_id, status, slot, slot_cycle, slot_claimed_at, chosen_by)
--   SELECT lp.id, u.id, lp.offer_id, 'active', 1, '2026-08', now(), 'admin'
--     FROM landing_pages lp CROSS JOIN auth.users u
--    WHERE lp.slug = '<NEW>' AND lower(u.email) = 'ravitejkathuria011@gmail.com'
--   ON CONFLICT (landing_page_id, user_id)
--   DO UPDATE SET status = 'active', slot = 1, slot_cycle = '2026-08',
--                 slot_claimed_at = now(), chosen_by = 'admin';
--   COMMIT;
--
-- He can ALSO run any geo without an assignment at all, by pointing his own ad link straight at
-- that geo's numbered clone (https://www.tokrwd.co/RV51/GB1?s1=<his spark code>). The assignment
-- only decides which single link the SPRK app hands him for this offer; the door on each page is
-- already live once its row above exists, and it resolves geo from that row.
