-- =====================================================================================
-- Register SCALED* as owner SubID labels                            2026-08-13
-- =====================================================================================
-- SYMPTOM: giftclick's "Traffic sources" showed 27 clicks, ALL under "No source", so
-- per-creative performance was unreadable — SCALED5 vs SCALED6 vs SCALED7 were
-- indistinguishable.
--
-- ROOT CAUSE: there are TWO registries and they are not the same thing.
--   · spark_codes        — SCALED5/6/7 ARE here, active, owned by Migi. This is what
--                          the door resolves ownership from, which is why the clicks
--                          table correctly recorded spk_code=SCALED6.
--   · owner_subid_labels — SCALED5/6/7 are NOT here. On an OWNER-MODE door (one with
--                          landing_pages.owner_user_id set, which freecash-us-f is),
--                          api/link/[slug].js:644 does:
--
--                              const slot1 = isRegisteredLabel(spk, ownerLabels)
--                                              ? spk : OWNER_SLOT1_WITHHELD;
--
--                          An unregistered label is REPLACED with the literal
--                          '~SPRK_LABEL_WITHHELD~'. The door's own comment: "an honest
--                          label he forgot to INSERT ... gets the withheld placeholder.
--                          That is the safe direction."
--
-- So every SCALED click reached giftclick as sub1=~SPRK_LABEL_WITHHELD~. MIGI1/MIGI2
-- were unaffected because they ARE in owner_subid_labels — which is exactly why the
-- two behaved differently on the same door, at the same instant.
--
-- This is NOT a code bug. The door is doing the right, fail-safe thing: it refuses to
-- forward a slot-1 label it cannot prove the owner reserved, because a forwarded
-- unverified label is how a conversion gets mis-attributed. The fix is to register the
-- labels, never to loosen the check.
--
-- SCOPE: registers SCALED1..SCALED20, not just the three in use. The table already
-- holds MG1..MG10 and MIGI1..MIGI15 pre-registered for exactly this reason — so a new
-- creative can be launched without a DB round-trip. Registering only 5/6/7 would
-- reproduce this outage the moment SCALED8 goes live.
--
-- AFTER RUNNING: the door caches this registry for 5 MINUTES per warm instance
-- (LABELS_TTL_MS in api/_lib/owner-labels.js), so allow up to 5 minutes before new
-- labels ride. Verify with the curl in PART 3's comment.
--
-- Idempotent. Safe to re-run.
-- =====================================================================================


-- ─────────────────────────────────────────────────────────────────────────────
-- PART 1 — PREVIEW. What is registered now vs what is in use.
-- ─────────────────────────────────────────────────────────────────────────────
SELECT c.code,
       CASE WHEN l.label IS NULL
            THEN '*** NOT REGISTERED -> rides as ~SPRK_LABEL_WITHHELD~ ***'
            ELSE 'registered' END AS owner_label_status
  FROM (VALUES ('SCALED5'),('SCALED6'),('SCALED7'),('MIGI1'),('MIGI2')) AS c(code)
  LEFT JOIN owner_subid_labels l
         ON upper(l.label) = upper(c.code)
        AND l.user_id = '596cecce-4233-492c-b32e-e8510498a09b'::uuid
 ORDER BY c.code;


-- ─────────────────────────────────────────────────────────────────────────────
-- PART 2 — APPLY. SCALED1..SCALED20 for Migi.
-- ─────────────────────────────────────────────────────────────────────────────
BEGIN;

INSERT INTO owner_subid_labels (label, user_id)
SELECT 'SCALED' || g, '596cecce-4233-492c-b32e-e8510498a09b'::uuid
  FROM generate_series(1, 20) AS g
 WHERE NOT EXISTS (
   SELECT 1 FROM owner_subid_labels x
    WHERE upper(x.label) = upper('SCALED' || g)
 );

COMMIT;


-- ─────────────────────────────────────────────────────────────────────────────
-- PART 3 — VERIFY.
--
-- Then, after up to 5 minutes (the door's label cache TTL), confirm on the wire:
--   curl -s -o /dev/null -w '%{redirect_url}\n' \
--     "https://sprktrax.org/api/link/freecash-us-f?s1=SCALED6"
-- Expect  ...&sub1=SCALED6...   NOT  ...&sub1=~SPRK_LABEL_WITHHELD~...
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE missing text; n int; owned int;
BEGIN
  SELECT string_agg('SCALED' || g, ', ' ORDER BY g) INTO missing
    FROM generate_series(1, 20) AS g
   WHERE NOT EXISTS (SELECT 1 FROM owner_subid_labels x
                      WHERE upper(x.label) = upper('SCALED' || g));
  IF missing IS NOT NULL THEN
    RAISE EXCEPTION 'still unregistered: %', missing;
  END IF;

  SELECT count(*) INTO n FROM owner_subid_labels WHERE label ILIKE 'SCALED%';
  SELECT count(*) INTO owned FROM owner_subid_labels
   WHERE label ILIKE 'SCALED%' AND user_id = '596cecce-4233-492c-b32e-e8510498a09b'::uuid;
  IF n <> owned THEN
    RAISE EXCEPTION 'a SCALED* label belongs to someone else (% of % are Migi''s) — investigate before use', owned, n;
  END IF;

  RAISE NOTICE 'OK  % SCALED labels registered, all to Migi. Allow up to 5 min for the door cache.', n;
END $$;

-- Read-back: the three in use must all say "registered".
SELECT c.code,
       CASE WHEN l.label IS NULL THEN '*** STILL WITHHELD ***' ELSE 'registered' END AS status
  FROM (VALUES ('SCALED5'),('SCALED6'),('SCALED7')) AS c(code)
  LEFT JOIN owner_subid_labels l ON upper(l.label) = upper(c.code)
 ORDER BY c.code;
