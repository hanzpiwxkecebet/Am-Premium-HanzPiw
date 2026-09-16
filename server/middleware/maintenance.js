const { getSettings } = require('../services/firebaseService');

let cachedSettings = null;
let cacheTime = 0;
const CACHE_TTL = 30000; // 30 seconds

async function maintenanceMiddleware(req, res, next) {
  // Always pass API routes for admin
  if (req.path.startsWith('/api/admin')) return next();
  if (req.path.startsWith('/admin')) return next();
  if (req.path.startsWith('/public')) return next();
  
  try {
    const now = Date.now();
    if (!cachedSettings || (now - cacheTime) > CACHE_TTL) {
      cachedSettings = await getSettings();
      cacheTime = now;
    }
    
    if (cachedSettings?.maintenance === true) {
      // If JSON request, return JSON
      if (req.headers.accept?.includes('application/json') || req.path.startsWith('/api/')) {
        return res.status(503).json({
          success: false,
          error: 'Website sedang dalam pemeliharaan. Silakan coba lagi nanti.',
          code: 'MAINTENANCE'
        });
      }
      // Otherwise redirect to maintenance page
      return res.status(503).send(`<!DOCTYPE html>
<html lang="id">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Maintenance - AM Premium Free</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{background:#080810;color:#fff;font-family:'Orbitron',sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;text-align:center}
.container{padding:2rem}
h1{font-size:4rem;background:linear-gradient(135deg,#ff003c,#0047ff);-webkit-background-clip:text;-webkit-text-fill-color:transparent;margin-bottom:1rem}
p{color:#888;font-size:1.2rem;margin-bottom:2rem;font-family:sans-serif}
.icon{font-size:5rem;margin-bottom:1rem;display:block}
</style>
<link href="https://fonts.googleapis.com/css2?family=Orbitron:wght@700&display=swap" rel="stylesheet">
</head>
<body>
<div class="container">
<span class="icon">🛠️</span>
<h1>MAINTENANCE</h1>
<p>Website sedang dalam pemeliharaan. Silakan coba lagi nanti.</p>
<p style="color:#ff003c">AM Premium Free by HanzPiw</p>
</div>
</body>
</html>`);
    }
    next();
  } catch (e) {
    next(); // On error, allow request through
  }
}

module.exports = { maintenanceMiddleware };
