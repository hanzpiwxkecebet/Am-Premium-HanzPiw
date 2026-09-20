/* ============================================================
   AM Premium Free v2.0 - Profile Page JS
   ============================================================ */
document.addEventListener('DOMContentLoaded', async () => {
  if (!Auth?.isLoggedIn()) { window.location.href='/login?redirect=/profile'; return; }

  const uid   = sessionStorage.getItem('amp_uid');
  const email = sessionStorage.getItem('amp_email') || 'User';
  const token = sessionStorage.getItem('amp_token');

  // Set avatar & email
  const initials = email.charAt(0).toUpperCase();
  document.getElementById('profileAvatar').textContent = initials;
  document.getElementById('profileEmail').textContent = email;
  document.getElementById('profileAvatarSmall').textContent = initials;

  // Joined date (from Firebase or session)
  try {
    const user = firebase.auth().currentUser;
    if (user?.metadata?.creationTime) {
      const d = new Date(user.metadata.creationTime);
      document.getElementById('profileJoined').textContent = 'Bergabung ' + d.toLocaleDateString('id-ID', {day:'2-digit',month:'long',year:'numeric'});
    }
  } catch {}

  // Load stats
  async function loadStats() {
    try {
      const res = await fetch('/api/user/stats', { headers:{'Authorization':'Bearer '+token} });
      const json = await res.json();
      if (json.success) {
        animCount('profileTotal',  json.data.totalGenerate || 0);
        animCount('profileToday',  json.data.today || 0);
        animCount('profileSuccess', json.data.success || 0);
      }
    } catch {
      ['profileTotal','profileToday','profileSuccess'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.textContent = '—';
      });
    }
  }

  function animCount(id, target) {
    const el = document.getElementById(id);
    if (!el) return;
    let start=0; const dur=800; const t0=performance.now();
    function step(now) {
      const p = Math.min((now-t0)/dur, 1);
      el.textContent = Math.floor(p*target);
      if (p < 1) requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
  }

  await loadStats();

  // Load history with filter
  let currentFilter = 'all';
  let allHistory = [];

  async function loadHistory() {
    const tbody = document.getElementById('profileHistoryBody');
    const loading = document.getElementById('profileHistoryLoading');
    if (!tbody) return;
    if (loading) loading.style.display='block';

    try {
      const res = await fetch('/api/admin/history?limit=50', {
        headers:{'Authorization':'Bearer '+token}
      });
      const json = await res.json();
      if (loading) loading.style.display='none';

      if (!json.success || !json.data?.length) {
        tbody.innerHTML = '<tr><td colspan="4" style="text-align:center;color:var(--text-3);padding:2rem">Belum ada history</td></tr>';
        return;
      }
      allHistory = json.data;
      renderHistory(allHistory);
    } catch {
      if (loading) loading.style.display='none';
      tbody.innerHTML = '<tr><td colspan="4" style="text-align:center;color:var(--red)">Gagal memuat</td></tr>';
    }
  }

  function renderHistory(data) {
    const tbody = document.getElementById('profileHistoryBody');
    if (!tbody) return;
    const filtered = currentFilter === 'all' ? data : data.filter(g => g.status.includes(currentFilter));
    if (!filtered.length) {
      tbody.innerHTML = '<tr><td colspan="4" style="text-align:center;color:var(--text-3);padding:1.5rem">Tidak ada data</td></tr>';
      return;
    }
    tbody.innerHTML = filtered.map(g => `
      <tr>
        <td style="font-family:monospace;font-size:.75rem;color:var(--text-3)">${esc(g.id?.slice(0,8))}...</td>
        <td>${esc(g.maskedEmail||'-')}</td>
        <td><span class="status-badge ${g.status==='success'?'success':'failed'}">${esc(g.status)}</span></td>
        <td style="color:var(--text-3);font-size:.78rem">${fmt(g.timestamp)}</td>
      </tr>`).join('');
  }

  document.querySelectorAll('.filter-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.filter-tab').forEach(t=>t.classList.remove('active'));
      tab.classList.add('active');
      currentFilter = tab.dataset.filter;
      renderHistory(allHistory);
      Sound?.click();
    });
  });

  loadHistory();

  // Change password
  document.getElementById('changePassBtn')?.addEventListener('click', async () => {
    const newPass = document.getElementById('newPassInput')?.value?.trim();
    const confirm = document.getElementById('confirmPassInput')?.value?.trim();
    const errEl   = document.getElementById('passError');
    const btn     = document.getElementById('changePassBtn');

    if (!newPass || newPass.length < 6) { showErr(errEl, '⚠️ Password minimal 6 karakter.'); return; }
    if (newPass !== confirm) { showErr(errEl, '⚠️ Password tidak cocok.'); return; }
    showErr(errEl, null);
    btn.disabled=true; btn.classList.add('btn-loading');

    try {
      const user = firebase.auth().currentUser;
      await user.updatePassword(newPass);
      Toast?.success('✅ Password berhasil diubah!');
      document.getElementById('newPassInput').value='';
      document.getElementById('confirmPassInput').value='';
    } catch (e) {
      const msg = e.code==='auth/requires-recent-login' ? '⚠️ Silakan login ulang lalu coba lagi.' : '❌ '+(e.message||'Gagal ubah password.');
      showErr(errEl, msg);
    } finally { btn.disabled=false; btn.classList.remove('btn-loading'); }
  });

  // Logout
  document.getElementById('profileLogoutBtn')?.addEventListener('click', () => Auth?.logout());

  function showErr(el, msg) { if (!el) return; el.textContent=msg||''; el.classList.toggle('hidden',!msg); }
  function esc(s) { const d=document.createElement('div'); d.textContent=String(s||''); return d.innerHTML; }
  function fmt(ts) { if(!ts) return '-'; try{return new Date(ts).toLocaleDateString('id-ID',{day:'2-digit',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'})}catch{return ts;} }
});
