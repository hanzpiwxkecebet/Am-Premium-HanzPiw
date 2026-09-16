/* ============================================================
   AM Premium Free by HanzPiw - Admin Dashboard JS
   ============================================================ */

const Admin = (() => {
  const API = '/api/admin';
  let adminToken = null;
  let statsChart = null;
  let donutChart = null;
  let refreshInterval = null;

  /* ─── Auth ───────────────────────────────────────────────── */
  function getToken() {
    return adminToken || sessionStorage.getItem('amp_admin_token');
  }

  function setToken(token) {
    adminToken = token;
    sessionStorage.setItem('amp_admin_token', token);
  }

  function clearToken() {
    adminToken = null;
    sessionStorage.removeItem('amp_admin_token');
  }

  /* ─── API Fetch ──────────────────────────────────────────── */
  async function apiFetch(path, opts = {}) {
    const token = getToken();
    const res = await fetch(`${API}${path}`, {
      ...opts,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
        ...(opts.headers || {})
      },
      body: opts.body ? JSON.stringify(opts.body) : undefined
    });
    if (res.status === 401 || res.status === 403) {
      clearToken();
      window.location.href = '/admin/login';
      throw new Error('Unauthorized');
    }
    return res.json();
  }

  /* ─── Navigation ─────────────────────────────────────────── */
  function initNav() {
    document.querySelectorAll('.admin-nav-item').forEach(item => {
      item.addEventListener('click', () => {
        const target = item.dataset.section;
        if (!target) return;
        // Update active nav
        document.querySelectorAll('.admin-nav-item').forEach(i => i.classList.remove('active'));
        item.classList.add('active');
        // Show section
        document.querySelectorAll('.admin-section').forEach(s => s.classList.remove('active'));
        const section = document.getElementById(`section-${target}`);
        if (section) {
          section.classList.add('active');
          document.getElementById('topbarTitle').textContent = item.querySelector('.admin-nav-label')?.textContent || 'Dashboard';
        }
        // Load section data
        loadSection(target);
        // Close mobile sidebar
        document.querySelector('.admin-sidebar')?.classList.remove('open');
      });
    });

    // Sidebar toggle
    document.getElementById('sidebarToggle')?.addEventListener('click', () => {
      document.querySelector('.admin-sidebar')?.classList.toggle('open');
    });

    // Logout
    document.getElementById('logoutBtn')?.addEventListener('click', handleLogout);
  }

  /* ─── Section Loader ─────────────────────────────────────── */
  function loadSection(section) {
    switch (section) {
      case 'overview':   loadOverview(); break;
      case 'history':    loadHistory(); break;
      case 'config':     loadConfig(); break;
      case 'logs':       loadLogs(); break;
      case 'broadcast':  /* static form */ break;
    }
  }

  /* ─── Overview ───────────────────────────────────────────── */
  async function loadOverview() {
    try {
      const json = await apiFetch('/overview');
      if (!json.success) return;
      const { stats, apiStatus } = json.data;

      setEl('ovTotal',   (stats.total   || 0).toLocaleString());
      setEl('ovSuccess', (stats.success || 0).toLocaleString());
      setEl('ovFailed',  (stats.failed  || 0).toLocaleString());
      setEl('ovToday',   (stats.today   || 0).toLocaleString());
      setEl('ovApiStatus', apiStatus?.online ? '🟢 Online' : '🔴 Offline');

      renderDonut(stats.success || 0, stats.failed || 0);
    } catch (e) {
      console.error('[Admin] loadOverview error:', e.message);
    }
  }

  function setEl(id, value) {
    const el = document.getElementById(id);
    if (el) el.textContent = value;
  }

  function renderDonut(success, failed) {
    const ctx = document.getElementById('donutChart');
    if (!ctx) return;
    if (donutChart) donutChart.destroy();
    donutChart = new Chart(ctx, {
      type: 'doughnut',
      data: {
        labels: ['Success', 'Failed'],
        datasets: [{
          data: [success, failed],
          backgroundColor: ['rgba(0,255,136,0.7)', 'rgba(255,0,60,0.7)'],
          borderColor: ['#00ff88', '#ff003c'],
          borderWidth: 2
        }]
      },
      options: {
        responsive: true,
        plugins: {
          legend: { labels: { color: '#9090aa', font: { size: 12 } } }
        },
        cutout: '70%'
      }
    });
  }

  function renderLineChart(labels, data) {
    const ctx = document.getElementById('lineChart');
    if (!ctx) return;
    if (statsChart) statsChart.destroy();
    statsChart = new Chart(ctx, {
      type: 'line',
      data: {
        labels,
        datasets: [{
          label: 'Requests',
          data,
          borderColor: '#ff003c',
          backgroundColor: 'rgba(255,0,60,0.1)',
          tension: 0.4,
          fill: true,
          pointBackgroundColor: '#ff003c',
          pointRadius: 3
        }]
      },
      options: {
        responsive: true,
        plugins: { legend: { labels: { color: '#9090aa' } } },
        scales: {
          x: { ticks: { color: '#9090aa' }, grid: { color: 'rgba(255,255,255,0.05)' } },
          y: { ticks: { color: '#9090aa' }, grid: { color: 'rgba(255,255,255,0.05)' }, beginAtZero: true }
        }
      }
    });
  }

  /* ─── History ────────────────────────────────────────────── */
  async function loadHistory() {
    const tbody = document.getElementById('adminHistoryBody');
    const loading = document.getElementById('historyLoading');
    if (!tbody) return;
    if (loading) loading.style.display = 'block';
    try {
      const json = await apiFetch('/history?limit=100');
      if (loading) loading.style.display = 'none';
      if (!json.success || !json.data?.length) {
        tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;color:var(--text-3);padding:2rem">Belum ada data history</td></tr>';
        return;
      }
      tbody.innerHTML = json.data.map(g => `
        <tr>
          <td style="font-family:monospace;font-size:.78rem;color:var(--text-3)">${escHtml(g.id?.slice(0,8))}...</td>
          <td>${escHtml(g.maskedEmail || '-')}</td>
          <td><span class="status-badge ${g.status === 'success' ? 'success' : 'failed'}">${escHtml(g.status)}</span></td>
          <td style="color:var(--text-3);font-size:.82rem">${formatDate(g.timestamp)}</td>
          <td style="font-family:monospace;font-size:.78rem;color:var(--text-3)">${escHtml(g.ip || '-')}</td>
        </tr>`).join('');
    } catch (e) {
      if (loading) loading.style.display = 'none';
      tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;color:var(--red)">Gagal memuat data</td></tr>';
    }
  }

  /* ─── Config ─────────────────────────────────────────────── */
  async function loadConfig() {
    try {
      const json = await apiFetch('/config');
      if (!json.success) return;
      const d = json.data;
      const maintToggle = document.getElementById('maintenanceToggle');
      if (maintToggle) maintToggle.checked = !!d.maintenance;
      const cooldownInput = document.getElementById('cooldownInput');
      if (cooldownInput) cooldownInput.value = d.cooldown || 30;
      const rateLimitInput = document.getElementById('rateLimitInput');
      if (rateLimitInput) rateLimitInput.value = d.rateLimit?.max || 10;
      const apiUrlInput = document.getElementById('apiBaseUrl');
      if (apiUrlInput) apiUrlInput.value = d.apiBaseUrl || '';
    } catch {}
  }

  async function saveMaintenance(enabled) {
    try {
      const json = await apiFetch('/maintenance', { method: 'POST', body: { enabled } });
      Toast.show(json.message || 'Tersimpan', json.success ? 'success' : 'error');
    } catch { Toast.show('Gagal menyimpan', 'error'); }
  }

  async function saveConfig() {
    const cooldown = parseInt(document.getElementById('cooldownInput')?.value || '30');
    const rateLimitMax = parseInt(document.getElementById('rateLimitInput')?.value || '10');
    const apiBaseUrl = document.getElementById('apiBaseUrl')?.value?.trim() || '';
    try {
      const json = await apiFetch('/config', { method: 'POST', body: { cooldown, rateLimitMax, apiBaseUrl } });
      Toast.show(json.message || 'Tersimpan', json.success ? 'success' : 'error');
    } catch { Toast.show('Gagal menyimpan', 'error'); }
  }

  /* ─── Broadcast ──────────────────────────────────────────── */
  async function sendBroadcast() {
    const title = document.getElementById('bcTitle')?.value?.trim();
    const description = document.getElementById('bcDesc')?.value?.trim();
    const link = document.getElementById('bcLink')?.value?.trim();
    const type = document.getElementById('bcType')?.value || 'banner';
    if (!title) { Toast.show('Title diperlukan', 'warning'); return; }
    try {
      const json = await apiFetch('/broadcast', { method: 'POST', body: { title, description, link, type } });
      Toast.show(json.message || 'Announcement dibuat', json.success ? 'success' : 'error');
      if (json.success) {
        document.getElementById('bcTitle').value = '';
        document.getElementById('bcDesc').value = '';
        document.getElementById('bcLink').value = '';
      }
    } catch { Toast.show('Gagal mengirim', 'error'); }
  }

  /* ─── Logs ───────────────────────────────────────────────── */
  async function loadLogs() {
    const container = document.getElementById('logsContainer');
    if (!container) return;
    container.innerHTML = '<div style="color:var(--text-3);text-align:center;padding:2rem">Memuat logs...</div>';
    try {
      const json = await apiFetch('/logs?limit=100');
      if (!json.success || !json.data?.length) {
        container.innerHTML = '<div style="color:var(--text-3);text-align:center;padding:2rem">Belum ada log</div>';
        return;
      }
      container.innerHTML = json.data.map(l => `
        <div class="log-entry">
          <span class="log-level ${l.level}">${(l.level || 'info').toUpperCase()}</span>
          <span class="log-ts">${formatDate(l.timestamp)}</span>
          <span class="log-msg">${escHtml(l.message || '')}</span>
        </div>`).join('');
    } catch {
      container.innerHTML = '<div style="color:var(--red);text-align:center;padding:2rem">Gagal memuat logs</div>';
    }
  }

  /* ─── Logout ─────────────────────────────────────────────── */
  function handleLogout() {
    if (!confirm('Yakin ingin logout?')) return;
    clearToken();
    // Firebase signout
    try {
      if (window.firebase?.auth) firebase.auth().signOut();
    } catch {}
    window.location.href = '/admin/login';
  }

  /* ─── Helpers ────────────────────────────────────────────── */
  function escHtml(str) {
    const d = document.createElement('div');
    d.textContent = String(str || '');
    return d.innerHTML;
  }

  function formatDate(ts) {
    if (!ts) return '-';
    try {
      const d = new Date(ts);
      return d.toLocaleDateString('id-ID', { day:'2-digit', month:'short', year:'numeric', hour:'2-digit', minute:'2-digit' });
    } catch { return ts; }
  }

  /* ─── Toast ──────────────────────────────────────────────── */
  const Toast = {
    show(msg, type = 'info') {
      if (window.Toast) window.Toast.show(msg, type);
      else alert(msg);
    }
  };

  /* ─── Init Dashboard ─────────────────────────────────────── */
  function initDashboard() {
    const token = getToken();
    if (!token) { window.location.href = '/admin/login'; return; }

    initNav();
    loadOverview();

    // Default section
    document.querySelector('.admin-nav-item[data-section="overview"]')?.classList.add('active');
    document.getElementById('section-overview')?.classList.add('active');

    // Auto-refresh overview
    refreshInterval = setInterval(loadOverview, 30000);

    // Config event listeners
    document.getElementById('maintenanceToggle')?.addEventListener('change', e => saveMaintenance(e.target.checked));
    document.getElementById('saveConfigBtn')?.addEventListener('click', saveConfig);
    document.getElementById('sendBroadcastBtn')?.addEventListener('click', sendBroadcast);
    document.getElementById('refreshLogsBtn')?.addEventListener('click', loadLogs);

    // Display admin info
    const email = sessionStorage.getItem('amp_admin_email') || 'Admin';
    setEl('adminEmail', email);
    setEl('adminName', email.split('@')[0]);
  }

  /* ─── Init Login ─────────────────────────────────────────── */
  function initLogin() {
    // Firebase Auth UI is loaded via FirebaseUI in the HTML
    // This handles the manual/fallback login form
    const form = document.getElementById('loginForm');
    if (!form) return;

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const email = document.getElementById('loginEmail')?.value?.trim();
      const pass  = document.getElementById('loginPass')?.value;
      if (!email || !pass) return;

      const btn = document.getElementById('loginBtn');
      if (btn) { btn.disabled = true; btn.classList.add('btn-loading'); }

      try {
        // Try Firebase Auth
        if (window.firebase?.auth) {
          const cred = await firebase.auth().signInWithEmailAndPassword(email, pass);
          const token = await cred.user.getIdToken();
          setToken(token);
          sessionStorage.setItem('amp_admin_email', email);
          window.location.href = '/admin/dashboard';
        } else {
          Toast.show('Firebase tidak dikonfigurasi. Gunakan ADMIN_SECRET.', 'warning');
        }
      } catch (err) {
        Toast.show(err.message || 'Login gagal. Periksa email dan password.', 'error');
        if (btn) { btn.disabled = false; btn.classList.remove('btn-loading'); }
      }
    });
  }

  document.addEventListener('DOMContentLoaded', () => {
    if (document.getElementById('adminDashboard')) initDashboard();
    if (document.getElementById('loginForm')) initLogin();
  });

  return { setToken, getToken, clearToken, loadOverview };
})();

window.Admin = Admin;
