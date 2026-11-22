// Utility functions

function formatDate(ts) {
  if (!ts) return '-';
  const d = new Date(ts);
  return d.toLocaleString('id-ID', { timeZone: 'Asia/Jakarta', day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function formatDateShort(ts) {
  if (!ts) return '-';
  const d = new Date(ts);
  return d.toLocaleDateString('id-ID', { timeZone: 'Asia/Jakarta', day: '2-digit', month: 'short', year: 'numeric' });
}

function formatDuration(ms) {
  if (!ms || ms < 0) return '-';
  if (ms < 1000) return `${ms}ms`;
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  return `${m}m ${s % 60}s`;
}

function animateNumber(el, from, to, duration = 1000) {
  if (!el) return;
  from = Number(from) || 0;
  to = Number(to) || 0;
  const start = performance.now();
  const update = (time) => {
    const elapsed = time - start;
    const progress = Math.min(elapsed / duration, 1);
    const eased = 1 - Math.pow(1 - progress, 3);
    el.textContent = Math.round(from + (to - from) * eased);
    if (progress < 1) requestAnimationFrame(update);
  };
  requestAnimationFrame(update);
}

function setButtonLoading(btn, loading = true) {
  if (!btn) return;
  if (loading) {
    btn.classList.add('loading');
    btn.disabled = true;
  } else {
    btn.classList.remove('loading');
    btn.disabled = false;
  }
}

function showElement(el) { if (el) el.classList.remove('hidden'); }
function hideElement(el) { if (el) el.classList.add('hidden'); }

function createModal(title, content, buttons = []) {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  const btnHtml = buttons.map(b => `<button class="btn ${b.class || 'btn-secondary'}" data-action="${b.action}">${b.label}</button>`).join('');
  overlay.innerHTML = `
    <div class="modal">
      <div class="modal-header">
        <h3>${title}</h3>
        <button class="modal-close" aria-label="Close"><i class="ic ic-x"></i></button>
      </div>
      <div class="modal-body">${content}</div>
      ${buttons.length ? `<div class="modal-footer">${btnHtml}</div>` : ''}
    </div>`;

  const close = () => { overlay.style.animation = 'fadeIn 0.2s ease reverse'; setTimeout(() => overlay.remove(), 200); };

  overlay.querySelector('.modal-close').onclick = close;
  overlay.addEventListener('click', e => { if (e.target === overlay) close(); });
  for (const b of buttons) {
    const btn = overlay.querySelector(`[data-action="${b.action}"]`);
    if (btn && b.onClick) btn.addEventListener('click', () => { b.onClick(); if (b.close !== false) close(); });
  }

  document.body.appendChild(overlay);
  return { overlay, close };
}

function getStatusBadge(status) {
  const map = {
    completed: '<span class="badge badge-success">Berhasil</span>',
    failed: '<span class="badge badge-failed">Gagal</span>',
    pending: '<span class="badge badge-pending">Pending</span>',
    waiting_verification: '<span class="badge badge-pending">Menunggu</span>',
    verifying: '<span class="badge badge-pending">Verifying</span>',
  };
  return map[status] || `<span class="badge">${status}</span>`;
}

function getRoleBadge(role) {
  const labels = { owner: 'Owner', admin: 'Admin', moderator: 'Mod', premium: 'Premium', user: 'User' };
  const cls = { owner: 'badge-owner', admin: 'badge-admin', moderator: 'badge-moderator', premium: 'badge-premium', user: 'badge-user' };
  return `<span class="badge ${cls[role] || 'badge-user'}">${labels[role] || role}</span>`;
}

function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// Logo metode daftar/login. Semua pakai logo custom (CSS), tanpa emoji:
//  google = logo Google, email = logo Gmail (alamat gmail.com) atau ikon amplop (domain lain), username = ikon @
function providerIcon(method, email) {
  if (method === 'google') return '<i class="pv pv-google" title="Google"></i>';
  if (method === 'username') return '<span class="pv-at" title="Username"><i class="ic ic-at"></i></span>';
  if (method === 'email') {
    const isGmail = /@(gmail|googlemail)\.com$/i.test(String(email || ''));
    return isGmail ? '<i class="pv pv-gmail" title="Gmail"></i>' : '<span class="pv-at" title="Email"><i class="ic ic-mail"></i></span>';
  }
  return '';
}

function providerLabel(method, email) {
  if (method === 'google') return 'Google';
  if (method === 'username') return 'Username';
  if (method === 'email') return /@(gmail|googlemail)\.com$/i.test(String(email || '')) ? 'Gmail' : 'Email';
  return '-';
}

// Sel tabel admin: "Daftar via" + (kalau ada) metode login terakhir
function providerCell(u) {
  const main = u.provider && u.provider !== 'unknown'
    ? `<div class="pv-line">${providerIcon(u.provider, u.email)}<span>${providerLabel(u.provider, u.email)}</span></div>`
    : '<div class="pv-line" style="color:var(--text-muted)">-</div>';
  const last = u.lastLoginMethod
    ? `<div class="pv-sub">Login terakhir ${providerIcon(u.lastLoginMethod, u.email)}<span>${providerLabel(u.lastLoginMethod, u.email)}</span></div>`
    : '';
  return `<div class="pv-cell">${main}${last}</div>`;
}

// Avatar kecil (thumbnail 64px dari server, atau huruf pertama nama)
function avatarSm(u) {
  const m = String((u && (u.name || u.username)) || 'U').match(/[\p{L}\p{N}]/u);
  const initial = (m ? m[0] : 'U').toUpperCase();
  const thumb = u && u.photoThumb && /^data:image\//.test(u.photoThumb) ? u.photoThumb : '';
  return `<span class="ava-sm">${thumb ? `<img src="${escapeHtml(thumb)}" alt="" loading="lazy">` : escapeHtml(initial)}</span>`;
}

function debounce(fn, ms = 300) {
  let t;
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
}

function renderError(container, message, onRetry) {
  if (!container) return;
  container.innerHTML = `
    <div class="empty-state error-state">
      <div class="empty-icon"><i class="ic ic-alert"></i></div>
      <div style="margin-bottom:14px">${escapeHtml(message || 'Gagal memuat data')}</div>
      ${onRetry ? '<button class="btn btn-secondary btn-sm" data-retry><i class="ic ic-refresh"></i> Coba lagi</button>' : ''}
    </div>`;
  const btn = container.querySelector('[data-retry]');
  if (btn && onRetry) btn.addEventListener('click', onRetry);
}

window.Utils = { renderError, formatDate, formatDateShort, formatDuration, animateNumber, setButtonLoading, showElement, hideElement, createModal, getStatusBadge, getRoleBadge, escapeHtml, debounce, providerIcon, providerLabel, providerCell, avatarSm };
