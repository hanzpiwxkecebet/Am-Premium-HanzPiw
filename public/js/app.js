/* ============================================================
   AM Premium Free by HanzPiw - Core App JS
   ============================================================ */

const App = (() => {
  /* ─── Constants ─────────────────────────────────────────── */
  const API = '/api';
  const STORAGE_KEYS = { theme: 'amp_theme', welcome: 'amp_welcomed' };

  /* ─── Loading Screen ────────────────────────────────────── */
  function initLoading() {
    const screen = document.getElementById('loadingScreen');
    if (!screen) return;
    // Hide after 2.2s (loading bar animation completes at 2s)
    setTimeout(() => {
      screen.classList.add('hidden');
      setTimeout(() => screen.remove(), 700);
    }, 2200);
  }

  /* ─── Theme ─────────────────────────────────────────────── */
  function initTheme() {
    const saved = localStorage.getItem(STORAGE_KEYS.theme) || 'dark';
    applyTheme(saved);
    document.querySelectorAll('[data-theme-toggle]').forEach(btn => {
      btn.addEventListener('click', toggleTheme);
      updateThemeBtn(btn, saved);
    });
  }

  function applyTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem(STORAGE_KEYS.theme, theme);
    document.querySelectorAll('[data-theme-toggle]').forEach(btn => updateThemeBtn(btn, theme));
  }

  function toggleTheme() {
    const current = document.documentElement.getAttribute('data-theme') || 'dark';
    applyTheme(current === 'dark' ? 'light' : 'dark');
  }

  function updateThemeBtn(btn, theme) {
    btn.textContent = theme === 'dark' ? '☀️' : '🌙';
    btn.setAttribute('title', theme === 'dark' ? 'Switch to Light Mode' : 'Switch to Dark Mode');
    btn.setAttribute('aria-label', btn.getAttribute('title'));
  }

  /* ─── Navbar ─────────────────────────────────────────────── */
  function initNavbar() {
    const navbar = document.querySelector('.navbar');
    const hamburger = document.querySelector('.nav-hamburger');
    const mobileNav = document.querySelector('.nav-mobile');
    if (!navbar) return;

    // Scroll effect
    const onScroll = () => navbar.classList.toggle('scrolled', window.scrollY > 20);
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();

    // Hamburger toggle
    if (hamburger && mobileNav) {
      hamburger.addEventListener('click', () => {
        hamburger.classList.toggle('active');
        mobileNav.classList.toggle('open');
      });
      // Close on nav link click
      mobileNav.querySelectorAll('.nav-link').forEach(link => {
        link.addEventListener('click', () => {
          hamburger.classList.remove('active');
          mobileNav.classList.remove('open');
        });
      });
    }

    // Active link
    const path = window.location.pathname;
    document.querySelectorAll('.nav-link').forEach(link => {
      const href = link.getAttribute('href');
      if (href && (path === href || path.startsWith(href + '/'))) {
        link.classList.add('active');
      }
    });
  }

  /* ─── Welcome Modal (per-day) ────────────────────────────── */
  function initWelcomeModal() {
    const overlay = document.getElementById('welcomeModal');
    if (!overlay) return;
    const today = new Date().toISOString().slice(0, 10);
    if (localStorage.getItem(STORAGE_KEYS.welcome) === today) {
      overlay.classList.add('hidden');
      return;
    }
    overlay.classList.remove('hidden');
    function dismiss() {
      overlay.classList.add('hidden');
      localStorage.setItem(STORAGE_KEYS.welcome, today);
    }
    document.getElementById('btnJoined')?.addEventListener('click', dismiss);
    overlay.addEventListener('click', e => { if (e.target === overlay) dismiss(); });
  }

  /* ─── Announcements ──────────────────────────────────────── */
  async function loadAnnouncements() {
    const bar = document.getElementById('announcementBar');
    if (!bar) return;
    try {
      const res = await fetch(`${API}/stats/announcements`);
      const json = await res.json();
      if (json.success && json.data?.length > 0) {
        const ann = json.data[0];
        bar.innerHTML = `<span>📢 <strong>${escHtml(ann.title)}</strong>${ann.description ? ' — ' + escHtml(ann.description) : ''}${ann.link ? ` <a href="${escHtml(ann.link)}" target="_blank" rel="noopener">Selengkapnya →</a>` : ''}</span>`;
        bar.classList.remove('hidden');
      }
    } catch { /* silent */ }
  }

  /* ─── Stats ──────────────────────────────────────────────── */
  async function loadStats() {
    const els = {
      total:   document.getElementById('statTotal'),
      success: document.getElementById('statSuccess'),
      failed:  document.getElementById('statFailed'),
      api:     document.getElementById('statApi'),
    };
    if (!Object.values(els).some(Boolean)) return;
    try {
      const res = await fetch(`${API}/stats`);
      const json = await res.json();
      if (!json.success) return;
      const d = json.data;
      if (els.total)   animateCount(els.total, d.total || 0);
      if (els.success) animateCount(els.success, d.success || 0);
      if (els.failed)  animateCount(els.failed, d.failed || 0);
      if (els.api) {
        els.api.textContent = d.apiOnline ? 'Online' : 'Offline';
        els.api.className = 'stat-dot' + (d.apiOnline ? '' : ' offline');
      }
    } catch { /* silent */ }
  }

  function animateCount(el, target) {
    const start = 0;
    const duration = 1200;
    const startTime = performance.now();
    function update(now) {
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      el.textContent = Math.floor(eased * target).toLocaleString();
      if (progress < 1) requestAnimationFrame(update);
    }
    requestAnimationFrame(update);
  }

  /* ─── Particles ──────────────────────────────────────────── */
  function initParticles() {
    const container = document.querySelector('.particles');
    if (!container) return;
    const colors = ['#ff0040','#0050ff','#8000ff','#ff5500','#00e5ff'];
    const count = window.innerWidth < 600 ? 18 : 36;
    for (let i = 0; i < count; i++) {
      const p = document.createElement('div');
      p.className = 'particle';
      const color = colors[Math.floor(Math.random() * colors.length)];
      const size = Math.random() * 2.5 + 1;
      const isLine = Math.random() > .75;
      p.style.cssText = `
        left:${Math.random()*100}%;
        width:${isLine ? size*.5 : size}px;
        height:${isLine ? size*6 : size}px;
        background:${color};
        box-shadow:0 0 ${size*4}px ${color};
        animation-duration:${9+Math.random()*14}s;
        animation-delay:${Math.random()*12}s;
        opacity:${.25+Math.random()*.55};
        border-radius:${isLine ? '1px' : '50%'};
      `;
      container.appendChild(p);
    }
  }

  /* ─── Background Video ───────────────────────────────────── */
  function initBgVideo() {
    const video = document.getElementById('bgVideo');
    if (!video) return;
    video.addEventListener('error', () => {
      video.closest('.bg-video-wrap')?.remove();
    });
  }

  /* ─── Toast ──────────────────────────────────────────────── */
  const Toast = {
    container: null,
    init() {
      this.container = document.getElementById('toastContainer');
      if (!this.container) {
        this.container = document.createElement('div');
        this.container.id = 'toastContainer';
        document.body.appendChild(this.container);
      }
    },
    show(msg, type = 'info', duration = 4000) {
      if (!this.container) this.init();
      const icons = { success: '✅', error: '❌', warning: '⚠️', info: 'ℹ️' };
      const titles = { success: 'Berhasil', error: 'Gagal', warning: 'Peringatan', info: 'Info' };
      const el = document.createElement('div');
      el.className = `toast ${type}`;
      el.style.position = 'relative';
      el.innerHTML = `
        <span class="toast-icon">${icons[type]}</span>
        <div class="toast-content">
          <div class="toast-title">${titles[type]}</div>
          <div class="toast-msg">${escHtml(String(msg))}</div>
        </div>
        <button class="toast-close" aria-label="Close">×</button>
        <div class="toast-progress" style="animation-duration:${duration}ms"></div>
      `;
      el.querySelector('.toast-close').addEventListener('click', () => dismiss(el));
      this.container.appendChild(el);
      const timer = setTimeout(() => dismiss(el), duration);
      el._timer = timer;

      function dismiss(e) {
        clearTimeout(e._timer);
        e.classList.add('removing');
        setTimeout(() => e.remove(), 300);
      }
      return el;
    },
    success: (m, d) => Toast.show(m, 'success', d),
    error:   (m, d) => Toast.show(m, 'error', d),
    warning: (m, d) => Toast.show(m, 'warning', d),
    info:    (m, d) => Toast.show(m, 'info', d),
  };

  /* ─── Copy to Clipboard ──────────────────────────────────── */
  async function copyText(text) {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
      } else {
        const ta = document.createElement('textarea');
        ta.value = text;
        ta.style.cssText = 'position:fixed;opacity:0;pointer-events:none';
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        ta.remove();
      }
      return true;
    } catch { return false; }
  }

  /* ─── Web Share ──────────────────────────────────────────── */
  async function shareText(title, text, url) {
    try {
      if (navigator.share) {
        await navigator.share({ title, text, url: url || window.location.href });
        return true;
      }
    } catch { /* user cancelled */ }
    return false;
  }

  /* ─── Helpers ────────────────────────────────────────────── */
  function escHtml(str) {
    const d = document.createElement('div');
    d.textContent = str;
    return d.innerHTML;
  }

  function formatDate(ts) {
    if (!ts) return '-';
    const d = new Date(ts);
    return d.toLocaleDateString('id-ID', { day:'2-digit', month:'short', year:'numeric', hour:'2-digit', minute:'2-digit' });
  }

  function debounce(fn, ms) {
    let t;
    return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
  }

  /* ─── FAQ Accordion ──────────────────────────────────────── */
  function initFaq() {
    document.querySelectorAll('.faq-question').forEach(btn => {
      btn.addEventListener('click', () => {
        const item = btn.closest('.faq-item');
        const isOpen = item.classList.contains('open');
        document.querySelectorAll('.faq-item.open').forEach(i => i.classList.remove('open'));
        if (!isOpen) item.classList.add('open');
      });
    });
  }

  /* ─── Page Transition ────────────────────────────────────── */
  function initPageTransitions() {
    document.querySelectorAll('a[href]').forEach(link => {
      const href = link.getAttribute('href');
      if (!href || href.startsWith('#') || href.startsWith('http') || href.startsWith('mailto') || href.startsWith('tel')) return;
      link.addEventListener('click', e => {
        e.preventDefault();
        const trans = document.querySelector('.page-transition');
        if (trans) {
          trans.classList.add('active');
          setTimeout(() => { window.location.href = href; }, 200);
        } else {
          window.location.href = href;
        }
      });
    });
  }

  /* ─── Init ───────────────────────────────────────────────── */
  /* ─── Scroll Reveal ──────────────────────────────────── */
  function initReveal() {
    const els = document.querySelectorAll('.reveal, .reveal-left, .reveal-right, .glass-card, .step-card, .contact-card, .tut-step, .faq-item, .sosmed-card, .stat-card');
    if (!els.length) return;
    const obs = new IntersectionObserver((entries) => {
      entries.forEach((entry, i) => {
        if (entry.isIntersecting) {
          setTimeout(() => {
            entry.target.classList.add('visible');
            entry.target.style.opacity = '1';
            entry.target.style.transform = 'none';
          }, i * 80);
          obs.unobserve(entry.target);
        }
      });
    }, { threshold: 0.1, rootMargin: '0px 0px -40px 0px' });
    els.forEach((el, i) => {
      if (!el.classList.contains('reveal') && !el.classList.contains('reveal-left') && !el.classList.contains('reveal-right')) {
        el.style.opacity = '0';
        el.style.transform = 'translateY(20px)';
        el.style.transition = 'opacity .6s ease, transform .6s ease';
      }
      obs.observe(el);
    });
  }

  /* ─── Extra BG elements ───────────────────────────────── */
  function initBgExtras() {
    // Add grid
    if (!document.querySelector('.bg-grid')) {
      const grid = document.createElement('div');
      grid.className = 'bg-grid';
      document.body.appendChild(grid);
    }
    // Add glow orbs
    if (!document.querySelector('.glow-orb')) {
      [1,2,3].forEach(n => {
        const orb = document.createElement('div');
        orb.className = `glow-orb glow-orb-${n}`;
        document.body.appendChild(orb);
      });
    }
  }

  function init() {
    Toast.init();
    initTheme();
    initNavbar();
    initLoading();
    initWelcomeModal();
    initParticles();
    initBgVideo();
    initBgExtras();
    loadAnnouncements();
    loadStats();
    initFaq();
    initPageTransitions();
    setTimeout(initReveal, 400);
  }

  document.addEventListener('DOMContentLoaded', init);

  /* ─── Public API ─────────────────────────────────────────── */
  return { Toast, copyText, shareText, escHtml, formatDate, debounce, loadStats, API };
})();

window.App = App;
window.Toast = App.Toast;
