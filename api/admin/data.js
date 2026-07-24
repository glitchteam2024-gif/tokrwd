/**
 * /api/admin/data — Admin CRUD API
 * 
 * Handles all data operations for the Links Manager dashboard.
 * Protected by a simple admin key (set ADMIN_KEY env var in Vercel).
 * 
 * GET  /api/admin/data              → returns all data
 * POST /api/admin/data?action=...   → performs CRUD operations
 */

import {
  getStore, getCarrdPages, addCarrdPage, removeCarrdPage, updateCarrdStatus,
  getOfferLinks, addOfferLink, updateOfferLink, removeOfferLink,
  getLanders, addLander, removeLander,
  getSettings, updateSettings, getPostbackLog, setCampaign
} from '../_lib/store.js';

// Simple auth check — in production, use a proper auth system
function isAuthorized(req) {
  const key = req.query.admin_key || req.headers['x-admin-key'] || '';
  const envKey = process.env.ADMIN_KEY || 'sprk2026';
  return key === envKey;
}

export default function handler(req, res) {
  // CORS for dashboard
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Admin-Key');
  res.setHeader('Cache-Control', 'no-store');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (!isAuthorized(req)) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  // GET — return all data
  if (req.method === 'GET') {
    const host = req.headers.host || 'yourdomain.com';
    const settings = getSettings();
    if (!settings.domain) settings.domain = host;

    return res.status(200).json({
      carrd_pages: getCarrdPages(),
      offer_links: getOfferLinks(),
      landers: getLanders(),
      settings: settings,
      postback_log: getPostbackLog().slice(-50),
      postback_url: `https://${settings.domain || host}/api/postback?campid={campid}&payout={payout}&key=${settings.postback_key}`
    });
  }

  // POST — CRUD operations
  if (req.method === 'POST') {
    const body = req.body || {};
    const action = body.action || req.query.action;

    switch (action) {
      // === CARRD PAGES ===
      case 'add_carrd': {
        const url = body.url;
        if (!url) return res.status(400).json({ error: 'URL required' });
        // Extract subdomain from URL (e.g., https://sagecliff3.carrd.co → sagecliff3)
        const match = url.match(/https?:\/\/([^.]+)\.carrd\.co/i);
        const subdomain = match ? match[1] : url.replace(/https?:\/\//, '').split('.')[0];
        const page = addCarrdPage(subdomain, url);
        return res.status(200).json({ success: true, page });
      }
      case 'remove_carrd': {
        removeCarrdPage(body.url);
        return res.status(200).json({ success: true });
      }
      case 'update_carrd_status': {
        const page = updateCarrdStatus(body.url, body.status);
        return res.status(200).json({ success: true, page });
      }

      // === OFFER LINKS ===
      case 'add_offer_link': {
        if (!body.slug || !body.destination) {
          return res.status(400).json({ error: 'slug and destination required' });
        }
        const link = addOfferLink(body.slug, body.destination, body.forward_param || 'campid');
        return res.status(200).json({ success: true, link });
      }
      case 'update_offer_link': {
        const link = updateOfferLink(body.slug, body.destination, body.forward_param);
        return res.status(200).json({ success: true, link });
      }
      case 'remove_offer_link': {
        removeOfferLink(body.slug);
        return res.status(200).json({ success: true });
      }

      // === LANDERS ===
      case 'add_lander': {
        if (!body.url) return res.status(400).json({ error: 'URL required' });
        const lander = addLander(body.name || '', body.url);
        return res.status(200).json({ success: true, lander });
      }
      case 'remove_lander': {
        removeLander(body.url);
        return res.status(200).json({ success: true });
      }

      // === CAMPAIGNS ===
      case 'set_campaign': {
        if (!body.campid) return res.status(400).json({ error: 'campid required' });
        setCampaign(body.campid, {
          status: body.status || 'active',
          lander_url: body.lander_url || ''
        });
        return res.status(200).json({ success: true });
      }

      // === SETTINGS ===
      case 'update_settings': {
        const settings = updateSettings(body.settings || {});
        return res.status(200).json({ success: true, settings });
      }

      default:
        return res.status(400).json({ error: 'Unknown action: ' + action });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
