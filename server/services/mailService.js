/**
 * Email Otomatis (generator.email)
 *
 * generator.email adalah layanan email sementara TANPA API resmi. Inbox-nya dibaca
 * dengan mengambil halaman HTML publik lalu mencari link verifikasi di dalamnya.
 * Kalau tampilan generator.email berubah, cukup sesuaikan fungsi di file ini.
 *
 * Env (opsional):
 *   TEMPMAIL_DOMAINS     daftar domain dipisah koma. Default: mail-temp.com
 *   TEMPMAIL_LINK_HINT   regex (tanpa slash) untuk mengenali link verifikasi
 *   TEMPMAIL_LINK_HOSTS  batasi link hanya ke host ini (pisah koma), mis. "alightmotion.com,firebaseapp.com"
 */
const axios = require('axios');

const BASE = 'https://generator.email';
const UA = 'Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Mobile Safari/537.36';

const DOMAINS = (process.env.TEMPMAIL_DOMAINS || 'mail-temp.com')
  .split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
const LINK_HOSTS = (process.env.TEMPMAIL_LINK_HOSTS || '')
  .split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
const HINT_RE = new RegExp(
  process.env.TEMPMAIL_LINK_HINT || 'oobcode|verify|verification|confirm|signin|sign-in|login|auth|action|alight',
  'i'
);

const LOCAL_RE = /^[a-z0-9][a-z0-9._-]{3,39}$/;
const SKIP_HOST_RE = /(^|\.)(generator\.email|w3\.org|schema\.org|googleapis\.com|gstatic\.com|google-analytics\.com|googletagmanager\.com|doubleclick\.net|facebook\.com|twitter\.com|instagram\.com)$/i;
const SKIP_EXT_RE = /\.(png|jpe?g|gif|svg|webp|ico|css|js|woff2?|ttf)(\?|$)/i;

function randomLocal() {
  const letters = 'abcdefghijklmnopqrstuvwxyz';
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let s = letters[Math.floor(Math.random() * letters.length)];
  for (let i = 0; i < 9; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return s;
}

function generateAddress() {
  const domain = DOMAINS[Math.floor(Math.random() * DOMAINS.length)];
  return `${randomLocal()}@${domain}`;
}

function isAllowedAddress(address) {
  const m = /^([^@\s]+)@([^@\s]+)$/.exec(String(address || '').toLowerCase());
  if (!m) return false;
  return LOCAL_RE.test(m[1]) && DOMAINS.includes(m[2]);
}

function decodeEntities(s) {
  return s
    .replace(/&amp;/gi, '&').replace(/&#x3d;/gi, '=').replace(/&#61;/g, '=')
    .replace(/&#x2f;/gi, '/').replace(/&#47;/g, '/').replace(/&#x3a;/gi, ':')
    .replace(/&quot;/gi, '"').replace(/&#39;|&apos;/gi, "'").replace(/&lt;/gi, '<').replace(/&gt;/gi, '>');
}

async function fetchPage(url, user, domain) {
  const res = await axios.get(url, {
    timeout: 8000,
    maxRedirects: 3,
    responseType: 'text',
    validateStatus: () => true,
    headers: {
      'User-Agent': UA,
      'Accept': 'text/html,application/xhtml+xml',
      'Accept-Language': 'en-US,en;q=0.9',
      'Cookie': `surl=${domain}/${user}`,
    },
  });
  return { status: res.status, html: typeof res.data === 'string' ? res.data : '' };
}

/** Ambil semua URL http(s) dari HTML lalu pilih yang paling mirip link verifikasi. */
function pickVerificationLink(html) {
  const start = html.indexOf('id="email-table"');   // kurangi noise iklan di luar daftar email
  const scope = decodeEntities(start > -1 ? html.slice(start) : html);
  const found = scope.match(/https?:\/\/[^\s"'<>\\)]+/gi) || [];

  let best = null;
  let bestScore = 0;
  for (const raw of found) {
    const url = raw.replace(/[.,;]+$/, '');
    let host;
    try { host = new URL(url).hostname.toLowerCase(); } catch (e) { continue; }
    if (SKIP_HOST_RE.test(host) || SKIP_EXT_RE.test(url) || /unsubscribe/i.test(url)) continue;
    if (LINK_HOSTS.length && !LINK_HOSTS.some(h => host === h || host.endsWith('.' + h))) continue;

    let score = 0;
    if (/oobcode=/i.test(url)) score += 10;
    if (HINT_RE.test(url)) score += 3;
    if (score > bestScore) { best = url; bestScore = score; }
  }
  return best;
}

/** Path pesan individual di inbox (kalau halaman inbox hanya menampilkan daftar). */
function findMessagePaths(html, user, domain) {
  const paths = new Set();
  const re = /href=["']([^"']+)["']/gi;
  let m;
  while ((m = re.exec(html))) {
    const href = decodeEntities(m[1]);
    if (!href.startsWith('/')) continue;
    if (href.includes(domain) && href.includes(user) && href.split('/').filter(Boolean).length >= 3) paths.add(href);
    if (paths.size >= 3) break;
  }
  return [...paths];
}

/**
 * Satu kali cek inbox. Dipanggil berulang oleh klien (polling), jadi cepat dan tidak menahan request lama.
 * @returns {{status:'waiting'|'found'|'blocked'|'error', link?:string, message?:string}}
 */
async function checkInbox(address) {
  const [user, domain] = address.toLowerCase().split('@');
  try {
    const main = await fetchPage(`${BASE}/${user}@${domain}`, user, domain);
    if (main.status === 403 || main.status === 429) {
      return { status: 'blocked', message: 'generator.email menolak request dari server' };
    }
    if (main.status >= 400) return { status: 'error', message: `generator.email membalas ${main.status}` };

    let link = pickVerificationLink(main.html);
    if (!link) {
      for (const p of findMessagePaths(main.html, user, domain)) {
        const sub = await fetchPage(BASE + p, user, domain);
        link = sub.html ? pickVerificationLink(sub.html) : null;
        if (link) break;
      }
    }
    return link ? { status: 'found', link } : { status: 'waiting' };
  } catch (err) {
    return { status: 'error', message: err.code === 'ECONNABORTED' ? 'generator.email timeout' : err.message };
  }
}

module.exports = { generateAddress, isAllowedAddress, checkInbox, pickVerificationLink, DOMAINS };
