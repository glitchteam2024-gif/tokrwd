-- 2026-08-10 — Lock ravitej's Playful Rewards pages down to HIM and nobody else.
--
-- Run AFTER 2026-08-10_ravi_playful_landing_pages.sql. Both parts are safe to re-run.
--
-- ══ WHAT IS ALREADY LOCKED, MEASURED IN PROD — you may not need part A at all ════════════════
-- playful-us-ravi: capacity 1, held by ravitej (slot 1). That is a HARD lock, not a display one:
--   · claimSlot() -> {slot:null, full:true} for everyone else, so choose_landing_page 409s and
--     autoAssignLanders skips to the next design;
--   · get_offer_landing_pages drops EVERY capacity-1 row from the picker unless the viewer is its
--     current holder (api/admin.js:5019 — `if (Number(l.capacity) === 1) return false;`);
--   · landing_pages.link is deliberately never returned to a non-holder.
-- Nothing else on the network holds two active landers on one offer. Verified 2026-08-10.

-- ══ PART A — close the unheld-page gap (RECOMMENDED) ═════════════════════════════════════════
-- THE GAP: choose_landing_page does NOT apply the capacity-1 privacy rule — that rule lives only
-- in get_offer_landing_pages, i.e. it is a PICKER-DISPLAY rule. The three geo pages ravitej is not
-- currently holding (gb/ca/au) are unheld, so claimSlot would hand out slot 1 to whoever asked.
-- Today the only thing stopping another affiliate is that they cannot learn the landing_page UUID
-- (the picker filters those rows out before serialising). That is OBSCURITY, NOT ENFORCEMENT.
--
-- Setting self_serve = false on the three he is NOT on closes it properly: pickableLanders drops
-- them and choose_landing_page returns 403 'not available to choose' before it ever reaches the
-- slot allocator. Costs nothing — they are already invisible to him too, and switching his geo is
-- an admin action either way (see the switch block at the foot of this file, which flips the flag).
--
-- ⚠️ The page he IS on must keep self_serve = true. With it false he hits Trap 4: golMine never
--    resolves, so he gets no "Your page" chip and every house design renders as an enabled
--    "Use this design" that would release his own page out from under him.
UPDATE landing_pages
   SET self_serve = false, updated_at = now()
 WHERE slug IN ('playful-gb-ravi', 'playful-ca-ravi', 'playful-au-ravi')
   AND NOT EXISTS (
     SELECT 1 FROM landing_page_affiliates a
      WHERE a.landing_page_id = landing_pages.id AND a.status = 'active'
   );

-- ══ PART B — stop RAVITEJ from switching himself off his own page (OPTIONAL) ═════════════════
-- A different risk from part A, and the more likely one to actually happen.
--
-- His picker currently shows his own page PLUS the four house Playful designs (capacity 30,
-- self_serve, not hidden from him). One tap on "Use this design" on a house card RELEASES his
-- bespoke page — and because capacity-1 seats are claimable the moment they are vacated, getting
-- it back may need an admin. A status='hidden' junction row removes those cards from HIS picker
-- only; it hands out no lander, consumes no clone number and is never rotated.
--
-- ⚠️ SAFE HERE, AND ONLY BECAUSE IT WAS CHECKED: never run this against a design the affiliate is
--    CURRENTLY ACTIVE on — the DO UPDATE would flip a live 'active' row to 'hidden' in place,
--    silently freeing their slot for someone else while their served link vanishes. Measured
--    2026-08-10: on this offer ravitej is active ONLY on playful-us-ravi, and his old playful-us
--    row is 'archived' (inert, but it holds the unique pair, so the upsert resurrects it as
--    'hidden' — which is exactly what we want).
--    The WHERE clause below re-checks this at run time rather than trusting that measurement.
INSERT INTO landing_page_affiliates (landing_page_id, user_id, offer_id, status)
SELECT lp.id, u.id, lp.offer_id, 'hidden'
  FROM landing_pages lp
 CROSS JOIN auth.users u
 WHERE lp.slug IN ('playful-us', 'playful-gb', 'playful-ca', 'playful-au')
   AND lower(u.email) = 'ravitejkathuria011@gmail.com'
   AND NOT EXISTS (
     SELECT 1 FROM landing_page_affiliates a
      WHERE a.landing_page_id = lp.id AND a.user_id = u.id AND a.status = 'active'
   )
ON CONFLICT (landing_page_id, user_id) DO UPDATE SET status = 'hidden';

-- ══ POST-CHECK ══════════════════════════════════════════════════════════════════════════════

-- (a) The four bespoke rows. Expect: playful-us-ravi self_serve=true held=1; the other three
--     self_serve=false held=0.
SELECT lp.slug, lp.geo, lp.capacity, lp.self_serve,
       count(a.id) FILTER (WHERE a.status = 'active') AS held
  FROM landing_pages lp
  LEFT JOIN landing_page_affiliates a ON a.landing_page_id = lp.id
 WHERE lp.slug LIKE 'playful-%-ravi'
 GROUP BY 1,2,3,4 ORDER BY lp.geo;

-- (b) What ravitej now sees on this offer. Expect ONE 'active' (playful-us-ravi) and four
--     'hidden'/'archived' house rows. Anything else 'active' here is a bug.
SELECT lp.slug, lp.geo, lp.capacity, a.status, a.slot
  FROM landing_page_affiliates a
  JOIN landing_pages lp ON lp.id = a.landing_page_id
 WHERE a.user_id = '9a619c72-035e-4fec-92d9-cc2a17034317'
   AND lp.offer_id = 'eaf3fdda-1474-4c9a-adb6-516247e3fca8'
 ORDER BY a.status, lp.geo;

-- (c) Nobody but ravitej is on a -ravi page. Expect exactly one row, his.
SELECT lp.slug, u.email, a.status, a.slot
  FROM landing_page_affiliates a
  JOIN landing_pages lp ON lp.id = a.landing_page_id
  LEFT JOIN auth.users u ON u.id = a.user_id
 WHERE lp.slug LIKE 'playful-%-ravi' AND a.status = 'active';

-- (d) The house designs are untouched for everyone else — playful-us should still read 6 holders.
SELECT lp.slug, count(*) FILTER (WHERE a.status = 'active') AS active_holders
  FROM landing_pages lp
  LEFT JOIN landing_page_affiliates a ON a.landing_page_id = lp.id
 WHERE lp.offer_id = 'eaf3fdda-1474-4c9a-adb6-516247e3fca8'
 GROUP BY 1 ORDER BY 1;

-- ══ SWITCHING HIS GEO, now that part A is in ════════════════════════════════════════════════
-- Replace <NEW> with playful-gb-ravi | playful-ca-ravi | playful-au-ravi | playful-us-ravi.
-- Flip self_serve with the assignment, so exactly one of his four is ever claimable, and exactly
-- one is ever active (the coin-flip note in the sibling file explains why the second part matters).
--
--   BEGIN;
--   UPDATE landing_pages SET self_serve = (slug = '<NEW>'), updated_at = now()
--    WHERE slug LIKE 'playful-%-ravi';
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
