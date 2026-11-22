// Theme Manager
const Theme = {
  DARK: 'dark',
  LIGHT: 'light',

  _get() {
    try { return localStorage.getItem('theme'); } catch (e) { return null; }
  },

  _save(theme) {
    try { localStorage.setItem('theme', theme); } catch (e) { /* storage diblokir (mode privat) */ }
  },

  init() {
    const saved = this._get() === 'light' ? Theme.LIGHT : Theme.DARK;
    this.set(saved, false);
    this.updateToggleBtn();
  },

  get current() {
    return document.documentElement.getAttribute('data-theme') || Theme.DARK;
  },

  set(theme, animate = true) {
    if (animate && document.body) {
      document.body.style.transition = 'background-color 0.3s ease, color 0.3s ease';
    }
    document.documentElement.setAttribute('data-theme', theme);
    this._save(theme);
    this._applyChrome(document, theme);
    // Halaman ini bisa berada di dalam iframe shell: samakan tema & warna bar browser di shell juga
    try { if (window.top !== window) { window.top.document.documentElement.setAttribute('data-theme', theme); this._applyChrome(window.top.document, theme); } } catch (e) { /* beda origin */ }
    this.updateToggleBtn();
  },

  // Warna address bar / status bar (PWA & Chrome Android) mengikuti tema
  _applyChrome(doc, theme) {
    try {
      let m = doc.querySelector('meta[name="theme-color"]');
      if (!m) { m = doc.createElement('meta'); m.name = 'theme-color'; doc.head.appendChild(m); }
      m.content = theme === Theme.LIGHT ? '#e7e7e7' : '#0f0f0f';
    } catch (e) { /* abaikan */ }
  },

  toggle() {
    const next = this.current === Theme.DARK ? Theme.LIGHT : Theme.DARK;
    this.set(next);
  },

  updateToggleBtn() {
    const btn = document.getElementById('theme-toggle');
    if (!btn) return;
    btn.innerHTML = this.current === Theme.DARK ? '<i class="ic ic-sun"></i>' : '<i class="ic ic-moon"></i>';
    btn.title = this.current === Theme.DARK ? 'Switch to Light Mode' : 'Switch to Dark Mode';
  }
};

window.Theme = Theme;
