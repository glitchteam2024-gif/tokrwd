-- ============================================================================
-- freecash-us-f — owner scaler door for FREECASH (US)
-- Migi, 2026-08-13. Paste whole file into Supabase SQL editor. Safe to re-run.
-- ============================================================================
-- WHY A NEW DOOR AND NOT ONE OF THE EIGHT THAT ALREADY EXIST:
--
--   freecash          US, owner NULL  -> the AFFILIATE door. Resolves the owner
--                                        from the SPK and rewrites s1 to the bare
--                                        affiliate id. A scaler door must pass
--                                        MIGI1 through to the network VERBATIM,
--                                        so this one is the wrong shape.
--   freecash-ca       CA, owner Migi  -> right shape, wrong country.
--   freecash-*-ravi   Ravi's.
--
-- This row is the US sibling of freecash-ca, and the FreeCash twin of
-- playful-us-f. owner_user_id is what selects passthrough: with it set the door
-- stamps sub1=<the s1 you sent>; without it the door would stamp an affiliate id
-- and your own reporting would stop matching the network's.
-- ============================================================================

insert into landing_pages
  (name, offer_id, link, slug, capacity, status, geo,
   enforce_assignment, self_serve, owner_user_id)
values
  ('Freecash — owner scaler (US)',
   '6d298639-835d-450e-9442-6f4515bc2ce8',              -- offer: Freecash
   'https://www.myrewardscorner.com/FCM-pre.html',      -- the PRELANDER, not the lander
   'freecash-us-f',
   1,
   'active',
   'us',
   false,                                                -- no assignment gate: this is yours
   false,                                                -- not offerable to affiliates
   '596cecce-4233-492c-b32e-e8510498a09b')               -- owner = Migi -> subid passthrough
on conflict (slug) do update
  set offer_id      = excluded.offer_id,
      link          = excluded.link,
      geo           = excluded.geo,
      status        = excluded.status,
      owner_user_id = excluded.owner_user_id,
      self_serve    = excluded.self_serve;

-- ---------------------------------------------------------------------------
-- Guard rails. Each RAISE below is a way this row silently costs money, so the
-- script refuses to report success unless all of them hold.
-- ---------------------------------------------------------------------------
DO $$
DECLARE r record;
BEGIN
  SELECT * INTO r FROM landing_pages WHERE slug = 'freecash-us-f';

  IF r IS NULL THEN
    RAISE EXCEPTION 'freecash-us-f was not created';
  END IF;

  IF r.owner_user_id IS NULL THEN
    RAISE EXCEPTION 'freecash-us-f has no owner_user_id — subids would stamp as AFFILIATE, not passthrough';
  END IF;

  IF r.offer_id <> '6d298639-835d-450e-9442-6f4515bc2ce8'::uuid THEN
    RAISE EXCEPTION 'freecash-us-f is on the wrong offer: % — traffic would go to another advertiser', r.offer_id;
  END IF;

  IF r.link NOT LIKE '%FCM-pre.html' THEN
    RAISE EXCEPTION 'freecash-us-f must point at the PRELANDER (FCM-pre.html), got %', r.link;
  END IF;

  IF r.geo IS DISTINCT FROM 'us' THEN
    RAISE EXCEPTION 'freecash-us-f geo is %, expected us', r.geo;
  END IF;

  RAISE NOTICE 'OK  freecash-us-f -> % (owner %, geo %, status %)', r.link, r.owner_user_id, r.geo, r.status;
END $$;

-- ---------------------------------------------------------------------------
-- Read-back: the new door beside the Playful one, so you can see they are on
-- DIFFERENT offers. If offer_id matches between the two rows, stop — the whole
-- point of this file is that they must not.
-- ---------------------------------------------------------------------------
SELECT lp.slug, o.name AS offer, lp.geo, lp.status,
       (lp.owner_user_id IS NOT NULL) AS passthrough, lp.link
  FROM landing_pages lp
  JOIN offers o ON o.id = lp.offer_id
 WHERE lp.slug IN ('freecash-us-f', 'playful-us-f')
 ORDER BY lp.slug;
