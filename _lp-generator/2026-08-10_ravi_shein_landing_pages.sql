-- ============================================================================================
-- Ravi's own Shein page — all seven English-geo Shein offers, locked to his account alone.
--
--   Affiliate : Raviteja Kathuria · ravitejkathuria011@gmail.com · AffID 25
--               auth.users.id 9a619c72-035e-4fec-92d9-cc2a17034317
--   Pages     : tokrwd 832df17 — DEPLOYED AND VERIFIED 200 BEFORE THIS FILE WAS HANDED OVER.
--   Previews  : SPRKNetworkAds 0a45acf — all seven verified 200.
--
-- ⚠️ RUN THIS AS ONE TRANSACTION, TOP TO BOTTOM. Read the ordering note in Part 2 first.
--
-- THERE IS NO CANADIAN SHEIN OFFER. Every Shein offer carries exactly one geo in
-- destination_by_geo: US x4, GB x2, AU x1. There is nothing to point a CA page at. His Playful
-- Rewards pages DO cover CA — that offer sells it.
--
-- Seven offers means he can legitimately hold all seven at once: the coin-flip hazard in
-- resolveAffiliateOfferLinks is per-OFFER (by_offer[offer_id], no ordering), and these are seven
-- different offers. What is NOT safe is two active rows on the SAME offer — see Part 2.
-- ============================================================================================

BEGIN;

-- ── PART 1 — the seven landing_pages rows ────────────────────────────────────────────────────
-- WHERE NOT EXISTS, never ON CONFLICT: landing_pages_slug_uniq is PARTIAL and on an EXPRESSION
-- (lower(slug)) WHERE slug IS NOT NULL AND status <> 'archived', so a plain ON CONFLICT (slug)
-- finds no arbiter and errors 42P10.
--
--   capacity     1     THE LOCK. With the seat held, claimSlot returns {slot:null, full:true}
--                      for everyone else, and get_offer_landing_pages hides a capacity-1 row from
--                      everyone except its holder. capacity <= clones deployed (30) always.
--   self_serve   true  REQUIRED, or the row is invisible to the picker forever and he lands in
--                      trap 4 — holding a non-self_serve lander means chosen_id comes back NULL,
--                      no "Your page" chip, and every house design offered as an enabled switch.
--   template_key 'z'   sorts after the house a/b/c.
--   link               MUST be a numbered clone: landerProblem probes slots 1 and 2 and refuses a
--                      link where lpSlotLink(link,1) === lpSlotLink(link,2).
--   geo                lowercase, matching the house rows.

INSERT INTO landing_pages
  (name, offer_id, link, slug, capacity, geo, status,
   self_serve, template_key, template_name, template_blurb, preview_image)
SELECT v.name, v.offer_id, v.link, v.slug, 1, v.geo, 'active',
       true, 'z', 'Flash Reward', 'Reserved page. Not available to other affiliates.', v.preview
FROM (VALUES
  ('Shein $1000 Back to School — Ravi (US)',      '7018d82b-f19d-4759-9910-de9e837774e5'::uuid,
   'https://www.tokrwd.co/RV54/US1', 'shein-b2s-us-ravi',                    'us',
   '/images/landers/shein-b2s-us-ravi.png'),
  ('Shein £1000 Back to School — Ravi (UK)',      '01a705a9-c479-4bec-aaed-bd0b038bc4d7'::uuid,
   'https://www.tokrwd.co/RV55/GB1', 'shein-b2s-gb-ravi',                    'gb',
   '/images/landers/shein-b2s-gb-ravi.png'),
  ('Flash Poll Shein $750 — Ravi (US)',           '4b430587-1cbc-4542-82d9-0ef0c5d61d7c'::uuid,
   'https://www.tokrwd.co/RV56/US1', 'flash-poll-shein-2-us-ravi',           'us',
   '/images/landers/flash-poll-shein-2-us-ravi.png'),
  ('Flash Poll Shein £750 — Ravi (UK)',           'b4efc3f5-491e-485e-aad8-f57145d6d4d9'::uuid,
   'https://www.tokrwd.co/RV57/GB1', 'flash-poll-shein-gb-ravi',             'gb',
   '/images/landers/flash-poll-shein-gb-ravi.png'),
  ('2x Rewards Shein $750 Bonus — Ravi (US)',     'f56469f1-12a1-4a6b-a8c2-81dfa9359075'::uuid,
   'https://www.tokrwd.co/RV58/US1', '2x-rewards-shein-bonus-us-ravi',       'us',
   '/images/landers/2x-rewards-shein-bonus-us-ravi.png'),
  ('Retail Style Shein $750 — Ravi (US)',         '597d4dc9-a13f-4a0e-9acc-15dd4b6ca628'::uuid,
   'https://www.tokrwd.co/RV59/US1', 'retail-style-shein-us-ravi',           'us',
   '/images/landers/retail-style-shein-us-ravi.png'),
  ('Product Reviewer Shein Bonus $750 — Ravi (AU)','209e39e1-02b5-4102-ad2c-600468ed4fc8'::uuid,
   'https://www.tokrwd.co/RV60/AU1', 'product-reviewer-shein-bonus-au-ravi', 'au',
   '/images/landers/product-reviewer-shein-bonus-au-ravi.png')
) AS v(name, offer_id, link, slug, geo, preview)
WHERE NOT EXISTS (
  SELECT 1 FROM landing_pages lp WHERE lower(lp.slug) = v.slug
);

-- ── PART 2 — RELEASE BEFORE YOU CLAIM ────────────────────────────────────────────────────────
-- ⚠️ THIS MUST RUN BEFORE PART 3, AND IT IS THE STEP THAT IS EASY TO SKIP.
--
-- He is currently ACTIVE on shein-b2s-us-b (a house design, slot 1, chosen_by='auto') — which is
-- on offer 7018d82b, THE SAME OFFER as his new shein-b2s-us-ravi page. The picker switches
-- designs release-then-claim; raw SQL does not. Insert without archiving and he ends up with TWO
-- active rows on one offer, and resolveAffiliateOfferLinks keys by_offer[lp.offer_id] inside a
-- forEach with NO .order() — so which link he is served is undefined and can flip on any write to
-- either row (the monthly rotation cron writes to every one). He would get the house design on one
-- page load and his own page on the next, and nothing would error anywhere.
--
-- 'archived' rather than DELETE: it keeps the audit trail, and every filter in the codebase tests
-- status = 'active', so an archived row holds no slot and resolves nothing.

UPDATE landing_page_affiliates lpa
   SET status = 'archived'
  FROM landing_pages lp
 WHERE lpa.landing_page_id = lp.id
   AND lpa.user_id = '9a619c72-035e-4fec-92d9-cc2a17034317'
   AND lpa.status  = 'active'
   AND lp.offer_id IN (
     '7018d82b-f19d-4759-9910-de9e837774e5', '01a705a9-c479-4bec-aaed-bd0b038bc4d7',
     '4b430587-1cbc-4542-82d9-0ef0c5d61d7c', 'b4efc3f5-491e-485e-aad8-f57145d6d4d9',
     'f56469f1-12a1-4a6b-a8c2-81dfa9359075', '597d4dc9-a13f-4a0e-9acc-15dd4b6ca628',
     '209e39e1-02b5-4102-ad2c-600468ed4fc8'
   )
   AND lp.slug NOT LIKE '%-ravi';     -- never archive the rows Part 3 is about to create

-- ── PART 3 — assign him to all seven ─────────────────────────────────────────────────────────
-- ON CONFLICT is correct HERE: landing_page_affiliates_landing_page_id_user_id_key is a plain
-- UNIQUE (landing_page_id, user_id). It is NOT correct on landing_pages — see Part 1.
--
-- user_id is the AUTH.USERS id, resolved by EMAIL. user_profiles.id and user_profiles.user_id are
-- different columns and both are the wrong answer here (user_profiles.user_id is NULL on live rows).
--
-- slot is set explicitly: lpSlotLink(link, NULL) returns the link unchanged so a NULL slot *works*,
-- but it is inconsistent with rotation and with every other assignment. A capacity-1 page never
-- rotates anyway (taken=[1], capacity 1 -> full -> skipped_full), so slot 1 is stable forever.

INSERT INTO landing_page_affiliates
  (landing_page_id, user_id, offer_id, status, slot, slot_cycle, slot_claimed_at, chosen_by)
SELECT lp.id, u.id, lp.offer_id, 'active', 1, '2026-08', now(), 'admin'
FROM landing_pages lp
CROSS JOIN auth.users u
WHERE lp.slug IN (
        'shein-b2s-us-ravi', 'shein-b2s-gb-ravi', 'flash-poll-shein-2-us-ravi',
        'flash-poll-shein-gb-ravi', '2x-rewards-shein-bonus-us-ravi',
        'retail-style-shein-us-ravi', 'product-reviewer-shein-bonus-au-ravi')
  AND lower(u.email) = 'ravitejkathuria011@gmail.com'
ON CONFLICT (landing_page_id, user_id)
DO UPDATE SET status = 'active', slot = 1, slot_cycle = '2026-08',
              slot_claimed_at = now(), chosen_by = 'admin';

-- ── PART 4 — keep the house Shein designs out of his picker ──────────────────────────────────
-- A landing_page_affiliates row with status='hidden' means "do not offer THIS design to THIS
-- affiliate". Scoped to capacity > 1 so it only touches the HOUSE designs: notkerman's bespoke
-- pages are capacity 1 and already invisible to Ravi under the capacity-1 privacy rule, so
-- writing hide rows for them would be noise.
--
-- Safe to upsert here ONLY because Part 2 has already archived everything he was active on. The
-- warning in the skill is about flipping a LIVE 'active' row to 'hidden' in place, which silently
-- vanishes his served link and frees his clone number while the row still holds it. Part 2 runs
-- first precisely so that cannot happen — and the WHERE excludes his own pages regardless.

INSERT INTO landing_page_affiliates (landing_page_id, user_id, offer_id, status)
SELECT lp.id, u.id, lp.offer_id, 'hidden'
FROM landing_pages lp
CROSS JOIN auth.users u
WHERE lp.offer_id IN (
        '7018d82b-f19d-4759-9910-de9e837774e5', '01a705a9-c479-4bec-aaed-bd0b038bc4d7',
        '4b430587-1cbc-4542-82d9-0ef0c5d61d7c', 'b4efc3f5-491e-485e-aad8-f57145d6d4d9',
        'f56469f1-12a1-4a6b-a8c2-81dfa9359075', '597d4dc9-a13f-4a0e-9acc-15dd4b6ca628',
        '209e39e1-02b5-4102-ad2c-600468ed4fc8')
  AND lp.capacity > 1
  AND lp.status <> 'archived'
  AND lp.slug NOT LIKE '%-ravi'
  AND lower(u.email) = 'ravitejkathuria011@gmail.com'
ON CONFLICT (landing_page_id, user_id) DO UPDATE SET status = 'hidden';

COMMIT;

-- ============================================================================================
-- POST-CHECKS — run these after COMMIT and eyeball each one.
-- ============================================================================================

-- (a) the seven pages: capacity 1, self_serve true, held by exactly one person each
SELECT lp.slug, lp.geo, lp.capacity, lp.self_serve,
       count(a.id) FILTER (WHERE a.status = 'active') AS held
  FROM landing_pages lp
  LEFT JOIN landing_page_affiliates a ON a.landing_page_id = lp.id
 WHERE lp.slug IN (
        'shein-b2s-us-ravi', 'shein-b2s-gb-ravi', 'flash-poll-shein-2-us-ravi',
        'flash-poll-shein-gb-ravi', '2x-rewards-shein-bonus-us-ravi',
        'retail-style-shein-us-ravi', 'product-reviewer-shein-bonus-au-ravi')
 GROUP BY 1,2,3,4 ORDER BY lp.geo, lp.slug;

-- (b) nobody but Ravi is on a -ravi Shein page (expect 7 rows, all his)
SELECT lp.slug, u.email, a.status, a.slot
  FROM landing_page_affiliates a
  JOIN landing_pages lp ON lp.id = a.landing_page_id
  LEFT JOIN auth.users u ON u.id = a.user_id
 WHERE lp.slug IN (
        'shein-b2s-us-ravi', 'shein-b2s-gb-ravi', 'flash-poll-shein-2-us-ravi',
        'flash-poll-shein-gb-ravi', '2x-rewards-shein-bonus-us-ravi',
        'retail-style-shein-us-ravi', 'product-reviewer-shein-bonus-au-ravi')
   AND a.status = 'active'
 ORDER BY lp.slug;

-- (c) EXACTLY ONE active assignment per (affiliate, offer), network-wide. Expect ZERO rows.
--     This is the check that catches the release-before-claim trap.
SELECT u.email, o.name, count(*), string_agg(lp.slug, ', ')
  FROM landing_page_affiliates lpa
  JOIN landing_pages lp ON lp.id = lpa.landing_page_id
  JOIN offers o ON o.id = lp.offer_id
  LEFT JOIN auth.users u ON u.id = lpa.user_id
 WHERE lpa.status = 'active'
 GROUP BY u.email, o.name HAVING count(*) > 1;

-- (d) what Ravi now sees across all seven Shein offers (his 7 active + the house ones hidden)
SELECT lp.slug, lp.geo, lp.capacity, a.status, a.slot
  FROM landing_page_affiliates a
  JOIN landing_pages lp ON lp.id = a.landing_page_id
 WHERE a.user_id = '9a619c72-035e-4fec-92d9-cc2a17034317'
   AND lp.offer_id IN (
     '7018d82b-f19d-4759-9910-de9e837774e5', '01a705a9-c479-4bec-aaed-bd0b038bc4d7',
     '4b430587-1cbc-4542-82d9-0ef0c5d61d7c', 'b4efc3f5-491e-485e-aad8-f57145d6d4d9',
     'f56469f1-12a1-4a6b-a8c2-81dfa9359075', '597d4dc9-a13f-4a0e-9acc-15dd4b6ca628',
     '209e39e1-02b5-4102-ad2c-600468ed4fc8')
 ORDER BY a.status, lp.geo, lp.slug;

-- (e) his Playful pages are untouched by all of the above (expect his 1 active Playful row)
SELECT lp.slug, a.status, a.slot
  FROM landing_page_affiliates a
  JOIN landing_pages lp ON lp.id = a.landing_page_id
 WHERE a.user_id = '9a619c72-035e-4fec-92d9-cc2a17034317'
   AND lp.slug LIKE 'playful-%'
 ORDER BY a.status, lp.slug;

-- (f) the doors answer once the rows exist. Run in a shell, not here:
--     for s in shein-b2s-us-ravi shein-b2s-gb-ravi flash-poll-shein-2-us-ravi \
--              flash-poll-shein-gb-ravi 2x-rewards-shein-bonus-us-ravi \
--              retail-style-shein-us-ravi product-reviewer-shein-bonus-au-ravi; do
--       echo "$s $(curl -sI "https://sprktrax.org/api/link/$s?s1=SPK-TEST-0000" -o /dev/null -w '%{http_code}')" \
--            "$(curl -sI "https://sprktrax.org/api/link/$s" -o /dev/null -w '%{http_code}')"
--     done
--     Expect 302 with s1 and 404 without on every one. The bare 404 is the attribution gate,
--     not a bug: the door refuses a click with NO s1, while a present-but-unregistered s1 still
--     302s unattributed on purpose, so a DB blip never drops a paid lead.
