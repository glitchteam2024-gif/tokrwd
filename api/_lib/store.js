/**
 * Links Manager — Data Store
 * 
 * Uses Vercel KV (Redis) if available, otherwise falls back to an in-memory
 * store seeded from a JSON config file. For production, set up Vercel KV and
 * add KV_REST_API_URL + KV_REST_API_TOKEN to your Vercel env vars.
 * 
 * Data schema:
 *   carrd_pages: [{ subdomain, url, status, uses, added }]
 *   offer_links: [{ slug, destination, forward_param, created }]
 *   landers:     [{ name, url, added }]
 *   settings:    { postback_key, domain }
 */

import { LANDERS, OFFER_LINKS } from './links-config.js';

// In-memory store. NOT shared between endpoints: on Vercel each api/*.js file
// compiles to its own lambda with its own module instance, so a write made through
// api/admin/data.js is invisible to api/c/[slug].js and api/r.js — permanently,
// not just until the next cold start. Durable config therefore lives in
// links-config.js and is deployed with the bundle; what survives here is only
// per-instance scratch (usage counters, the postback log).
let _store = null;

const DEFAULT_DATA = {
  carrd_pages: [],
  // Seeded from the committed config so the dashboard lists the links that
  // /c/:slug will actually serve. Anything added here at runtime lives only in
  // this lambda — see the note on the postback key below for why that matters.
  offer_links: OFFER_LINKS.map(l => ({ ...l })),
  landers: LANDERS.map(l => ({ ...l })),
  settings: {
    // MUST come from the environment. Each api/*.js file is its own Vercel lambda
    // with its own module instance, so generateKey() produces a DIFFERENT key in
    // the admin lambda than in the postback lambda: the URL the dashboard prints
    // could never validate. Combined with api/postback.js answering 200 'ok' on a
    // key mismatch, that dropped every network conversion with no error signal.
    // The random fallback keeps local dev working; in production set POSTBACK_KEY.
    postback_key: process.env.POSTBACK_KEY || generateKey(),
    postback_key_from_env: !!process.env.POSTBACK_KEY,
    domain: '' // Will be auto-detected from request host
  },
  postback_log: [],
  campaigns: {} // campid -> { status, lander_url, created }
};

function generateKey() {
  const chars = '0123456789';
  let key = '';
  for (let i = 0; i < 10; i++) key += chars[Math.floor(Math.random() * chars.length)];
  return key;
}

export function getStore() {
  if (!_store) {
    _store = JSON.parse(JSON.stringify(DEFAULT_DATA));
  }
  return _store;
}

export function getCarrdPages() {
  return getStore().carrd_pages;
}

export function addCarrdPage(subdomain, url) {
  const store = getStore();
  const existing = store.carrd_pages.find(p => p.url === url);
  if (existing) return existing;
  const page = {
    subdomain,
    url,
    status: 'active',
    uses: 0,
    added: new Date().toISOString()
  };
  store.carrd_pages.push(page);
  return page;
}

export function removeCarrdPage(url) {
  const store = getStore();
  store.carrd_pages = store.carrd_pages.filter(p => p.url !== url);
}

export function updateCarrdStatus(url, status) {
  const store = getStore();
  const page = store.carrd_pages.find(p => p.url === url);
  if (page) page.status = status;
  return page;
}

export function getOfferLinks() {
  return getStore().offer_links;
}

export function getOfferLink(slug) {
  return getStore().offer_links.find(l => l.slug === slug);
}

export function addOfferLink(slug, destination, forward_param) {
  const store = getStore();
  const existing = store.offer_links.find(l => l.slug === slug);
  if (existing) {
    existing.destination = destination;
    existing.forward_param = forward_param;
    return existing;
  }
  const link = {
    slug,
    destination,
    forward_param: forward_param || 'campid',
    created: new Date().toISOString()
  };
  store.offer_links.push(link);
  return link;
}

export function updateOfferLink(slug, destination, forward_param) {
  const store = getStore();
  const link = store.offer_links.find(l => l.slug === slug);
  if (link) {
    if (destination !== undefined) link.destination = destination;
    if (forward_param !== undefined) link.forward_param = forward_param;
  }
  return link;
}

export function removeOfferLink(slug) {
  const store = getStore();
  store.offer_links = store.offer_links.filter(l => l.slug !== slug);
}

export function getLanders() {
  return getStore().landers;
}

export function addLander(name, url) {
  const store = getStore();
  const lander = {
    name: name || '',
    url,
    added: new Date().toISOString()
  };
  store.landers.push(lander);
  return lander;
}

export function removeLander(url) {
  const store = getStore();
  store.landers = store.landers.filter(l => l.url !== url);
}

export function getSettings() {
  return getStore().settings;
}

export function updateSettings(updates) {
  const store = getStore();
  Object.assign(store.settings, updates);
  return store.settings;
}

export function getCampaigns() {
  return getStore().campaigns;
}

export function setCampaign(campid, data) {
  const store = getStore();
  store.campaigns[campid] = { ...data, updated: new Date().toISOString() };
}

export function getCampaign(campid) {
  return getStore().campaigns[campid];
}

export function logPostback(data) {
  const store = getStore();
  store.postback_log.push({
    ...data,
    received: new Date().toISOString()
  });
  // Keep last 1000 entries
  if (store.postback_log.length > 1000) {
    store.postback_log = store.postback_log.slice(-1000);
  }
}

export function getPostbackLog() {
  return getStore().postback_log;
}
