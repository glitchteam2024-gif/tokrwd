-- 2026-08-12 — Playful Rewards, the OWNER's own scaler page (/PlayfulM.html).
--
-- Migi 2026-08-12: "this is a individual no affiliate and nothing" — his own traffic, his own
-- spend, his own tracking code. So this is the SCALER shape, not the affiliate shape.
--
--   TikTok ad
--     -> https://www.tokrwd.co/PlayfulM-pre.html    the prelander: in-app webview -> Safari
--     -> https://www.tokrwd.co/PlayfulM.html        the lander (age gate -> offers -> CTA)
--     -> https://sprktrax.org/api/link/playful-us-f the door: mints click_id, stamps subids, 302
--     -> fkn8s74mztrk.com/F2R45HNR/...              the network, chosen by destination_by_geo
--
-- ── WHY owner_user_id IS SET, AND WHAT IT CHANGES ───────────────────────────────────────────
-- Setting owner_user_id forces stampScheme = 'passthrough' in stampAffiliateSubids
-- (SPRKNetworkAds api/_lib/tracking.js):
--
--     if (passthrough) { if (spk) out[K(1)] = spk; return out; }   // the code rides s1 VERBATIM
--
-- So the network sees HIS OWN code in s1 — no affiliate id, no offer name, no <name>.<token>
-- composition. That is deliberately DIFFERENT from the SPK-locked affiliate path used by the
-- house rows playful-us/gb/ca/au, which stamp s1=<bare aff id>, s2=<SPK>, s4=<offer>, s5=<...>.
-- Mirrors the existing applecash-us-f / applepay750-us-f rows on the same account.
--
-- ⚠️ The code in ?s1= must be REGISTERED to this account first. An owner-bound lander refuses to
--    stamp an unregistered label and the network receives sub1=~SPRK_LABEL_WITHHELD~ instead.
--    Mint it in the app (Creative Hub) BEFORE spending; the verify block at the bottom checks it.
--
-- ── GEO ─────────────────────────────────────────────────────────────────────────────────────
-- Shipped as geo='us' to match the slug and the existing -f slices, and because an explicit geo
-- closes the geo-shopping hole (a visitor on a VPN cannot pick a different country's payout).
--
-- This page quotes NO currency and NO amount, so it is safe to run geo-agnostic instead. To let
-- ONE page serve all six geos the offer carries (US/GB/CA/AU/DE/FR), set geo to NULL — the door
-- then falls back to x-vercel-ip-country and picks destination_by_geo from the visitor's own IP
-- (api/link/[slug].js:347-361). One line, reversible:
--
--     UPDATE landing_pages SET geo = NULL WHERE slug = 'playful-us-f';
--
-- ── NO ON CONFLICT ──────────────────────────────────────────────────────────────────────────
-- landing_pages' unique index is PARTIAL and on an EXPRESSION
-- (lower(slug) WHERE slug IS NOT NULL AND status <> 'archived'), so ON CONFLICT cannot name an
-- arbiter here. Guarded with WHERE NOT EXISTS instead — same idempotency, no error.
-- Re-running this file is safe.

-- ── 1. The landing page row ─────────────────────────────────────────────────────────────────
-- link = the PRELANDER url, not the lander: landing_pages.link is what the app hands out as the
-- destination, and the visitor must hit the breakout page first or the in-app webview never
-- escapes to Safari.
-- capacity 1 + self_serve false: this is a private page, never offered to another affiliate.
INSERT INTO landing_pages
  (name, offer_id, link, slug, capacity, geo, status, owner_user_id, self_serve, notes)
SELECT
  'Playful Rewards — owner scaler (US)',
  'eaf3fdda-1474-4c9a-adb6-516247e3fca8'::uuid,
  'https://www.tokrwd.co/PlayfulM-pre.html',
  'playful-us-f',
  1,
  'us',
  'active',
  '596cecce-4233-492c-b32e-e8510498a09b'::uuid,   -- miguelamaya8085@gmail.com (the scaler account)
  false,
  'Owner scaler page. /PlayfulM-pre.html -> /PlayfulM.html -> door playful-us-f. Passthrough subids.'
WHERE NOT EXISTS (
  SELECT 1 FROM landing_pages lp WHERE lower(lp.slug) = 'playful-us-f'
);

-- ── 2. Sanity: the row exists, is owner-bound, and points at the PRELANDER ───────────────────
DO $$
DECLARE r record;
BEGIN
  SELECT slug, owner_user_id, link, offer_id, status INTO r
    FROM landing_pages WHERE lower(slug) = 'playful-us-f';

  IF r IS NULL THEN
    RAISE EXCEPTION 'playful-us-f was not created';
  END IF;
  IF r.owner_user_id IS NULL THEN
    RAISE EXCEPTION 'playful-us-f has no owner_user_id — subids would stamp as AFFILIATE, not passthrough';
  END IF;
  IF r.link NOT LIKE '%PlayfulM-pre.html' THEN
    RAISE EXCEPTION 'playful-us-f must point at the PRELANDER, got %', r.link;
  END IF;
  IF r.offer_id <> 'eaf3fdda-1474-4c9a-adb6-516247e3fca8'::uuid THEN
    RAISE EXCEPTION 'playful-us-f is on the wrong offer: %', r.offer_id;
  END IF;
  RAISE NOTICE 'OK  playful-us-f -> % (owner %, status %)', r.link, r.owner_user_id, r.status;
END $$;

-- ── 3. Read-back: does this account hold a registered code to put in ?s1= ? ──────────────────
-- If this returns ZERO rows, mint one in the app first — otherwise every click stamps
-- sub1=~SPRK_LABEL_WITHHELD~ and the network cannot tell the traffic apart.
SELECT sc.spk_code, sc.status, sc.created_at
  FROM spark_codes sc
 WHERE sc.user_id = '596cecce-4233-492c-b32e-e8510498a09b'::uuid
   AND (sc.status IS NULL OR sc.status <> 'deleted')
 ORDER BY sc.created_at DESC
 LIMIT 10;
