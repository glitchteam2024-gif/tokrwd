/**
 * /api/roblox/user — look up a public Roblox profile by username.
 *
 * POST { "username": "..." }  ->  200 { user: { id, username, displayName, hasVerifiedBadge, avatarUrl } }
 *
 * Same response shape as the third-party lookup the landers used before, so pages only swap
 * their API_URL. Roblox's web API sends no CORS headers, which is why this has to run
 * server-side. Same-origin only on purpose: no Access-Control-Allow-Origin, so it is not an
 * open proxy for other sites.
 *
 * Usernames are never logged or stored.
 */
const USERNAME_RE = /^[A-Za-z0-9_]{3,20}$/;
const TIMEOUT_MS = 6000;

async function robloxJson(url, init) {
  const r = await fetch(url, { ...init, signal: AbortSignal.timeout(TIMEOUT_MS) });
  if (!r.ok) {
    const err = new Error(`roblox ${r.status}`);
    err.status = r.status;
    throw err;
  }
  return r.json();
}

async function headshotUrl(userId) {
  try {
    const out = await robloxJson(
      `https://thumbnails.roblox.com/v1/users/avatar-headshot?userIds=${userId}&size=420x420&format=Png&isCircular=false`
    );
    const t = out?.data?.[0];
    return t?.state === 'Completed' && t.imageUrl ? t.imageUrl : '';
  } catch {
    // The page draws an initial-letter avatar when this is empty.
    return '';
  }
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Robots-Tag', 'noindex, nofollow');

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed.' });
  }

  let body = req.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch { body = {}; }
  }
  const username = String(body?.username ?? '').trim();
  if (!USERNAME_RE.test(username)) {
    return res.status(400).json({ error: 'Use 3-20 letters, numbers, or underscores.' });
  }

  let match;
  try {
    const found = await robloxJson('https://users.roblox.com/v1/usernames/users', {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify({ usernames: [username], excludeBannedUsers: true }),
    });
    match = found?.data?.[0];
  } catch (e) {
    if (e.status === 429) {
      return res.status(429).json({ error: 'Too many lookups right now. Try again in a minute.' });
    }
    return res.status(502).json({ error: 'Roblox is not responding right now. Please try again.' });
  }

  if (!match?.id) {
    return res.status(404).json({ error: 'No Roblox account found with that username.' });
  }

  return res.status(200).json({
    user: {
      id: match.id,
      username: match.name,
      displayName: match.displayName || match.name,
      hasVerifiedBadge: Boolean(match.hasVerifiedBadge),
      avatarUrl: await headshotUrl(match.id),
    },
  });
}
