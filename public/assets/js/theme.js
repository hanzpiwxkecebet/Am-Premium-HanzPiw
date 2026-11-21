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
    this.updateToggleBtn();
  },

  toggle() {
    const next = this.current === Theme.DARK ? Theme.LIGHT : Theme.DARK;
    this.set(next);
  },

  updateToggleBtn() {
    const btn = document.getElementById('theme-toggle');
    if (!btn) return;
    btn.textContent = this.current === Theme.DARK ? '☀️' : '🌙';
    btn.title = this.current === Theme.DARK ? 'Switch to Light Mode' : 'Switch to Dark Mode';
  }
};

window.Theme = Theme;
