/**
 * Every generator in this folder is QUARANTINED as of 2026-08-20.
 *
 * They all predate the s1-only rule and none of them has been rewired. Running one today does
 * three separate kinds of damage, and all three are silent — the generator prints success:
 *
 *   1. IT PUTS THE DOOR BACK. They emit `https://sprktrax.org/api/link/<slug>` as the CTA
 *      destination. The deployed landers go straight to the network; regenerating overwrites a
 *      live network URL with a hop that is no longer part of the funnel.
 *   2. IT PUTS THE WHOLE QUERY BACK. The wiring they emit forwards s2/s3/s4/s5/ttclid/lg/campid
 *      and mints an s5 token. The rule is one parameter: the affiliate code, named for the
 *      destination's dialect (sub1 for Everflow-family, s1 for CAKE/Monetise).
 *   3. IT UN-RETIRES DEAD LANDERS. `49c065b` retired 619 landers whose offer no longer exists.
 *      The generators still list those brands, so they recreate every one of them.
 *
 * They also cannot be fixed by editing the template alone: the destination each page must point
 * at is NOT in this folder. `build.js` knows only a `doorSlug`; the real network URL per brand and
 * geo lives in the deployed pages (`window.__OFFER_LINK__`) and in the offer rows. Reviving a
 * generator means giving it that table first.
 *
 * To run one anyway — knowing the above — set SPRK_ALLOW_DOOR_REGEN=1.
 */
'use strict';

module.exports = function quarantine(name) {
  if (process.env.SPRK_ALLOW_DOOR_REGEN === '1') {
    console.warn(`\n  ⚠️  ${name}: quarantine bypassed (SPRK_ALLOW_DOOR_REGEN=1).`);
    console.warn('     This emits the sprktrax door and forwards the whole query. Check the diff.\n');
    return;
  }
  console.error(`
  ${name} is quarantined — refusing to run.

  It would repaint landers with the retired sprktrax door, forward every param instead of
  just the affiliate code, and recreate the 619 landers retired in 49c065b.

  Before reviving it, it needs the per-brand/geo NETWORK URL it is supposed to emit — that
  table is not in _lp-generator/. See _lp-generator/_guard.js for the full reason.

  To override deliberately:  SPRK_ALLOW_DOOR_REGEN=1 node _lp-generator/${name}
`);
  process.exit(1);
};
