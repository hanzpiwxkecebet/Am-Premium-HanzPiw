/* ─── History Page JS — v2.1.0 ─────────────────────────────── */
document.addEventListener('DOMContentLoaded', async () => {
  const tbody        = document.getElementById('historyBody');
  const tableEl      = document.getElementById('historyTable');
  const loadingEl    = document.getElementById('historyLoading');
  const emptyEl      = document.getElementById('historyEmpty');
  const statsWrap    = document.getElementById('historyStats');

  function hide(el) { if (el) el.style.display = 'none'; }
  function show(el, d = 'block') { if (el) el.style.display = d; }

  function statusBadge(status) {
    const map = {
      success:          { label: '✅ Berhasil',      color: '#00c853' },
      send_failed:      { label: '❌ Gagal Kirim',   color: '#ff0040' },
      verify_failed:    { label: '❌ Gagal Verif',   color: '#ff0040' },
      verify_api_failed:{ label: '⚠️ API Error',    color: '#ff9800' },
    };
    const s = map[status] || { label: status, color: 'var(--text-3)' };
    return `<span style="color:${s.color};font-weight:700;font-size:.82rem">${s.label}</span>`;
  }

  function timeAgo(ts) {
    const diff = Date.now() - new Date(ts).getTime();
    const m = Math.floor(diff / 60000);
    if (m < 1)  return 'Baru saja';
    if (m < 60) return `${m} menit lalu`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h} jam lalu`;
    return `${Math.floor(h / 24)} hari lalu`;
  }

  function renderRows(items) {
    tbody.innerHTML = items.map((item, i) => `
      <tr style="animation:fadeSlideUp .3s ease ${i * 0.04}s both">
        <td style="font-family:monospace;font-size:.78rem;color:var(--text-3)">${(item.requestId || item.id || '—').slice(-8)}</td>
        <td style="font-size:.88rem">${item.maskedEmail || '—'}</td>
        <td>${statusBadge(item.status)}</td>
        <td style="font-size:.8rem;color:var(--text-3)" title="${item.timestamp}">${timeAgo(item.timestamp)}</td>
      </tr>
    `).join('');
    show(tableEl, 'table');
  }

  function renderStats(stats) {
    if (!statsWrap) return;
    statsWrap.innerHTML = `
      <div style="display:flex;gap:1rem;flex-wrap:wrap;padding:1rem 1.25rem;border-bottom:1px solid var(--border)">
        <div style="background:var(--bg-card);border:1px solid var(--border);border-radius:var(--radius-sm);padding:.75rem 1.25rem;flex:1;min-width:120px;text-align:center">
          <div style="font-size:1.6rem;font-weight:800;font-family:var(--font-head);color:var(--red)">${stats.totalGenerate || 0}</div>
          <div style="font-size:.75rem;color:var(--text-3);margin-top:.2rem">Total Generate</div>
        </div>
        <div style="background:var(--bg-card);border:1px solid var(--border);border-radius:var(--radius-sm);padding:.75rem 1.25rem;flex:1;min-width:120px;text-align:center">
          <div style="font-size:1.6rem;font-weight:800;font-family:var(--font-head);color:#00c853">${stats.success || 0}</div>
          <div style="font-size:.75rem;color:var(--text-3);margin-top:.2rem">Berhasil</div>
        </div>
        <div style="background:var(--bg-card);border:1px solid var(--border);border-radius:var(--radius-sm);padding:.75rem 1.25rem;flex:1;min-width:120px;text-align:center">
          <div style="font-size:1.6rem;font-weight:800;font-family:var(--font-head);color:var(--blue)">${stats.today || 0}</div>
          <div style="font-size:.75rem;color:var(--text-3);margin-top:.2rem">Hari Ini</div>
        </div>
      </div>
    `;
    show(statsWrap);
  }

  // Wait for Firebase auth state
  async function waitForUser(timeout = 4000) {
    if (typeof firebase === 'undefined') return null;
    return new Promise(resolve => {
      const timer = setTimeout(() => resolve(null), timeout);
      firebase.auth().onAuthStateChanged(user => {
        clearTimeout(timer);
        resolve(user);
      });
    });
  }

  const user = await waitForUser();

  if (!user) {
    hide(loadingEl);
    if (emptyEl) {
      emptyEl.innerHTML = `
        <div style="font-size:3rem;margin-bottom:1rem">🔐</div>
        <div style="font-weight:700;margin-bottom:.5rem">Login Diperlukan</div>
        <p style="font-size:.85rem;margin-bottom:1.5rem">Masuk untuk melihat riwayat generate kamu.</p>
        <a href="/login" class="btn btn-primary" style="display:inline-flex">Login / Daftar</a>
      `;
      show(emptyEl);
    }
    return;
  }

  // User is logged in — fetch stats + history
  try {
    const token = await user.getIdToken();
    const headers = { 'Authorization': `Bearer ${token}` };

    const [statsRes, historyRes] = await Promise.all([
      fetch('/api/user/stats', { headers }),
      fetch('/api/user/history', { headers })
    ]);

    const statsData   = await statsRes.json();
    const historyData = await historyRes.json();

    hide(loadingEl);

    if (statsData.success) renderStats(statsData.data);

    const items = historyData.success ? historyData.data : [];
    if (items.length === 0) {
      if (emptyEl) {
        emptyEl.innerHTML = `
          <div style="font-size:3rem;margin-bottom:1rem">📭</div>
          <div style="font-weight:600;margin-bottom:.5rem">Belum Ada Riwayat</div>
          <p style="font-size:.85rem">Kamu belum pernah menggunakan generator.</p>
        `;
        show(emptyEl);
      }
    } else {
      renderRows(items);
    }
  } catch (e) {
    hide(loadingEl);
    if (emptyEl) {
      emptyEl.innerHTML = `<div style="font-size:3rem;margin-bottom:1rem">⚠️</div><div>Gagal memuat data.</div>`;
      show(emptyEl);
    }
  }
});
