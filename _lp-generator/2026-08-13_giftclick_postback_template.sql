-- =====================================================================================
-- GiftClick — record the postback template on the network row       2026-08-13
-- =====================================================================================
-- Cosmetic/documentation only: it does NOT change how api/postback.js parses anything.
-- postback.js reads the query params directly (q.cid, q.s1..q.s5, q.sub1..q.sub5), so
-- the endpoint already works the moment giftclick starts firing. Storing the template
-- keeps the GiftClick row consistent with Fluent, so whoever looks next sees the exact
-- macro set that was configured rather than having to reconstruct it.
--
-- The template is byte-identical to Fluent's, which is the proven-working Everflow
-- postback in this system.
--
-- WHY ALL FIVE SLOTS AND NOT JUST cid
-- ---------------------------------------------------------------------------
-- cid={sub2} is the canonical path: sub2 is this offer's clickid_slot, so that is where
-- the token should be. But giftclick was observed REMAPPING sub slots on its forward to
-- freecash.com (we sent sub1=MIGI1&sub2=<token>; freecash received sub1=20395, sub2=
-- EMPTY, and the token in sub4). If its postback macros are remapped the same way, cid
-- alone would arrive blank.
--
-- postback.js survives that: line 295 reads each slot as (q.sN || q.subN), and line 513
-- feeds slots 2-5 into slotTokenCandidates(), which recovers the click token from
-- whichever slot actually holds it. Sending all five turns a silent total loss into a
-- recovery. Costs nothing when cid is correct.
-- =====================================================================================

-- PART 1 — PREVIEW
SELECT name, type, subid_scheme, coalesce(postback_template, '(none set)') AS current_template
  FROM affiliate_networks
 WHERE lower(name) IN ('giftclick', 'fluent')
 ORDER BY name;

-- PART 2 — APPLY
BEGIN;

UPDATE affiliate_networks
   SET postback_template = '&s1={sub1}&s2={sub2}&s3={sub3}&s4={sub4}&s5={sub5}'
                           '&cid={sub2}&payout={payout}&txid={transaction_id}'
 WHERE lower(name) = 'giftclick';

COMMIT;

-- PART 3 — VERIFY
DO $$
DECLARE g text; f text;
BEGIN
  SELECT postback_template INTO g FROM affiliate_networks WHERE lower(name) = 'giftclick';
  SELECT postback_template INTO f FROM affiliate_networks WHERE lower(name) = 'fluent' AND type = 'everflow';

  IF g IS NULL THEN RAISE EXCEPTION 'GiftClick template was not set'; END IF;
  IF g IS DISTINCT FROM f THEN
    RAISE EXCEPTION 'GiftClick template does not match the proven Everflow one.%  giftclick: %%  fluent:    %',
                    chr(10), g, chr(10) || '  ', f;
  END IF;
  IF g NOT LIKE '%{sub4}%' THEN
    RAISE EXCEPTION 'template is missing the slot-4 fallback — a remapped token would be lost';
  END IF;

  RAISE NOTICE 'OK  GiftClick postback template matches Fluent exactly';
END $$;

SELECT name, type, subid_scheme, postback_template
  FROM affiliate_networks
 WHERE lower(name) IN ('giftclick', 'fluent')
 ORDER BY name;
