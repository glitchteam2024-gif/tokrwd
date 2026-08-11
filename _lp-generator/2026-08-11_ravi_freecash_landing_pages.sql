-- 2026-08-11 — RAVITEJ's supplied Freecash page, on US/CA/GB, locked to him alone.
--
-- RUN THIS IN SUPABASE (SQL editor). One transaction, re-runnable, written to fail loudly rather
-- than half-apply. Pairs with _lp-generator/ravi-freecash.js, which emits 94 files across three
-- clone families and fires the three door slugs below.
--
--   affiliate   ravitejkathuria011@gmail.com   aff 25
--   auth id     9a619c72-035e-4fec-92d9-cc2a17034317   (auth.users, NOT user_profiles —
--               user_profiles.user_id is NULL on live rows, so a join on it returns nothing)
--
--   geo  slug               link                             offer
--   us   freecash-us-ravi   https://www.tokrwd.co/RV61/US1   Freecash
--   ca   freecash-ca-ravi   https://www.tokrwd.co/RV62/CA1   Freecash   <- same offer row
--   gb   freecash-gb-ravi   https://www.tokrwd.co/RV63/GB1   Freecash   <- same offer row
--
-- This is his THIRD bespoke page (Playful Rewards, Shein x7, now Freecash). They do not interact:
-- different offer, different slugs, different rows. Nothing here touches the other two.
--
-- ══ ⚠️ ALL THREE GEOS ARE ONE OFFER. ONLY ONE MAY BE ACTIVE AT A TIME. ═══════════════════════
-- Same shape as his Playful build, and the reason step 4 assigns ONE row and not three.
--
-- Freecash is a SINGLE offer (6d298639-835d-450e-9442-6f4515bc2ce8) whose destination_by_geo
-- carries AT/CA/DE/GB/JP/NL/US. The geo is decided by WHICH landing_pages row the click walks.
-- But resolveAffiliateOfferLinks (SPRKNetworkAds api/_lib/affiliate-links.js) does
--
--     by_offer[lp.offer_id] = link          -- in a forEach, with NO .order()
--
-- and it never even SELECTs lp.geo. So two or more active assignments on THIS offer collapse to
-- one map key and the app serves whichever row PostgREST happens to return last — undefined, and
-- able to flip after any write to any of them (the monthly rotation cron writes them all). That
-- map is the server-side source of truth for launch Destination URLs, so this is a MONEY path: he
-- would launch a US spark code against a GB lander, the door would resolve the GB row's geo, and
-- the visitor would land on the wrong country's offer. Nothing errors anywhere.
--
-- The guards do NOT catch it:
--   · the admin same-geo clash 409 compares geo strings, and three geos never clash;
--   · choose_landing_page will not clean it up — heldLandersFor is scoped (offer, geo);
--   · autoAssignLanders refuses any offer whose designs span more than one geo.
--
-- Measured 2026-08-11: prod has ZERO affiliates holding two active landers on ANY offer. Do not
-- make Ravi the first. All three PAGES and all three ROWS exist so any geo can be switched on in
-- one statement — see "SWITCHING GEO" at the foot of this file.
--
-- ══ WHAT MAKES IT HIS, AND NOBODY ELSE'S ═════════════════════════════════════════════════════
-- Migi 2026-08-11: "make it HIS EXCLUSIVE Landing page do not allow anyone else to have it."
-- Two mechanisms, both from capacity = 1, and they are enough:
--   · THE LOCK      — with the seat held, claimSlot returns {slot:null, full:true} for everyone
--                     else, so choose_landing_page 409s and autoAssignLanders skips it.
--   · THE PRIVACY   — get_offer_landing_pages hides a capacity-1 row from everyone except the
--                     affiliate holding it, and hides an UNHELD one from everyone. So no other
--                     affiliate ever sees a card for his page, and the two unassigned geos stay
--                     out of every picker including his.
--
-- NO status='hidden' rows are written, deliberately. That mechanism hides a design from ONE
-- affiliate in the picker, and all seven HOUSE Freecash rows are self_serve = FALSE (verified
-- 2026-08-11), so pickableLanders already filters them out for everybody. Hide rows here would be
-- inert noise, and each one occupies the UNIQUE (landing_page_id, user_id) pair that a later
-- upsert could resurrect.
--
-- ⚠️ THE ONE EXPOSURE, STATED PLAINLY: if he is ever moved OFF this page, the vacated capacity-1
--    seat is claimable by anyone on the offer. Nothing prevents that (reservedView was removed in
--    f97b2d5). In practice his Freecash picker will contain exactly ONE card — his own — because
--    every house row is self_serve=false, so there is nothing for him to switch to by accident.
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
-- ══ VERIFIED BEFORE WRITING THIS, 2026-08-11 (prod, read-only) ═══════════════════════════════
--   all three slugs                        FREE (query returned [])
--   offer 6d298639                         status=active, cap_mode=fcfs, clickid_slot=s5,
--                                          enforce_assignment=false -> no offer_assignments row needed
--   destination_by_geo                     US/CA/GB all present (landerProblem uppercases lp.geo)
--   the 7 house Freecash rows              self_serve = false, ALL of them
--   his CURRENT holding on this offer      slug 'freecash', geo us, slot 15, status='active',
--                                          chosen_by='admin' -> step 3 is NOT a no-op. It must run.
--   his active landers, all offers         18 (expect 18 after this too — one released, one claimed)
--   network-wide double-holders            ZERO
--   lp_domains                             0 rows / 0 active -> Mode B, the numbered clone is served
--   94 files, 30 clones per family         one md5 within each geo slice, 3 distinct across them
--   node api/_lib/_links-config.test.mjs   190 passed, 0 failed
--   node api/_lib/_tracking-audit.test.mjs 5 passed, 1 failed — PRE-EXISTING and unrelated:
--                                          mgfrcsh/index.html links straight to montrk5.co.uk.
--                                          That is Migi's own /mgfrcsh CA page from commit
--                                          1225c5d, red on a clean checkout of HEAD before any of
--                                          this work. Nothing in RAVFC/RV61-63/ravfcurl trips it.
--
-- ══ ⚠️ DEPLOY THE PAGES BEFORE YOU RUN THIS ══════════════════════════════════════════════════
-- These rows are what PUBLISH the design: the moment they exist the picker shows it and
-- resolveAffiliateOfferLinks starts handing out https://www.tokrwd.co/RV61/US1. If tokrwd has not
-- deployed, that URL is a 404 and NOTHING reports it — the door still answers perfectly (it
-- resolves from landing_pages and never touches the page), the picker card renders, the launcher
-- issues links, and the only symptom is clicks with no conversions, which reads like a bad
-- creative. This produced a live window of paid 404s on 2026-08-09. Confirm first:
--
--   curl -sI https://www.tokrwd.co/RV61/US1   -> 200   (and RV62/CA1, RV63/GB1)
--
-- The preview PNGs go to SPRKNetworkAds (that repo serves /offers). A non-NULL preview_image
-- pointing at an undeployed file renders a BROKEN IMAGE — the "Preview coming soon" placeholder
-- only fires when the column is NULL. Deploy those too before running this.
--
-- Then run this. Afterwards, for each slug:
--   curl -sI 'https://sprktrax.org/api/link/<slug>?s1=SPK-TEST-0000'  -> 302
--   curl -sI 'https://sprktrax.org/api/link/<slug>'                   -> 404
-- The 404 is the attribution gate, not a bug: the door hard-refuses a click with no s1.

BEGIN;

-- ── 1. The three pages ───────────────────────────────────────────────────────────────────────
-- capacity 1 is doing three jobs at once: the single-tenant LOCK, the PRIVACY rule (see the
-- header), and the CONTRACT WITH THE CLONE SLICE — lpSlotLink swaps the trailing digits with no
-- existence check, so a capacity larger than the clones actually deployed hands out live, paid
-- 404s. 30 clones ship per family; capacity 1.
-- self_serve MUST be true or he gets Trap 4: chosen_id comes back null and no "Your page" chip.
-- template_key 'z' sorts each after any house a/b/c.
INSERT INTO landing_pages
  (name, offer_id, link, slug, capacity, geo, status,
   self_serve, template_key, template_name, template_blurb, preview_image)
SELECT v.name, '6d298639-835d-450e-9442-6f4515bc2ce8'::uuid, v.link, v.slug, 1, v.geo, 'active',
       true, 'z', 'Cash & Gift Cards', 'Reserved page. Not available to other affiliates.',
       '/images/landers/' || v.slug || '.png'
FROM (VALUES
  ('Freecash — ravitej (US)', 'https://www.tokrwd.co/RV61/US1', 'freecash-us-ravi', 'us'),
  ('Freecash — ravitej (CA)', 'https://www.tokrwd.co/RV62/CA1', 'freecash-ca-ravi', 'ca'),
  ('Freecash — ravitej (UK)', 'https://www.tokrwd.co/RV63/GB1', 'freecash-gb-ravi', 'gb')
) AS v(name, link, slug, geo)
WHERE NOT EXISTS (
  SELECT 1 FROM landing_pages lp WHERE lower(lp.slug) = v.slug
);

-- ── 2. Sanity: all three rows must now exist, or stop. ───────────────────────────────────────
DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM landing_pages
   WHERE slug IN ('freecash-us-ravi','freecash-ca-ravi','freecash-gb-ravi');
  IF n <> 3 THEN
    RAISE EXCEPTION 'expected 3 ravitej Freecash landing_pages rows, found %', n;
  END IF;
END $$;

-- ── 3. RELEASE FIRST. He IS currently on the house design. ───────────────────────────────────
-- Measured 2026-08-11: slug 'freecash', slot 15, status='active', chosen_by='admin'. NOT a no-op.
-- Leaving it would give him two active rows on this one offer, which is the exact coin flip
-- described at the top — and it is what happened to Ashlyn on 2026-08-04.
-- 'archived' rather than DELETE: keeps the audit trail, and every reader filters status='active',
-- so an archived row holds no slot and resolves nothing. This also frees FC15 back to the house
-- slice, which is correct — he is no longer using it.
UPDATE landing_page_affiliates lpa
   SET status = 'archived'
  FROM landing_pages lp
 WHERE lpa.landing_page_id = lp.id
   AND lpa.user_id = '9a619c72-035e-4fec-92d9-cc2a17034317'
   AND lp.offer_id = '6d298639-835d-450e-9442-6f4515bc2ce8'
   AND lp.slug NOT LIKE '%-ravi'
   AND lpa.status = 'active';

-- ── 4. Then claim ONE seat — the US page. ────────────────────────────────────────────────────
-- ONE, not three. See the ⚠️ at the top. The CA/GB pages and rows exist and are ready; they stay
-- unassigned until someone deliberately switches him (see SWITCHING GEO below).
-- slot 1 explicitly: lpSlotLink(link, null) returns the link unchanged so a NULL slot *works*,
-- but it is inconsistent with rotation and with every other assignment. A capacity-1 page never
-- rotates anyway (taken=[1], capacity 1 -> full -> skipped_full), which is why /RV61/US1 is
-- stable. NOTE it keys off the LANDER's offer_id, never the junction's denormalised copy (Trap 8).
INSERT INTO landing_page_affiliates
  (landing_page_id, user_id, offer_id, status, slot, slot_cycle, slot_claimed_at, chosen_by)
SELECT lp.id, u.id, lp.offer_id, 'active', 1, '2026-08', now(), 'admin'
FROM landing_pages lp
CROSS JOIN auth.users u
WHERE lp.slug = 'freecash-us-ravi'
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
     AND lp.offer_id = '6d298639-835d-450e-9442-6f4515bc2ce8'
     AND lpa.status = 'active';
  IF n <> 1 THEN
    RAISE EXCEPTION 'Freecash must have exactly ONE active lander for this affiliate, found % — see the coin-flip note at the top', n;
  END IF;
END $$;

-- ── 6. Sanity: nobody else may be sitting on his three pages. ────────────────────────────────
-- capacity 1 makes this impossible going forward, but assert it rather than assume it: a stray
-- row here would mean the LOCK is already spent and his page is not his.
DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n
    FROM landing_page_affiliates lpa
    JOIN landing_pages lp ON lp.id = lpa.landing_page_id
   WHERE lp.slug LIKE 'freecash-%-ravi'
     AND lpa.status = 'active'
     AND lpa.user_id <> '9a619c72-035e-4fec-92d9-cc2a17034317';
  IF n <> 0 THEN
    RAISE EXCEPTION 'somebody other than ravitej holds one of his Freecash pages (% rows)', n;
  END IF;
END $$;

COMMIT;

-- ══ POST-CHECK — run these after COMMIT ══════════════════════════════════════════════════════

-- (a) Exactly one active row, on freecash-us-ravi, slot 1. The old 'freecash' row shows archived.
SELECT o.name, lp.slug, lp.geo, lp.capacity, lp.self_serve, lpa.status, lpa.slot, lpa.chosen_by
  FROM landing_page_affiliates lpa
  JOIN landing_pages lp ON lp.id = lpa.landing_page_id
  JOIN offers o ON o.id = lp.offer_id
 WHERE lpa.user_id = '9a619c72-035e-4fec-92d9-cc2a17034317'
   AND lp.offer_id = '6d298639-835d-450e-9442-6f4515bc2ce8'
 ORDER BY lpa.status, lp.geo;

-- (b) All three pages exist, capacity 1, self_serve, preview set, only ONE held.
SELECT lp.slug, lp.geo, lp.capacity, lp.self_serve, lp.template_key, lp.preview_image,
       count(a.id) FILTER (WHERE a.status = 'active') AS held
  FROM landing_pages lp
  LEFT JOIN landing_page_affiliates a ON a.landing_page_id = lp.id
 WHERE lp.slug LIKE 'freecash-%-ravi'
 GROUP BY 1,2,3,4,5,6 ORDER BY lp.geo;

-- (c) His OTHER offers must be untouched. He held 18 active landers on 2026-08-11; expect 18
--     again — one released on this offer, one claimed on this offer.
SELECT count(*) AS should_be_18
  FROM landing_page_affiliates
 WHERE user_id = '9a619c72-035e-4fec-92d9-cc2a17034317' AND status = 'active';

-- (d) NETWORK-WIDE: nobody may hold two active landers on one offer. Expect ZERO rows.
SELECT u.email, o.name, count(*), string_agg(lp.slug, ', ')
  FROM landing_page_affiliates lpa
  JOIN landing_pages lp ON lp.id = lpa.landing_page_id
  JOIN offers o ON o.id = lp.offer_id
  LEFT JOIN auth.users u ON u.id = lpa.user_id
 WHERE lpa.status = 'active'
 GROUP BY u.email, o.name HAVING count(*) > 1;

-- (e) The house slice is unharmed — 21 other affiliates still hold 'freecash', and FC15 is free
--     again. Expect 21 (was 22 including him).
SELECT count(*) AS house_freecash_holders
  FROM landing_page_affiliates lpa
  JOIN landing_pages lp ON lp.id = lpa.landing_page_id
 WHERE lp.slug = 'freecash' AND lpa.status = 'active';

-- ══ SWITCHING GEO — the ONLY supported way to move him between US/CA/GB ══════════════════════
-- Release then claim, in ONE statement pair, inside a transaction. Never leave two active.
-- Replace <NEW> with one of: freecash-us-ravi | freecash-ca-ravi | freecash-gb-ravi
--
--   BEGIN;
--   UPDATE landing_page_affiliates lpa SET status = 'archived'
--     FROM landing_pages lp
--    WHERE lpa.landing_page_id = lp.id
--      AND lpa.user_id = '9a619c72-035e-4fec-92d9-cc2a17034317'
--      AND lp.offer_id = '6d298639-835d-450e-9442-6f4515bc2ce8'
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
-- ⚠️ CURRENCY, ON THE GB PAGE. Migi picked US+CA+GB on 2026-08-11 knowing this: the page quotes
--    USD in a dozen places ($250 chest, $0.50/$5.00 minimums, $100+/month, the ticker amounts,
--    the calculator output). CA also writes "$", so only GB visibly mismatches. It is left
--    unchanged because every "fix" invents a figure we cannot substantiate — "£250" fabricates a
--    UK number, converting fabricates a rate AND an earnings claim. Changing an amount is a
--    claim, not a translation. If a real GB figure is ever confirmed, set `currency` in VARIANTS
--    in _lp-generator/ravi-freecash.js and rebuild; do not hand-edit the emitted pages.
--
-- He can ALSO run any geo without an assignment at all, by pointing his own ad link straight at
-- that geo's numbered clone (https://www.tokrwd.co/RV62/CA1?s1=<his spark code>). The assignment
-- only decides which single link the SPRK app hands him for this offer; the door on each page is
-- already live once its row above exists, and it resolves geo from that row.
