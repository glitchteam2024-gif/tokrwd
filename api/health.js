/**
 * /api/health — Liveness probe
 * 
 * The Carrd script calls this with ?isactive=1 to verify the cloaker is online.
 * Returns plain text "ACTIVE" if the system is running.
 */

export default function handler(req, res) {
  const isactive = req.query.isactive;
  
  if (isactive === '1') {
    res.setHeader('Content-Type', 'text/plain');
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Access-Control-Allow-Origin', '*');
    return res.status(200).send('ACTIVE');
  }

  // Default response
  res.setHeader('Content-Type', 'text/plain');
  return res.status(200).send('ok');
}
