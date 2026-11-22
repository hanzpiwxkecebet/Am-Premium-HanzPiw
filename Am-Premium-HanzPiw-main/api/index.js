// Entry point serverless Vercel: seluruh /api/* diarahkan ke sini lewat rewrites di vercel.json.
// Express app-nya sendiri ada di server/index.js (dipakai juga untuk `npm start` lokal).
module.exports = require('../server/index.js');
