-- =====================================================================================
-- URGENT — hide the GiftClick offer from affiliates                 2026-08-13
-- =====================================================================================
-- Fixes two defects introduced by 2026-08-13_freecash_giftclick_scaler_door.sql.
--
-- DEFECT 1 — THE OFFER WAS PUBLIC.
--   That script set enforce_assignment=true believing it made the offer private.
--   It does not. api/offers.js:482 hides an offer from non-admins ONLY when
--   cap_mode='allocated':
--       visible = visible.filter(o => o.cap_mode !== 'allocated' || assigned.has(...))
--   cap_mode defaulted to 'fcfs', and the comment above that line is explicit —
--   "cap_mode undefined → treated as non-private → visible". So every affiliate
--   could see it in the browse list and via ?id=. Testerup is the reference
--   private offer and uses 'allocated'.
--
-- DEFECT 2 — THE NAME LEAKED THE NETWORK.
--   The offer was called 'Freecash (GiftClick)'. Money-integrity rule #9: affiliates
--   must never learn which network an offer belongs to. publicShape() deliberately
--   strips network_id from every affiliate response — putting the network in the
--   NAME walks straight around that. The name IS in publicShape.
--
-- Idempotent. Safe to re-run.
-- =====================================================================================


-- ─────────────────────────────────────────────────────────────────────────────
-- PART 1 — PREVIEW. What an affiliate can see right now.
-- ─────────────────────────────────────────────────────────────────────────────
SELECT id, name, status, cap_mode,
       CASE WHEN cap_mode = 'allocated' THEN 'hidden from unassigned'
            ELSE '*** VISIBLE TO EVERY AFFILIATE ***' END AS exposure,
       CASE WHEN name ILIKE '%giftclick%' THEN '*** NETWORK NAME LEAKS ***'
            ELSE 'name is clean' END AS name_check
  FROM offers
 WHERE destination_url ILIKE '%giftclick%';


-- ─────────────────────────────────────────────────────────────────────────────
-- PART 2 — APPLY.
-- ─────────────────────────────────────────────────────────────────────────────
BEGIN;

UPDATE offers
   SET cap_mode = 'allocated',          -- the ONLY thing api/offers.js treats as private
       name     = 'Freecash US — M',    -- no network name; still obvious to an admin
       notes    = coalesce(notes || ' | ', '')
                  || 'PRIVATE: cap_mode=allocated is what hides this from affiliates '
                     '(api/offers.js:482) — enforce_assignment does NOT. Name must never '
                     'contain the network (money-integrity rule #9): publicShape strips '
                     'network_id but returns name. Migi personal traffic only.'
 WHERE destination_url ILIKE '%giftclick%';

COMMIT;


-- ─────────────────────────────────────────────────────────────────────────────
-- PART 3 — VERIFY. Raises if the offer is still reachable or still leaks.
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE o RECORD; assigned_count int; monetise_doors int;
BEGIN
  SELECT * INTO o FROM offers WHERE destination_url ILIKE '%giftclick%';
  IF o IS NULL THEN RAISE EXCEPTION 'giftclick offer not found'; END IF;

  IF o.cap_mode IS DISTINCT FROM 'allocated' THEN
    RAISE EXCEPTION 'cap_mode is %, must be allocated or affiliates still see it', o.cap_mode;
  END IF;
  IF o.name ILIKE '%giftclick%' THEN
    RAISE EXCEPTION 'offer name still leaks the network: %', o.name;
  END IF;

  -- An 'allocated' offer is visible only to affiliates with an ACTIVE assignment.
  -- Nobody should hold one.
  SELECT count(*) INTO assigned_count
    FROM offer_assignments WHERE offer_id = o.id AND status = 'active';
  IF assigned_count > 0 THEN
    RAISE EXCEPTION 'DID NOT EXPECT % active assignment(s) on this private offer', assigned_count;
  END IF;

  -- And the shared Freecash offer is still on Monetise, as before.
  SELECT count(*) INTO monetise_doors
    FROM landing_pages lp JOIN offers f ON f.id = lp.offer_id
   WHERE f.id = '6d298639-835d-450e-9442-6f4515bc2ce8'
     AND f.destination_url LIKE '%montrk3%';
  IF monetise_doors < 10 THEN
    RAISE EXCEPTION 'expected 10 Monetise Freecash doors untouched, found %', monetise_doors;
  END IF;

  RAISE NOTICE 'OK  "%" is cap_mode=allocated, 0 assignments -> no affiliate can see it', o.name;
  RAISE NOTICE 'OK  % Monetise Freecash doors untouched', monetise_doors;
END $$;

-- Read-back: exposure must say "hidden", name_check must say "clean".
SELECT name, status, cap_mode,
       CASE WHEN cap_mode = 'allocated' THEN 'hidden from unassigned' ELSE '*** STILL VISIBLE ***' END AS exposure,
       CASE WHEN name ILIKE '%giftclick%' THEN '*** STILL LEAKS ***' ELSE 'name is clean' END AS name_check,
       (SELECT count(*) FROM offer_assignments a WHERE a.offer_id = offers.id AND a.status='active') AS active_assignments
  FROM offers
 WHERE destination_url ILIKE '%giftclick%';
