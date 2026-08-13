-- =====================================================================================
-- Freecash on GIFTCLICK — Migi's personal scaler door               2026-08-13
-- =====================================================================================
-- Run once, top to bottom, in the Supabase SQL editor. Idempotent: re-running is a
-- no-op, not a duplicate.
--
-- WHAT THIS DOES **NOT** DO, AND WHY THAT IS THE WHOLE POINT
-- ---------------------------------------------------------------------------
-- It does NOT touch the existing Freecash offer (6d298639-…). `destination_url`
-- lives on the OFFER, not the door — there is no per-door override — so repointing
-- it at giftclick would have moved EVERY door on it:
--
--     10 doors · 14 affiliates · 50,230 clicks (30d)
--     182 conversions · $377.51 gross · $361.31 owed to affiliates
--
-- …into an account keyed `aff_id=20395`, with no postback wired and the wrong SubID
-- namespace. Eight affiliates would have stopped earning silently. So this script
-- creates a SEPARATE offer and points only Migi's own door at it. Every existing
-- Freecash door keeps pointing at montrk3.co.uk, untouched.
--
-- THE THREE THINGS THAT MAKE THIS AN *EVERFLOW* SETUP, NOT A CAKE ONE
-- ---------------------------------------------------------------------------
--   1. subid_scheme = 'passthrough'.  A new network row DEFAULTS TO 'v3', and v3
--      writes s1..s5 while Everflow reads sub1..sub5 — every conversion would land
--      `unmatched`. This is a catalogued production bug (money-integrity skill,
--      2026-08-02): "a NEW Everflow network defaults to v3 and will land unmatched."
--   2. type = 'everflow'.  A network saved with a blank Type gets no sub* namespace
--      at all — same skill, same entry.
--   3. clickid_slot = 'sub2'.  Mirrors the Playful Rewards offer, which is already
--      live on Everflow, and matches the Fluent postback template's `cid={sub2}`.
--
-- Verified against the shipped api/_lib/tracking.js buildClickDestination(): the
-- destination already carries a query string, and the door appends correctly —
--   https://giftclick.org/aff_c?offer_id=3530&aff_id=20395&sub1=MIGI1&sub2=<token>
-- =====================================================================================


-- ─────────────────────────────────────────────────────────────────────────────
-- PART 1 — PREVIEW. Read-only. Confirm the blast radius is zero before applying.
-- ─────────────────────────────────────────────────────────────────────────────

-- 1a. The existing Freecash doors that must remain on Monetise, untouched.
SELECT lp.slug, lp.geo, o.name AS offer, o.destination_url
  FROM landing_pages lp JOIN offers o ON o.id = lp.offer_id
 WHERE o.id = '6d298639-835d-450e-9442-6f4515bc2ce8'
 ORDER BY lp.slug;

-- 1b. Nothing should collide. All three must return 0.
SELECT
  (SELECT count(*) FROM affiliate_networks WHERE lower(name) = 'giftclick')      AS network_exists,
  (SELECT count(*) FROM offers            WHERE lower(name) = 'freecash (giftclick)') AS offer_exists,
  (SELECT count(*) FROM landing_pages     WHERE slug = 'freecash-us-f')          AS door_exists;


-- ─────────────────────────────────────────────────────────────────────────────
-- PART 2 — APPLY.
-- ─────────────────────────────────────────────────────────────────────────────
BEGIN;

-- 2a. The network. passthrough + everflow are load-bearing — see the header.
INSERT INTO affiliate_networks (name, type, status, subid_scheme, postback_key, notes)
SELECT 'GiftClick', 'everflow', 'active', 'passthrough',
       '5c8e489f5c148eccc5c04873344ead5a3add3384',
       'Everflow-shaped (giftclick.org/aff_c). Its own row rather than reusing Fluent so '
       'its postback key rotates independently. subid_scheme MUST stay passthrough: the '
       'default v3 writes s1..s5 and Everflow reads sub1..sub5 -> unmatched.'
 WHERE NOT EXISTS (SELECT 1 FROM affiliate_networks WHERE lower(name) = 'giftclick');

-- 2b. The offer. SEPARATE row — the shared Freecash offer is deliberately untouched.
--     enforce_assignment = true keeps it out of every affiliate's reach; this is
--     Migi's personal offer, not inventory.
INSERT INTO offers (name, status, network_id, destination_url, clickid_slot,
                    countries, category, enforce_assignment, notes)
SELECT 'Freecash (GiftClick)', 'active',
       (SELECT id FROM affiliate_networks WHERE lower(name) = 'giftclick'),
       'https://giftclick.org/aff_c?offer_id=3530&aff_id=20395',
       'sub2',
       '{US}', 'Mobile Apps', true,
       'Migi personal scaler traffic only. Deliberately a separate offer from Freecash '
       '(6d298639-...) so the 14 affiliates on Monetise are not repointed. clickid_slot '
       'sub2 mirrors Playful Rewards (already live on Everflow) and matches the Fluent '
       'postback template cid={sub2}.'
 WHERE NOT EXISTS (SELECT 1 FROM offers WHERE lower(name) = 'freecash (giftclick)');

-- 2c. The door. owner_user_id is what makes SubIDs PASS THROUGH: ?s1=MIGI1 reaches
--     the network verbatim as sub1=MIGI1, instead of being rewritten to a bare
--     affiliate id. self_serve=false keeps it off the self-serve picker.
INSERT INTO landing_pages (name, slug, offer_id, owner_user_id, geo, link, status,
                           self_serve, enforce_assignment, notes)
SELECT 'Freecash US — Migi (GiftClick)', 'freecash-us-f',
       (SELECT id FROM offers WHERE lower(name) = 'freecash (giftclick)'),
       '596cecce-4233-492c-b32e-e8510498a09b'::uuid,
       'us',
       'https://www.myrewardscorner.com/FCM-pre.html',
       'active', false, false,
       'Personal scaler door. Prelander FCM-pre.html -> FCM.html -> this door -> giftclick.'
 WHERE NOT EXISTS (SELECT 1 FROM landing_pages WHERE slug = 'freecash-us-f');

COMMIT;


-- ─────────────────────────────────────────────────────────────────────────────
-- PART 3 — VERIFY. Every assertion below must pass or the script raises.
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE n RECORD; o RECORD; d RECORD; untouched int;
BEGIN
  SELECT * INTO n FROM affiliate_networks WHERE lower(name) = 'giftclick';
  IF n IS NULL THEN RAISE EXCEPTION 'network GiftClick was not created'; END IF;
  IF n.subid_scheme IS DISTINCT FROM 'passthrough' THEN
    RAISE EXCEPTION 'subid_scheme is %, must be passthrough or every conversion lands unmatched', n.subid_scheme;
  END IF;
  IF n.type IS DISTINCT FROM 'everflow' THEN
    RAISE EXCEPTION 'type is %, must be everflow or there is no sub* namespace', n.type;
  END IF;

  SELECT * INTO o FROM offers WHERE lower(name) = 'freecash (giftclick)';
  IF o IS NULL THEN RAISE EXCEPTION 'offer was not created'; END IF;
  IF o.clickid_slot IS DISTINCT FROM 'sub2' THEN
    RAISE EXCEPTION 'clickid_slot is %, must be sub2 to match the postback cid={sub2}', o.clickid_slot;
  END IF;
  IF o.destination_url NOT LIKE '%giftclick.org%' THEN
    RAISE EXCEPTION 'offer destination is %, expected giftclick.org', o.destination_url;
  END IF;
  IF o.network_id IS DISTINCT FROM n.id THEN
    RAISE EXCEPTION 'offer is not on the GiftClick network';
  END IF;

  SELECT * INTO d FROM landing_pages WHERE slug = 'freecash-us-f';
  IF d IS NULL THEN RAISE EXCEPTION 'door freecash-us-f was not created'; END IF;
  IF d.owner_user_id IS NULL THEN
    RAISE EXCEPTION 'door has no owner_user_id — SubIDs would stamp as AFFILIATE, not passthrough';
  END IF;
  IF d.offer_id IS DISTINCT FROM o.id THEN
    RAISE EXCEPTION 'door points at the wrong offer';
  END IF;
  IF d.link NOT LIKE '%FCM-pre.html' THEN
    RAISE EXCEPTION 'door must point at the PRELANDER, got %', d.link;
  END IF;

  -- The whole reason this script exists: the shared Freecash offer is untouched.
  SELECT count(*) INTO untouched
    FROM landing_pages lp JOIN offers f ON f.id = lp.offer_id
   WHERE f.id = '6d298639-835d-450e-9442-6f4515bc2ce8'
     AND f.destination_url LIKE '%montrk3%';
  IF untouched < 10 THEN
    RAISE EXCEPTION 'expected the 10 Monetise Freecash doors to be untouched, found %', untouched;
  END IF;

  RAISE NOTICE 'OK  freecash-us-f -> % (offer %, network % / %)', d.link, o.name, n.name, n.subid_scheme;
  RAISE NOTICE 'OK  % Monetise Freecash doors untouched', untouched;
END $$;

-- Read-back.
SELECT lp.slug, lp.geo, o.name AS offer, o.clickid_slot,
       o.destination_url, n.name AS network, n.subid_scheme
  FROM landing_pages lp
  JOIN offers o             ON o.id = lp.offer_id
  JOIN affiliate_networks n ON n.id = o.network_id
 WHERE lp.slug = 'freecash-us-f';
