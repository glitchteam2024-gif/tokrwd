/**
 * partner-store.js — the partner rows a click is actually routed by.
 *
 * Two tiers, and the difference matters:
 *
 *   COMMITTED  PARTNER_LINKS in links-config.js. Deployed with the bundle, visible
 *              to code review and to the tracking audit, and spread into the
 *              CARRD_ROUTES literal at module load — so committed rows feed every
 *              map the router builds, with nothing to inject.
 *   STORED     Rows saved through the admin panel. They live in Redis and are read
 *              per request, because a row written after module load can never reach
 *              CARRD_HOST_MAP. They are threaded through exactly the way
 *              resolveLander({ campaigns }) already threads the admin store.
 *
 * COMMITTED ROWS ARE THE FLOOR AND ALWAYS WIN A COLLISION. A stored row may ADD a
 * partner; it may never silently repoint one that is in source control. The
 * tracking audit is a static read of the working tree and cannot see Redis, so
 * letting the store override committed config would quietly narrow the one
 * guarantee that file exists to give.
 */

import { kvEnabled, kvGetJson, kvGetRaw, kvCompareAndSet } from './kv.js';
import { PARTNER_LINKS, isSafePartnerDestination, partnerKey, partnerSlugFor } from './links-config.js';

/**
 * ONE key, a constant. Per-partner keys would mean building a Redis key out of a
 * campid read off a public URL.
 */
export const PARTNER_KEY = 'tokrwd:partner_links:v1';

/** How long a lambda may serve its cached copy before re-reading. */
const TTL_MS = 30_000;

/** Ceiling on rows, so a corrupted document cannot turn into unbounded work. */
const MAX_ROWS = 500;

/** Ceiling on the extra Carrd pages one partner may register from the portal. */
export const MAX_HOSTS_PER_PARTNER = 25;

/**
 * Hostnames a partner may never register as "their page".
 *
 * They are ours or shared infrastructure, and the field is otherwise validated for
 * SHAPE but never for ownership — so without this a partner could sit on
 * `carrd.co` itself, or on our own domains, and (because a claimed host is then
 * refused to everyone else) lock the rightful owner out. isSafePartnerDestination
 * already blocks the same hosts on the destination side; this is the page side.
 */
const RESERVED_HOSTS = new Set([
  'tokrwd.co', 'appflowconnect.com', 'sprktrax.org', 'carrd.co', 'vercel.app',
]);

/** A Carrd hostname, normalised the one way everything here compares them. */
export function normaliseHost(input) {
  let h = String(input == null ? '' : input).trim().toLowerCase();
  h = h.replace(/^https?:\/\//, '').split('/')[0].split('?')[0].replace(/^(www\.)+/, '');
  if (!h) return '';
  if (!h.includes('.')) h = `${h}.carrd.co`;
  return /^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(h) && h.length <= 120 ? h : '';
}

let _rows = null;      // last known good MERGED rows
let _at = 0;           // when _rows was built
let _inflight = null;  // request coalescing: a cold lambda taking 10 clicks reads once
let _warned = false;   // log an outage once per lambda, not once per click
// Bumped by every write. A read that started BEFORE a write must not install its
// stale snapshot afterwards — plSave re-previews immediately, so that race is the
// difference between "Saved, this is live now" and a preview saying nobody owns the
// code that was just saved.
let _gen = 0;
// How long to stop retrying after a failed read. Without it a dead store costs
// every click the full abort timeout, forever, with no backoff.
const FAIL_BACKOFF_MS = 10_000;
let _failUntil = 0;

/**
 * Validate EVERY record on EVERY read.
 *
 * Write-side validation protects nothing here: the lambda that saved the row is a
 * different process from the one serving this click, so the writer's validator is
 * not in this request's path. This function is the only thing standing between a
 * poisoned document and a live 302.
 *
 * Fields are WHITELISTED, never spread. An injected `mode`, `doorSlug` or
 * `enabled` would change which branch of api/c/[slug].js runs.
 */
export function sanitizePartnerRow(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;

  const key = String(raw.key || '').trim().toLowerCase();
  if (!/^[a-z0-9-]{1,64}$/.test(key)) return null;

  const code = partnerKey(raw.code);
  if (!/^[A-Z0-9][A-Z0-9._-]{2,63}$/.test(code)) return null;

  const lander = String(raw.lander || '').trim();
  if (!/^[A-Za-z0-9._:/-]{1,200}$/.test(lander)) return null;

  // THE one normaliser, here as everywhere else. Three subtly different versions of
  // this used to coexist — an inline strip here, normaliseHost on the request side,
  // normHost in the router — and a page spelled to survive one but not another was
  // stored in a form the ownership checks then failed to recognise, letting one
  // partner claim another's page.
  const carrd = normaliseHost(raw.carrd);
  if (!carrd) return null;

  // Coerced ONCE, then both validated and stored. Validating `raw.destination` and
  // separately storing `String(raw.destination)` would let a value whose toString
  // changes between the two calls pass the gate and persist something else.
  const destination = String(raw.destination == null ? '' : raw.destination);
  if (!isSafePartnerDestination(destination)) return null;

  const forwardParam = String(raw.forwardParam || raw.forward_param || 'sub1');
  if (!/^[a-z0-9_]{1,32}$/i.test(forwardParam)) return null;

  return {
    key,
    owner: String(raw.owner || '').slice(0, 200),
    carrd,
    lander,
    code,
    destination,
    forwardParam,
    updated: String(raw.updated || '').slice(0, 40),
    origin: 'store',
  };
}

/**
 * The extra Carrd pages a partner registered through their own portal, keyed by
 * partner. Sanitised the same way on every read as the rows are, for the same
 * reason: the lambda that wrote them is not the lambda serving this click.
 *
 * Hosts a COMMITTED or already-taken page cannot be claimed — that check happens on
 * write, and again here at index time (first wins), because a host is the one field
 * a partner controls and it decides where somebody else's paid traffic goes.
 */
/**
 * The affiliate link each partner set for THEMSELVES, keyed by partner.
 *
 * This half is partner-owned by an explicit decision: a scaler runs their own
 * account and knows their own tracking URL, so making the operator retype it was
 * the bottleneck this portal exists to remove. It is the ONE field a partner can
 * change that leaves our domain, so it is validated identically on write and on
 * every read, and every change is logged with the value it replaced.
 *
 * It supersedes a row's destination — including a committed row's. "Committed rows
 * win" still holds for everything that decides IDENTITY (the key, the Carrd page,
 * the tracking code): a stored record can never impersonate a committed partner or
 * take their traffic. What it may now do is update where that partner's own clicks
 * are sent, which is the partner's own business relationship.
 */
function sanitizeOfferMap(raw) {
  const out = {};
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out;
  for (const [key, val] of Object.entries(raw)) {
    const k = String(key || '').trim().toLowerCase();
    if (!/^[a-z0-9-]{1,64}$/.test(k) || !val || typeof val !== 'object') continue;
    const destination = String(val.destination == null ? '' : val.destination);
    if (!isSafePartnerDestination(destination)) continue;
    const forwardParam = String(val.forwardParam || 'sub1');
    if (!/^[a-z0-9_]{1,32}$/i.test(forwardParam)) continue;
    out[k] = { destination, forwardParam, updated: String(val.updated || '').slice(0, 40) };
  }
  return out;
}

function sanitizeHostMap(raw) {
  const out = {};
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out;
  for (const [key, list] of Object.entries(raw)) {
    const k = String(key || '').trim().toLowerCase();
    if (!/^[a-z0-9-]{1,64}$/.test(k) || !Array.isArray(list)) continue;
    const hosts = [];
    for (const h of list.slice(0, MAX_HOSTS_PER_PARTNER)) {
      const clean = normaliseHost(h);
      if (clean && !hosts.includes(clean)) hosts.push(clean);
    }
    if (hosts.length) out[k] = hosts;
  }
  return out;
}

/**
 * Committed rows first, then stored rows that do not collide with them — on the
 * row key, on the Carrd page, or on (lander, code). Each collision is dropped
 * silently HERE and reported loudly by partnerLinkProblems() in the panel, so a
 * duplicate is visible without ever being routable.
 *
 * The keys a row CLAIMS, expressed the way the ROUTER resolves them.
 *
 * Guarding on anything narrower lets a store row through that then wins clicks
 * belonging to a committed partner. Two ways that happened:
 *   - the lander was compared as a literal string, so 'ESGP' did not collide with
 *     'esgp' here, while both resolve to the same /c/ slug at runtime;
 *   - the code was compared raw, so 'SPK-A1B2-C3D4-7' did not collide with a
 *     committed 'SPK-A1B2-C3D4' — yet partnerFor() falls a relaunch child back to
 *     its parent, so the store row captured that partner's child traffic.
 */
function collisionKeys(row) {
  const slug = partnerSlugFor(row.lander) || String(row.lander || '').trim().toLowerCase();
  const code = partnerKey(row.code);
  const keys = [`${slug}\u0000${code}`];
  // Claim the parent too, so neither a parent nor a child can be taken out from
  // under a committed row.
  const child = code.match(/^(SPK-[0-9A-F]{4}-[0-9A-F]{4})-\d+$/);
  if (child) keys.push(`${slug}\u0000${child[1]}`);
  return keys;
}

function merge(storeRows, hostMap = {}, offerMap = {}) {
  const committed = PARTNER_LINKS.map(p => ({ ...p, origin: 'committed' }));
  const takenKey = new Set(committed.map(p => p.key));
  const takenHost = new Set(committed.map(p => normaliseHost(p.carrd)));
  const takenCode = new Set(committed.flatMap(collisionKeys));

  const out = committed.slice();
  for (const r of storeRows) {
    if (out.length >= MAX_ROWS) break;
    if (takenKey.has(r.key)) continue;
    if (takenHost.has(r.carrd)) continue;
    const keys = collisionKeys(r);
    if (keys.some(k => takenCode.has(k))) continue;
    takenKey.add(r.key);
    takenHost.add(r.carrd);
    keys.forEach(k => takenCode.add(k));
    out.push(r);
  }

  // Attach the portal-registered pages. Assigned in ROW ORDER — committed rows
  // first — so a page two partners both claim resolves to whoever holds it in the
  // stronger source, and the loser simply does not get it rather than quietly
  // taking over the winner's traffic.
  return out.map((row) => {
    const extra = [];
    for (const h of (hostMap[row.key] || [])) {
      if (takenHost.has(h)) continue;
      takenHost.add(h);
      extra.push(h);
    }
    const own = offerMap[row.key];
    // Re-validated here, not trusted from the document: the lambda that saved it is
    // a different process, and this value becomes a live 302.
    const usesOwn = own && isSafePartnerDestination(own.destination);
    return {
      ...row,
      hosts: extra,
      destination: usesOwn ? own.destination : row.destination,
      forwardParam: usesOwn ? own.forwardParam : row.forwardParam,
      // What the panel labels, and what tells the operator a link is not the one
      // they set. The committed value stays visible beside it.
      offer_origin: usesOwn ? 'partner' : 'operator',
      offer_updated: usesOwn ? (own.updated || '') : '',
      operator_destination: row.destination,
    };
  });
}

/**
 * Committed rows only. The answer whenever the store cannot be consulted.
 *
 * Built ONCE and handed back by reference, because links-config.js memoises its
 * lookup maps on the row array's IDENTITY. A fresh array per call would miss that
 * cache on every request and rebuild the maps on the paid-click path — which is
 * exactly the path with no datastore configured, i.e. the common case.
 */
let _committed = null;
export function committedRows() {
  if (!_committed) _committed = merge([]);
  return _committed;
}

/**
 * The rows this request should route by.
 *
 * THREE outcomes, TWO of which mean "use committed config":
 *   OK           200, parses, validates          -> use it
 *   UNAVAILABLE  timeout / abort / non-200 / junk -> last known good, else committed
 *   ABSENT       200 with result:null             -> committed
 *
 * ABSENT MUST NEVER MEAN "there are no partners". A flushed Redis or a rotated
 * token would otherwise route every partner's click to the house destination and
 * look like ordinary traffic on every dashboard until invoice time.
 *
 * Never throws. The caller is on a paid-click path.
 */
export async function getPartnerRows() {
  const now = Date.now();
  if (_rows && now - _at < TTL_MS) return _rows;
  if (!kvEnabled()) return committedRows();
  // Backing off after a failure. Serve the last good answer if there is one, the
  // committed table otherwise — but do NOT hit the network again yet.
  if (now < _failUntil) return _rows || committedRows();

  if (!_inflight) {
    const gen = _gen;
    // A read that a write overtook must not install what it read. Its snapshot is
    // older than the write, and installing it would re-shadow the new row for a
    // full TTL in the very lambda that just saved it.
    const install = (rows) => {
      if (gen !== _gen) return rows;
      _rows = rows;
      _at = Date.now();
      return rows;
    };
    _inflight = kvGetJson(PARTNER_KEY, { timeoutMs: 250 })
      .then((doc) => {
        // ABSENT — the key genuinely holds nothing. That is a real, cacheable
        // answer ("no stored partners"), and it is the state the setup
        // instructions create: connect the store, redeploy, save the first row
        // later. Not caching it meant a live Redis round trip on EVERY paid click
        // until that first save. It must also RETIRE _rows, or a later blip
        // resurrects rows this read just established were gone.
        if (!doc || !Array.isArray(doc.rows)) {
          _warned = false;
          return install(committedRows());
        }
        const clean = [];
        let dropped = 0;
        for (const row of doc.rows.slice(0, MAX_ROWS)) {
          const ok = sanitizePartnerRow(row);
          // One bad row is dropped; its siblings still route. An all-or-nothing
          // parse would let a single typo take every partner offline.
          if (ok) clean.push(ok); else dropped++;
        }
        if (dropped) console.warn('[partner-store] dropped', dropped, 'invalid row(s)');
        _warned = false;
        // The portal-registered pages live in the SAME document, so they cost no
        // extra round trip on the click path.
        return install(merge(clean, sanitizeHostMap(doc.hosts), sanitizeOfferMap(doc.offers)));
      })
      .catch((e) => {
        if (!_warned) {
          console.warn('[partner-store] store unavailable, serving fallback:', e && e.message);
          _warned = true;
        }
        _failUntil = Date.now() + FAIL_BACKOFF_MS;
        return null;   // UNAVAILABLE — never cached AS A RESULT, only backed off
      })
      .finally(() => { _inflight = null; });
  }

  const fresh = await _inflight;
  return fresh || _rows || committedRows();
}

/**
 * Register or drop a Carrd page for ONE partner. The only write a partner can make.
 *
 * Scoped hard: it touches `hosts[partnerKey]` and nothing else, so the worst a
 * compromised access code can do is add or remove pages on that one partner's own
 * row. It cannot reach the landing page, the offer link or the tracking code —
 * those are the operator's, and they are in a different half of the document.
 *
 * Returns { ok, hosts, error }. A host already spoken for is REFUSED rather than
 * accepted-and-ignored: silently accepting it would leave the partner looking at a
 * page they believe is wired while every click on it goes to somebody else.
 */
export async function setPartnerHost(partnerKey, host, { remove = false } = {}) {
  if (!kvEnabled()) return { ok: false, error: 'No datastore is connected yet.' };
  const key = String(partnerKey || '').trim().toLowerCase();
  if (!/^[a-z0-9-]{1,64}$/.test(key)) return { ok: false, error: 'Unknown partner.' };

  const clean = normaliseHost(host);
  if (!clean) return { ok: false, error: 'That is not a valid Carrd page address.' };
  if (!remove && RESERVED_HOSTS.has(clean)) {
    return { ok: false, error: 'That is not a Carrd page you can register here.' };
  }

  let outcome = { ok: true, hosts: [] };
  try {
    await mutateDoc((doc) => {
      const hosts = { ...doc.hosts };
      // The whole point of readDocRaw keeping rows verbatim: a partner registering a
      // page must not run the operator's rows through this lambda's validator.
      const rows = doc.rows;
      const mine = (sanitizeHostMap(hosts)[key] || []).slice();

      if (remove) {
        const left = mine.filter(h => h !== clean);
        if (left.length) hosts[key] = left; else delete hosts[key];
        outcome = { ok: true, hosts: left };
        return { rows, hosts, offers: doc.offers };
      }

      if (mine.includes(clean)) { outcome = { ok: true, hosts: mine, already: true }; return null; }
      if (mine.length >= MAX_HOSTS_PER_PARTNER) {
        outcome = { ok: false, error: `That is ${MAX_HOSTS_PER_PARTNER} pages already — remove one first.` };
        return null;
      }

      // Taken by anyone else, in committed config or in either half of the document.
      // Every comparison runs through normaliseHost: three different spellings of the
      // same page used to slip past this, which is how one partner could claim another's.
      const cleanRows = rows.map(sanitizePartnerRow).filter(Boolean);
      const cleanHosts = sanitizeHostMap(hosts);
      const takenByCommitted = PARTNER_LINKS.some(p => p.key !== key && normaliseHost(p.carrd) === clean);
      const takenByRow = cleanRows.some(r => r.key !== key && normaliseHost(r.carrd) === clean);
      const takenByOther = Object.entries(cleanHosts).some(([k, list]) => k !== key && list.includes(clean));
      // Their OWN primary page is already theirs — registering it again would burn one
      // of their slots on a page the portal then de-duplicates out of the list.
      const isOwnPrimary = cleanRows.concat(PARTNER_LINKS)
        .some(r => r.key === key && normaliseHost(r.carrd) === clean);

      if (isOwnPrimary) { outcome = { ok: true, hosts: mine, already: true }; return null; }
      if (takenByCommitted || takenByRow || takenByOther) {
        outcome = { ok: false, error: 'That page is already registered to someone else. Use a different one.' };
        return null;
      }

      hosts[key] = mine.concat(clean);
      outcome = { ok: true, hosts: hosts[key] };
      return { rows, hosts, offers: doc.offers };
    });
  } catch (e) {
    return { ok: false, error: (e && e.message) || 'Could not save that just now — try again.' };
  }
  return outcome;
}

/**
 * Set the affiliate link a partner's own clicks end on.
 *
 * The only field a partner can change that points off our domain, so it goes
 * through the same gate as an operator-supplied one — https, no userinfo, no port,
 * no IP literal, no punycode, and never a host we run — and the previous value is
 * returned so the caller can log what it replaced.
 */
export async function setPartnerOffer(partnerKey, destination, forwardParam) {
  if (!kvEnabled()) return { ok: false, error: 'No datastore is connected yet.' };
  const key = String(partnerKey || '').trim().toLowerCase();
  if (!/^[a-z0-9-]{1,64}$/.test(key)) return { ok: false, error: 'Unknown partner.' };

  const dest = String(destination == null ? '' : destination).trim();
  if (!isSafePartnerDestination(dest)) {
    return {
      ok: false,
      error: 'That does not look like a usable offer link. It must start with https://, be your ' +
             'network\'s own domain, and carry no username, port or # fragment.',
    };
  }
  const param = String(forwardParam || 'sub1').trim();
  if (!/^[a-z0-9_]{1,32}$/i.test(param)) {
    return { ok: false, error: 'The sub-ID parameter can only be letters, digits and underscores.' };
  }

  let previous = '';
  try {
    await mutateDoc((doc) => {
      const offers = { ...doc.offers };
      previous = (offers[key] && offers[key].destination) || '';
      offers[key] = { destination: dest, forwardParam: param, updated: new Date().toISOString() };
      return { rows: doc.rows, hosts: doc.hosts, offers };
    });
  } catch (e) {
    return { ok: false, error: (e && e.message) || 'Could not save that just now — try again.' };
  }
  return { ok: true, destination: dest, forwardParam: param, previous };
}

/** Drop a partner's registered pages entirely. Called when their row is deleted. */
export async function clearPartnerHosts(key) {
  const k = String(key || '').trim().toLowerCase();
  if (!k || !kvEnabled()) return;
  await mutateDoc((doc) => {
    if (!Object.prototype.hasOwnProperty.call(doc.hosts, k) &&
        !Object.prototype.hasOwnProperty.call(doc.offers, k)) return null;
    const hosts = { ...doc.hosts };
    const offers = { ...doc.offers };
    delete hosts[k];
    delete offers[k];
    return { rows: doc.rows, hosts, offers };
  });
}

/**
 * Drop this lambda's cached copy. Test seam only.
 *
 * It exists so _partner-store.test.mjs can prove the fallback ladder without
 * sleeping out the 30s TTL — and that ladder is the property most worth pinning,
 * because the failure it prevents (every partner click quietly paying the house)
 * is invisible on every dashboard until invoice time.
 */
export function _resetPartnerCache() {
  _rows = null;
  _at = 0;
  _warned = false;
  _failUntil = 0;
  _gen++;
}

/**
 * The stored document, plus the EXACT bytes it was read as.
 *
 * The raw string is what makes a safe write possible: every mutation below writes
 * back only if the store still holds exactly this, so a change made by somebody
 * else in between is detected instead of silently overwritten.
 */
async function readDocRaw() {
  if (!kvEnabled()) return { raw: null, doc: { rows: [], hosts: {} } };
  const raw = await kvGetRaw(PARTNER_KEY, { timeoutMs: 3000 });
  let parsed = null;
  if (raw != null) {
    try { parsed = JSON.parse(raw); } catch { throw new Error('The stored data is corrupt.'); }
  }
  return {
    raw,
    doc: {
      // Kept VERBATIM. Sanitising here would mean a partner adding one Carrd page
      // rewrites the operator's rows through today's validator — silently deleting
      // any row it happens to reject, and truncating the list at MAX_ROWS. A writer
      // must only ever change the half it came to change.
      rows: parsed && Array.isArray(parsed.rows) ? parsed.rows : [],
      hosts: parsed && parsed.hosts && typeof parsed.hosts === 'object' && !Array.isArray(parsed.hosts)
        ? parsed.hosts : {},
      offers: parsed && parsed.offers && typeof parsed.offers === 'object' && !Array.isArray(parsed.offers)
        ? parsed.offers : {},
      rev: parsed && Number.isFinite(parsed.rev) ? parsed.rev : 0,
    },
  };
}

/**
 * Read the document, let `apply` change it, and write it back ONLY IF nothing else
 * changed it meanwhile. Retries a few times, then gives up loudly.
 *
 * Giving up is the right end state: the caller reports that nothing was saved,
 * which is true. Writing anyway would mean one of the two changes vanishes while
 * both screens say "saved" — and one of those changes decides who gets paid.
 */
async function mutateDoc(apply, attempts = 4) {
  if (!kvEnabled()) throw new Error('No datastore is connected.');
  let lastErr = null;
  for (let i = 0; i < attempts; i++) {
    const { raw, doc } = await readDocRaw();
    const next = apply(doc);
    if (next === null) return doc;              // apply decided there is nothing to do
    const ok = await kvCompareAndSet(PARTNER_KEY, raw, {
      rev: (doc.rev || 0) + 1,
      updated_at: new Date().toISOString(),
      rows: next.rows,
      hosts: next.hosts,
      offers: next.offers !== undefined ? next.offers : doc.offers,
    });
    if (ok) {
      // This lambda's cache is stale, and it is the one most likely to be asked next.
      // Bumping the generation also disowns any read still in flight, whose snapshot
      // predates this write and would otherwise be installed over it.
      _gen++; _rows = null; _at = 0; _failUntil = 0;
      return next;
    }
    lastErr = new Error('Somebody else saved at the same moment.');
  }
  throw lastErr || new Error('Could not save.');
}

/** The stored half only, for the admin panel's edit/delete list. Throws on failure. */
export async function readStoredRows() {
  const { doc } = await readDocRaw();
  return doc.rows.slice(0, MAX_ROWS).map(sanitizePartnerRow).filter(Boolean);
}

/** The pages partners registered through their own portal, keyed by partner. */
/**
 * NOTE: there is deliberately no `readPortalHosts()` here.
 *
 * One existed, was never called, and would have been the only way to read every
 * partner's pages at once. Dead code with that shape in a file the partner-facing
 * API imports is a liability rather than a convenience — the pages a caller is
 * entitled to see already arrive attached to their own row from getPartnerRows().
 */

/**
 * Replace the stored rows. Admin path only.
 *
 * Rows are sanitised on the way in as well as on the way out — a record that could
 * not survive a read has no business being written. `hosts` is carried forward
 * untouched: it belongs to the partners, and an admin saving one row must not
 * unregister every Carrd page every partner added for themselves.
 */
export async function writeStoredRows(rows, meta = {}) {
  const clean = (Array.isArray(rows) ? rows : []).slice(0, MAX_ROWS)
    .map(sanitizePartnerRow)
    .filter(Boolean);
  const next = await mutateDoc((doc) => ({
    rows: clean,
    hosts: meta.hosts || doc.hosts,
    offers: doc.offers,
  }));
  return next.rows;
}
