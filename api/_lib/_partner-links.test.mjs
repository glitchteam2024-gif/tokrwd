// Guards PARTNER_LINKS and the per-code destination swap. Run after editing either:
//   node "api/_lib/_partner-links.test.mjs"
//
// Two failures here cost real money and are silent in production:
//   - two people issued the same code: one person's paid clicks pay the other, and
//     every dashboard looks normal until the invoices disagree;
//   - a code that cannot be matched (wrong case, a compound campid that collapses
//     on the way in): the click falls back to the house destination and the partner
//     is simply never paid for traffic they sent.
//
// This file is in _tracking-audit's SKIP_FILES: its fixtures are, by definition,
// third-party network URLs.
import {
  PARTNER_LINKS,
  OFFER_LINKS,
  DEFAULT_LANDER_ORIGIN,
  getConfiguredOfferLink,
  isSafePartnerDestination,
  offerLinkFor,
  partnerFor,
  partnerKey,
  partnerLinkProblems,
  partnerSlugFor,
  carrdHostsForLander,
  traceOfferChain,
  hopUrl,
} from './links-config.js';
import { committedRows, sanitizePartnerRow } from './partner-store.js';

let pass = 0, fail = 0;
const eq = (name, got, want) => {
  const g = JSON.stringify(got), w = JSON.stringify(want);
  const ok = g === w;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}`);
  if (!ok) { console.log(`   got:  ${g}`); console.log(`   want: ${w}`); fail++; } else pass++;
};

// ── the live table ───────────────────────────────────────────────────────────
eq(`PARTNER_LINKS is valid (${PARTNER_LINKS.length} row(s))`, partnerLinkProblems(), []);
eq('every row binds a lander that fires a /c/ slug',
  PARTNER_LINKS.filter(p => !partnerSlugFor(p.lander)), []);

// ── partnerKey: ONE normaliser, used on write, on read, and outbound ─────────
// If these three ever disagree the click routes to one person while the sub-ID
// stamped on the outbound URL names another.
eq('partnerKey upper-cases a canonical spark code', partnerKey('spk-a1b2-c3d4'), 'SPK-A1B2-C3D4');
eq('partnerKey pulls an embedded SPK out of a compound campid',
  partnerKey('ACCT_SPK-A1B2-C3D4_US'), 'SPK-A1B2-C3D4');
eq('partnerKey leaves a custom scaler code intact', partnerKey('EDWIN-01'), 'EDWIN-01');
eq('partnerKey upper-cases a custom code', partnerKey('edwin-01'), 'EDWIN-01');
eq('partnerKey on empty is empty', partnerKey(''), '');

// ── the validator catches what is silent at runtime ──────────────────────────
const base = {
  key: 'x', owner: 'X', carrd: 'x.carrd.co', lander: 'esgp',
  code: 'XCODE-01', destination: 'https://www.phef6trk.com/AAA/BBB/', forwardParam: 'sub1',
};
const problemsFor = (rows) => partnerLinkProblems(rows).length > 0;

eq('a clean fixture row passes', partnerLinkProblems([base]), []);
eq('a code that does not round-trip is refused',
  problemsFor([{ ...base, code: 'ACCT_SPK-A1B2-C3D4_US' }]), true);
eq('…and the refusal names the code to register instead',
  partnerLinkProblems([{ ...base, code: 'ACCT_SPK-A1B2-C3D4_US' }])
    .some(p => p.includes('SPK-A1B2-C3D4')), true);
eq('a duplicate (lander, code) across two rows is reported',
  problemsFor([base, { ...base, key: 'y', carrd: 'y.carrd.co' }]), true);
eq('a duplicate Carrd host across two rows is reported',
  problemsFor([base, { ...base, key: 'y', code: 'YCODE-01' }]), true);
eq('a duplicate row key is reported',
  problemsFor([base, { ...base, carrd: 'y.carrd.co', code: 'YCODE-01' }]), true);
eq('a missing owner is reported', problemsFor([{ ...base, owner: '' }]), true);
eq('an unknown lander is reported', problemsFor([{ ...base, lander: 'nope' }]), true);
eq('a door-routed lander cannot take a partner destination',
  problemsFor([{ ...base, lander: 'https://www.tokrwd.co/CLFC', carrd: 'z.carrd.co' }]), true);
eq('a non-https destination is reported',
  problemsFor([{ ...base, destination: 'http://www.phef6trk.com/A/B/' }]), true);
eq('a bad hostname is reported', problemsFor([{ ...base, carrd: 'not a host' }]), true);
eq('a bad forwardParam is reported', problemsFor([{ ...base, forwardParam: 'a b' }]), true);
eq('an upper-case row key is reported', problemsFor([{ ...base, key: 'Edwin' }]), true);

// ── the destination gate ─────────────────────────────────────────────────────
// /c/:slug 302s to this value, so everything below is the difference between "our
// redirector" and "anyone's".
eq('a real tracker URL is accepted',
  isSafePartnerDestination('https://www.phef6trk.com/213T8QJ/32BB7QT/'), true);
eq('a tracker URL with a query is accepted',
  isSafePartnerDestination('https://montrk.co.uk/?a=26648&c=56132'), true);
eq('userinfo in the authority is rejected',
  isSafePartnerDestination('https://www.phef6trk.com@evil.com/x'), false);
eq('http is rejected', isSafePartnerDestination('http://www.phef6trk.com/x'), false);
eq('javascript: is rejected', isSafePartnerDestination('javascript:alert(1)'), false);
eq('a punycode label is rejected', isSafePartnerDestination('https://xn--80ak6aa92e.com/x'), false);
eq('an IPv4 literal is rejected', isSafePartnerDestination('https://169.254.169.254/latest/meta-data/'), false);
eq('a decimal IPv4 literal is rejected', isSafePartnerDestination('https://2130706433/'), false);
eq('an IPv6 literal is rejected', isSafePartnerDestination('https://[::1]/'), false);
eq('an explicit port is rejected', isSafePartnerDestination('https://www.phef6trk.com:8443/x'), false);
eq('localhost is rejected', isSafePartnerDestination('https://localhost/x'), false);
eq('a control character is rejected',
  isSafePartnerDestination('https://www.phef6trk.com/x\r\nHost: evil.com'), false);
eq('a whitespace character is rejected', isSafePartnerDestination('https://www.phef6trk.com/a b'), false);
eq('an over-long URL is rejected',
  isSafePartnerDestination('https://www.phef6trk.com/' + 'a'.repeat(500)), false);
eq('empty is rejected', isSafePartnerDestination(''), false);
// A destination pointing back into our own funnel loops: /c/ -> /c/ burns a lambda
// per hop, and a lander re-enters the door and double-counts the click.
eq('our own lander origin is rejected',
  isSafePartnerDestination(`${DEFAULT_LANDER_ORIGIN}/c/esgp-off`), false);
eq('the door is rejected', isSafePartnerDestination('https://sprktrax.org/api/link/gravypass'), false);
eq('our alias domain is rejected', isSafePartnerDestination('https://appflowconnect.com/c/x'), false);

// ── slug scoping: a code only speaks for the slug ITS lander fires ────────────
const ESGP_SLUG = partnerSlugFor('esgp');
eq('the ESGP lander fires /c/esgp-off', ESGP_SLUG, 'esgp-off');

eq("Edwin's code resolves on his own slug", (partnerFor(ESGP_SLUG, 'EDWIN-01') || {}).key, 'edwin');
eq('…case-insensitively', (partnerFor(ESGP_SLUG, 'edwin-01') || {}).key, 'edwin');
eq('…and the second partner on the same lander resolves to themselves',
  (partnerFor(ESGP_SLUG, 'FUOMGI-01') || {}).key, 'fuomgi');
// The scoping rule: without it, /c/frrcsh-us-off?campid=EDWIN-01 would aim house
// traffic at Edwin's affiliate link.
eq("a partner code on somebody else's slug resolves to nobody",
  partnerFor('frrcsh-us-off', 'EDWIN-01'), null);
eq('an unknown code resolves to nobody', partnerFor(ESGP_SLUG, 'NOT-A-CODE-99'), null);
eq('an empty code resolves to nobody', partnerFor(ESGP_SLUG, ''), null);
eq('an empty slug resolves to nobody', partnerFor('', 'EDWIN-01'), null);

// The lookup is a Map, never a plain object: this exact shape has already produced
// a bug twice in links-config.js (OFFER_KEY_MAP, and campaigns in resolveLander).
eq('?campid=__proto__ resolves to nobody', partnerFor(ESGP_SLUG, '__proto__'), null);
eq('?campid=constructor resolves to nobody', partnerFor(ESGP_SLUG, 'constructor'), null);
eq('?campid=hasOwnProperty resolves to nobody', partnerFor(ESGP_SLUG, 'hasOwnProperty'), null);

// Relaunch children: SPRK mints SPK-A1B2-C3D4-7 as a child of SPK-A1B2-C3D4, and
// they are different strings. A general prefix match would let one partner inherit
// another's traffic, so the fallback is deliberately narrow.
const spkRows = [{ ...base, key: 'spk', carrd: 's.carrd.co', code: 'SPK-A1B2-C3D4' }];
eq('a relaunch child inherits its parent row',
  (partnerFor(ESGP_SLUG, 'SPK-A1B2-C3D4-7', spkRows) || {}).key, 'spk');
eq('…but an unrelated longer code does NOT',
  partnerFor(ESGP_SLUG, 'SPK-A1B2-C3D4X', spkRows), null);
eq('…and a custom code with a numeric suffix does not prefix-match',
  partnerFor(ESGP_SLUG, 'EDWIN-01-2'), null);

// ── offerLinkFor: the committed row unless a partner claims the code ──────────
eq('offerLinkFor with no code equals the committed row for every slug',
  OFFER_LINKS.filter(l => l.enabled !== false)
    .filter(l => JSON.stringify(offerLinkFor(l.slug, '')) !== JSON.stringify(getConfiguredOfferLink(l.slug))),
  []);
eq('offerLinkFor with an unknown code equals the committed row',
  JSON.stringify(offerLinkFor('esgp-off', 'NOBODY-99')),
  JSON.stringify(getConfiguredOfferLink('esgp-off')));
eq('offerLinkFor on an unknown slug is undefined', offerLinkFor('nope', 'EDWIN-01'), undefined);

const partnerLink = offerLinkFor('esgp-off', 'FUOMGI-01');
eq('offerLinkFor names the partner that claimed the code', partnerLink.partner, 'fuomgi');
eq('…and keeps the slug it was asked about', partnerLink.slug, 'esgp-off');
eq('…and stays direct mode', partnerLink.mode, 'direct');

// A door-routed slug is NEVER partner-influenced: those attribute inside SPRK at
// the door, which owns the destination.
const doorRows = [{ ...base, key: 'd', carrd: 'd.carrd.co', code: 'DOOR-01' }];
eq('a door-mode slug ignores every code',
  JSON.stringify(offerLinkFor('freecash', 'DOOR-01', doorRows)),
  JSON.stringify(getConfiguredOfferLink('freecash')));
eq('…and a house slug ignores a partner code',
  offerLinkFor('frrcsh-us-off', 'EDWIN-01').destination,
  getConfiguredOfferLink('frrcsh-us-off').destination);

// ── an overlay row routes exactly like a committed one ───────────────────────
const overlay = [
  ...committedRows(),
  { key: 'ov', owner: 'Overlay', carrd: 'ov.carrd.co', lander: 'esgp',
    code: 'OVERLAY-01', destination: 'https://www.phef6trk.com/OVER/LAY/', forwardParam: 'sub1' },
];
eq('an overlay row claims its own code',
  offerLinkFor('esgp-off', 'OVERLAY-01', overlay).destination,
  'https://www.phef6trk.com/OVER/LAY/');
eq('…and does not disturb a committed row',
  offerLinkFor('esgp-off', 'EDWIN-01', overlay).partner, 'edwin');
eq('…and is invisible to a lookup that does not pass it',
  partnerFor(ESGP_SLUG, 'OVERLAY-01'), null);

// ── the reverse lookup the handover link is built from ───────────────────────
// Unscoped this returns every page on the lander; the panel would then hand one
// person a link on somebody else's Carrd page — which, under per-code routing,
// WORKS, so nobody would notice.
eq('scoping to a partner narrows the lander to their page',
  carrdHostsForLander(`${DEFAULT_LANDER_ORIGIN}/ESGP`, 'edwin'), ['laboedomegan.carrd.co']);
eq('…and the other partner gets theirs',
  carrdHostsForLander(`${DEFAULT_LANDER_ORIGIN}/ESGP`, 'fuomgi'), ['fuomgihatetiktok.carrd.co']);
eq('unscoped, a shared lander returns both pages',
  carrdHostsForLander(`${DEFAULT_LANDER_ORIGIN}/ESGP`).length >= 2, true);
eq('an overlay page is found once the overlay is passed',
  carrdHostsForLander(`${DEFAULT_LANDER_ORIGIN}/ESGP`, 'ov', overlay), ['ov.carrd.co']);

// ── what the admin panel promises a partner ──────────────────────────────────
// traceOfferChain must resolve the destination the SAME way /c/ does, or the panel
// shows the house link to someone whose clicks go somewhere else.
const chainOverlay = traceOfferChain(`${DEFAULT_LANDER_ORIGIN}/ESGP`, 'OVERLAY-01', { partners: overlay });
eq('the traced chain completes for an overlay partner', chainOverlay.ok, true);
eq('…names the partner', chainOverlay.partner, 'ov');
eq('…and the final hop is THEIR link, with their sub-ID',
  hopUrl(chainOverlay, 'Their network'),
  'https://www.phef6trk.com/OVER/LAY/?sub1=OVERLAY-01');

const chainHouse = traceOfferChain(`${DEFAULT_LANDER_ORIGIN}/ESGP`, 'NOBODY-99');
eq('an unclaimed code traces to the committed destination',
  hopUrl(chainHouse, 'Their network'),
  `${getConfiguredOfferLink('esgp-off').destination}?sub1=NOBODY-99`);
eq('…and names no partner', chainHouse.partner, '');

// ── sanitize(): the only thing between a poisoned store row and a live 302 ────
// Write-side validation protects nothing here — the lambda that saved the row is a
// different process from the one serving the click.
const good = sanitizePartnerRow({
  key: 'ok', owner: 'Someone', carrd: 'WWW.Ok.carrd.co', lander: 'esgp',
  code: 'ok-01', destination: 'https://www.phef6trk.com/O/K/', forwardParam: 'sub2',
});
eq('sanitize normalises the host and the code',
  [good.carrd, good.code], ['ok.carrd.co', 'OK-01']);
eq('sanitize marks the row as store-sourced', good.origin, 'store');
// Fields are whitelisted, never spread: an injected mode/doorSlug/enabled would
// change which branch of api/c/[slug].js runs.
eq('sanitize drops injected routing fields',
  Object.keys(sanitizePartnerRow({
    key: 'ok', owner: 'x', carrd: 'ok.carrd.co', lander: 'esgp', code: 'OK-01',
    destination: 'https://www.phef6trk.com/O/K/',
    mode: 'door', doorSlug: 'freecash', enabled: true, origin: 'committed',
  })).sort(),
  ['carrd', 'code', 'destination', 'forwardParam', 'key', 'lander', 'origin', 'owner', 'updated']);
eq('sanitize rejects an unsafe destination',
  sanitizePartnerRow({ ...base, destination: 'http://evil.com/x' }), null);
eq('sanitize rejects a bad code', sanitizePartnerRow({ ...base, code: 'a' }), null);
eq('sanitize rejects a bad key', sanitizePartnerRow({ ...base, key: 'A B' }), null);
eq('sanitize rejects a non-object', sanitizePartnerRow('nope'), null);
eq('sanitize rejects an array', sanitizePartnerRow(['a']), null);
eq('sanitize rejects null', sanitizePartnerRow(null), null);

/* ── regressions found by adversarial review, 2026-07-28 ─────────────────────
 * Each of these was reproduced end to end before it was fixed. They are the
 * failures that pay the wrong person while every dashboard looks normal.
 */

// A SPRK-minted code already belongs to a network affiliate and is attributed at
// the door. Accepting one here let a saved row take over that affiliate's clicks on
// a HOUSE slug — reproduced against /c/frrcsh-uk-off.
eq('a canonical spark code is refused as a partner code',
  problemsFor([{ ...base, code: 'SPK-A1B2-C3D4' }]), true);
eq('…the message says why', partnerLinkProblems([{ ...base, code: 'SPK-A1B2-C3D4' }])
  .some(p => p.includes('SPRK-minted')), true);
eq('a relaunch child of a spark code is refused too',
  problemsFor([{ ...base, code: 'SPK-A1B2-C3D4-7' }]), true);
eq('a lowercase spark code is refused (it normalises to canonical)',
  problemsFor([{ ...base, code: 'spk-a1b2-c3d4' }]), true);
eq('a code that merely LOOKS spark-ish is still allowed',
  partnerLinkProblems([{ ...base, code: 'SPKX-A1B2-C3D4' }]), []);

// buildDirectUrl picks its separator on '?' alone, so a fragment swallows the
// sub-ID: the param lands after '#' and never reaches the network.
eq('a destination carrying a fragment is refused',
  isSafePartnerDestination('https://www.phef6trk.com/x#'), false);
eq('…including one with a query before it',
  isSafePartnerDestination('https://www.phef6trk.com/x?a=1#frag'), false);

// ── committed rows are the floor ─────────────────────────────────────────────
eq('committedRows() returns every committed row', committedRows().length, PARTNER_LINKS.length);
eq('…each labelled as committed',
  committedRows().every(r => r.origin === 'committed'), true);
// A flushed store must never read as "there are no partners" — that would route
// every partner click to the house destination and look like ordinary traffic.
eq('an empty store still leaves every committed row routing',
  committedRows().map(r => r.key), PARTNER_LINKS.map(r => r.key));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
