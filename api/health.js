// Vercel Serverless Function: GET /api/health
// A lightweight liveness endpoint and the entry point for the future workspace API
// described in the README roadmap. It does not execute any commands.
export default function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.setHeader('Allow', 'GET, HEAD');
    return res.status(405).json({ error: 'Method not allowed' });
  }
  res.setHeader('Cache-Control', 'no-store');
  return res.status(200).json({
    status: 'ok',
    service: 'termbox-web',
    timestamp: new Date().toISOString()
  });
}
