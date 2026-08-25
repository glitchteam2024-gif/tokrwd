/**
 * lander-store.js — the KV document behind /u/<slug>, and the ONE place that decides
 * what a slug may look like.
 *
 * WHY THIS FILE EXISTS AT ALL. kv.js:11-14 says in as many words that building a Redis
 * key out of request data — a campid, a slug — hands a public URL a say in which key
 * gets read or written, and that this is a class of bug easier to avoid than to audit.
 * This feature has no choice but to key on request data: there is one document per
 * generated lander and the slug arrives in the URL. So the warning is honoured the only
 * other way it can be — by making the key UNFORGEABLE before it is built. Nothing here
 * interpolates a slug that has not first matched SLUG_RE, which admits exactly what the
 * SPRK minter can produce (api-src/custom-landers.ts:98-99 — SLUG_ALPHABET
 * 'abcdefghjkmnpqrstuvwxyz23456789', SLUG_LEN 10) and nothing else. No colon, no '*', no
 * '/', no '..', no unbounded length can reach a KV command through this module.
 *
 * TWO CALLERS, ONE SHAPE. api/u/[slug].js reads this document; api/lander-publish.js
 * writes it. Every file under api/ compiles to its own lambda with its own module
 * instance (kv.js:4-9), so a shared module is the only way those two can agree on the
 * key, on the byte cap, and on what "disabled" means.
 *
 * THE DOCUMENT
 *   {
 *     v: 1,
 *     slug:         'abc23xyz90',
 *     sha256:       '<64 hex>',        // VERIFIED here over the stored bytes, never trusted
 *     bytes:        123456,            // utf8 byte length of html
 *     html:         '<!doctype html>…' // ABSENT once disabled — see below
 *     disabled:     false,
 *     published_at: '2026-08-25T…Z',
 *     disabled_at:  '',                // set when the tombstone is written
 *   }
 *
 * WHY A TOMBSTONE AND NOT A DELETE. A takedown that DELETEs the key loses the fact that
 * the page was killed, and a publish already in flight — a retried cron tick, a queued
 * job — recreates it. The page comes back to life and nothing anywhere says it was ever
 * taken down. So a disable REPLACES the document with a tombstone that keeps the audit
 * fields and drops `html`, so the bytes are genuinely gone from the store, and a later
 * publish onto that slug is REFUSED unless the caller says `republish: true` in so many
 * words. Reviving a killed page has to be a decision, not a race.
 */

import { createHash } from 'node:crypto';
import { kvEnabled, kvGetRaw } from './kv.js';

/**
 * Exactly the SPRK minter's alphabet and length, anchored at both ends.
 *
 * Deliberately NOT case-insensitive and NOT trimmed of look-alikes at read time: the
 * minter never emits i/l/o/1/0 or an uppercase letter, so a URL containing one is not a
 * typo we should be generous about, it is someone probing the keyspace. It gets the same
 * answer as any other miss.
 */
export const SLUG_RE = /^[abcdefghjkmnpqrstuvwxyz23456789]{10}$/;

/** Namespace matches partner-access.js:22 / partner-store.js:29 — `tokrwd:<thing>:v<n>`. */
export const LANDER_KEY_PREFIX = 'tokrwd:lander:v1:';

/**
 * The same 524288 the SPRK bucket enforces (api-src/custom-landers.ts:79,87). Repeated
 * rather than imported because the two repos are separate Vercel projects that cannot
 * import each other — if that number ever moves, it moves in both places or the write
 * silently starts failing at whichever end is smaller.
 */
export const MAX_HTML_BYTES = 524288;

export function isValidSlug(slug) {
  return typeof slug === 'string' && SLUG_RE.test(slug);
}

/** The KV key for a slug. THROWS on anything SLUG_RE does not admit — see the header. */
export function landerKey(slug) {
  if (!isValidSlug(slug)) throw new Error('lander-store: refusing to build a key from an invalid slug');
  return LANDER_KEY_PREFIX + slug;
}

/** Hex sha256 over utf8, byte-for-byte what api-src/_lib/lander-assemble.ts:156 computes. */
export function sha256Hex(s) {
  return createHash('sha256').update(String(s), 'utf8').digest('hex');
}

export const SHA256_RE = /^[0-9a-f]{64}$/;

/**
 * Read the document, and the RAW string it was stored as so a writer can compare-and-swap
 * against it (kv.js:105-116 — a parse/reserialise round trip does not reproduce the bytes).
 *
 * Returns a STATUS rather than just null, because the three ways to get nothing back are
 * three different facts and the serve route treats them differently:
 *   'ok'           — a document is here
 *   'absent'       — the store answered, and there is no such key. This is a real 404.
 *   'unconfigured' — no datastore is wired up at all. Also serves nothing, but it is a
 *                    deployment fault, not a missing page, and it must be logged as one.
 * Corruption and an unreachable store THROW: neither is "the page does not exist", and
 * answering 404 for them would cache a takedown-shaped lie over a page that is fine.
 */
export async function readLanderDoc(slug, { timeoutMs = 1500 } = {}) {
  if (!kvEnabled()) return { status: 'unconfigured', raw: null, doc: null };
  const raw = await kvGetRaw(landerKey(slug), { timeoutMs });
  if (raw == null) return { status: 'absent', raw: null, doc: null };
  let doc = null;
  try {
    doc = JSON.parse(raw);
  } catch {
    throw new Error('lander-store: the stored document is not valid JSON');
  }
  if (!doc || typeof doc !== 'object' || Array.isArray(doc)) {
    throw new Error('lander-store: the stored document is not an object');
  }
  return { status: 'ok', raw, doc };
}

/**
 * The bytes to serve, or null when this document is not a servable page.
 *
 * ⚠️ NOTE THE POLARITY, it is the opposite of click.js:172-180 and deliberately so. There,
 * only an explicit `deactivated === true` stops a click, because a false positive costs a
 * live affiliate a paid click. Here a false NEGATIVE is the expensive one: it leaves a page
 * serving that somebody decided to kill. So ANY truthy `disabled` is a takedown, and a
 * document whose html is missing or is not a string is not a page either — that is what a
 * tombstone looks like, and it is also what a half-written document would look like.
 */
export function servableHtml(doc) {
  if (!doc) return null;
  if (doc.disabled) return null;
  if (typeof doc.html !== 'string' || doc.html === '') return null;
  return doc.html;
}
