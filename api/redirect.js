export default function handler(req, res) {
  const { valid, ref } = req.query;
  const allowedDomain = 'vmry7.ttrk.io';

  const isValid = valid === 'true' || (ref && ref.includes(allowedDomain));

  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');

  if (isValid) {
    return res.redirect(302, 'https://vmry7.ttrk.io/click' );
  } else {
    res.status(403).send(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>Access Denied</title>
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <style>
            body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; display: flex; justify-content: center; align-items: center; height: 100vh; margin: 0; background-color: #f9fafb; color: #111827; }
            .container { text-align: center; padding: 2rem; background: white; border-radius: 8px; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1); max-width: 400px; width: 90%; }
            h1 { color: #ef4444; font-size: 1.5rem; margin-bottom: 1rem; }
            p { color: #4b5563; margin-bottom: 0; }
          </style>
        </head>
        <body>
          <div class="container">
            <h1>No Redirect</h1>
            <p>Invalid traffic source. You cannot access this link directly.</p>
          </div>
        </body>
      </html>
    `);
  }
}
