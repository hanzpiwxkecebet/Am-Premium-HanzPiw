// Theme Manager
const Theme = {
  DARK: 'dark',
  LIGHT: 'light',

  init() {
    const saved = localStorage.getItem('theme') || Theme.DARK;
    this.set(saved, false);
    this.updateToggleBtn();
  },

  get current() {
    return document.documentElement.getAttribute('data-theme') || Theme.DARK;
  },

  set(theme, animate = true) {
    if (animate) {
      document.body.style.transition = 'background-color 0.3s ease, color 0.3s ease';
    }
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('theme', theme);
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
