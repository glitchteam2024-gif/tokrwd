/**
 * partner-access.js — the access codes that let a partner into their own portal.
 *
 * WHY THIS IS NOT THE TRACKING CODE. A partner's tracking code (EDWIN-01) rides on
 * every ad link they run: it is public by construction. Using it to log in would
 * mean anyone who saw one of their ads could open their portal. So an access code
 * is a separate, random secret, and the two never mix.
 *
 * STORED AS A HASH. The code is shown to the operator exactly once, at mint time,
 * and only its SHA-256 is written down. A datastore dump therefore does not hand
 * over working logins — and there is nothing to "recover", which is correct: the
 * fix for a lost code is to mint a new one, which is one click.
 *
 * Read only on login, never on the click path, so it gets a generous timeout and
 * no caching — a revoked code must stop working immediately, not in 30 seconds.
 */

import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { kvEnabled, kvGetRaw, kvCompareAndSet } from './kv.js';

/** Where the access codes live. Separate from the rows doc — different read path. */
export const ACCESS_KEY = 'tokrwd:partner_access:v1';

/**
 * Alphabet with no 0/O/1/I/l — these get read aloud, typed on phones, and pasted
 * out of chat apps, and a code that fails because of a look-alike character reads
 * as "the portal is broken".
 */
const ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';

/** A fresh access code: 20 characters, grouped for legibility. */
export function mintAccessCode() {
  const bytes = randomBytes(20);
  let out = '';
  for (let i = 0; i < 20; i++) out += ALPHABET[bytes[i] % ALPHABET.length];
  return `${out.slice(0, 5)}-${out.slice(5, 10)}-${out.slice(10, 15)}-${out.slice(15, 20)}`;
}

/**
 * Normalise before hashing, so the code survives the round trip through a chat
 * app and a phone keyboard: case, spaces and stray dashes are not the secret.
 */
export function normaliseAccessCode(code) {
  return String(code == null ? '' : code).toUpperCase().replace(/[^A-Z0-9]/g, '');
}

export function hashAccessCode(code) {
  const norm = normaliseAccessCode(code);
  if (!norm) return '';
  return createHash('sha256').update(norm, 'utf8').digest('hex');
}

/** Constant-time compare of two hex digests. */
function hashEq(a, b) {
  const A = Buffer.from(String(a || ''), 'utf8');
  const B = Buffer.from(String(b || ''), 'utf8');
  if (A.length === 0 || A.length !== B.length) return false;
  return timingSafeEqual(A, B);
}

/** The whole access document. `{}` when absent or unreadable. */
async function readAccessDocRaw() {
  if (!kvEnabled()) return { raw: null, codes: {} };
  const raw = await kvGetRaw(ACCESS_KEY, { timeoutMs: 3000 });
  let parsed = null;
  if (raw != null) { try { parsed = JSON.parse(raw); } catch { throw new Error("The stored access data is corrupt."); } }
  const codes = parsed && parsed.codes && typeof parsed.codes === "object" && !Array.isArray(parsed.codes)
    ? parsed.codes : {};
  return { raw, codes };
}

async function readAccessDoc() {
  return (await readAccessDocRaw()).codes;
}

/**
 * Read, change, write back only if unchanged. Same reason as the rows document:
 * issuing a code for one partner must never discard a code issued for another a
 * moment earlier, which is exactly what a bare read-modify-write does.
 */
async function mutateAccess(apply, attempts = 4) {
  if (!kvEnabled()) throw new Error("No datastore connected");
  let last = null;
  for (let i = 0; i < attempts; i++) {
    const { raw, codes } = await readAccessDocRaw();
    const next = apply(codes);
    if (next === null) return codes;
    const ok = await kvCompareAndSet(ACCESS_KEY, raw, { updated_at: new Date().toISOString(), codes: next });
    if (ok) return next;
    last = new Error("Somebody else changed access at the same moment.");
  }
  throw last || new Error("Could not save.");
}

/**
 * Which partner does this access code belong to? '' for anything unrecognised.
 *
 * Walks EVERY entry with a constant-time compare rather than a map lookup, so the
 * time taken does not depend on how much of the code was right.
 */
export async function partnerForAccessCode(code) {
  const want = hashAccessCode(code);
  if (!want) return '';
  let hit = '';
  const codes = await readAccessDoc();
  for (const [digest, entry] of Object.entries(codes)) {
    if (hashEq(digest, want) && entry && entry.partner) hit = String(entry.partner);
  }
  return hit;
}

/** Which partners currently have a code, for the admin panel. Never the codes themselves. */
export async function accessSummary() {
  const codes = await readAccessDoc();
  const out = {};
  for (const entry of Object.values(codes)) {
    if (!entry || !entry.partner) continue;
    out[entry.partner] = { created: entry.created || '', last_used: entry.last_used || '' };
  }
  return out;
}

/**
 * Mint a code for a partner, replacing any they already had.
 *
 * Returns the PLAINTEXT once. It is never retrievable again — see the file header.
 * Replacing rather than appending is deliberate: "generate a new code" has to mean
 * the old one stops working, or a code shared with the wrong person stays live.
 */
export async function issueAccessCode(partnerKey) {
  if (!kvEnabled()) throw new Error('No datastore connected');
  const key = String(partnerKey || '').trim().toLowerCase();
  if (!/^[a-z0-9-]{1,64}$/.test(key)) throw new Error('Bad partner key');

  const plain = mintAccessCode();
  await mutateAccess((codes) => {
    const next = { ...codes };
    for (const [digest, entry] of Object.entries(next)) {
      if (entry && entry.partner === key) delete next[digest];
    }
    next[hashAccessCode(plain)] = { partner: key, created: new Date().toISOString() };
    return next;
  });
  return plain;
}

/** Revoke whatever code a partner has. Their portal stops opening immediately. */
export async function revokeAccessCode(partnerKey) {
  if (!kvEnabled()) throw new Error('No datastore connected');
  const key = String(partnerKey || '').trim().toLowerCase();
  let removed = 0;
  await mutateAccess((codes) => {
    const next = { ...codes };
    for (const [digest, entry] of Object.entries(next)) {
      if (entry && entry.partner === key) { delete next[digest]; removed++; }
    }
    return removed ? next : null;
  });
  return removed;
}

/**
 * Stamp when a code was last used, so a leaked one is not invisible.
 *
 * Best-effort and deliberately unawaited by the caller: this runs on the partner's
 * login, and failing to record a timestamp must never be the reason someone cannot
 * get into their own portal. A lost CAS race just means one login goes unrecorded.
 */
export async function touchAccessCode(code) {
  const digest = hashAccessCode(code);
  if (!digest || !kvEnabled()) return;
  try {
    await mutateAccess((codes) => {
      if (!codes[digest]) return null;
      return { ...codes, [digest]: { ...codes[digest], last_used: new Date().toISOString() } };
    }, 2);
  } catch { /* never block a login on this */ }
}
