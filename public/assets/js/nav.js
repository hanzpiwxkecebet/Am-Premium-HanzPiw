// Bottom Navigation & Desktop Sidebar Manager
const Nav = {
  items: [
    { id: 'home', label: 'Home', icon: '<i class="ic ic-home"></i>', href: '/dashboard' },
    { id: 'generator', label: 'Generator', icon: '<i class="ic ic-bolt"></i>', href: '/generator' },
    { id: 'history', label: 'History', icon: '<i class="ic ic-clock"></i>', href: '/history' },
    { id: 'redeem', label: 'Redeem', icon: '<i class="ic ic-ticket"></i>', href: '/redeem' },
    { id: 'updates', label: 'Updates', icon: '<i class="ic ic-bell"></i>', href: '/updates' },
    { id: 'chat', label: 'Chat', icon: '<i class="ic ic-chat"></i>', href: '/chat' },
    { id: 'profile', label: 'Profile', icon: '<i class="ic ic-user"></i>', href: '/profile' },
  ],

  activeId: null,

  /** Foto profil terakhir (disimpan Auth.syncAvatar) menggantikan ikon Profile */
  avatar() {
    try { return (window.Cache && window.Cache.get('avatar')) || ''; } catch (e) { return ''; }
  },

  iconFor(item) {
    const a = item.id === 'profile' ? this.avatar() : '';
    if (a && /^data:image\//.test(a)) return `<span class="nav-avatar"><img src="${a}" alt=""></span>`;
    return item.icon;
  },

  /** Dipanggil Auth begitu foto profil berubah / termuat */
  setAvatar() {
    if (this.activeId === null) return;
    if (this.avatar() === this._shown) return; // tidak berubah: tidak perlu render ulang
    this.render(this.activeId);
  },

  init(activeId) {
    this.activeId = activeId;
    this.render(activeId);
  },

  render(activeId) {
    const nav = document.getElementById('bottom-nav');
    if (!nav) return;
    this._shown = this.avatar();
    nav.innerHTML = this.items.map(item => `
      <a href="${item.href}" class="nav-item ${item.id === activeId ? 'active' : ''}" data-id="${item.id}">
        <span class="nav-icon">${this.iconFor(item)}</span>
        <span class="nav-label">${item.label}</span>
      </a>
    `).join('');
  },

  renderDesktopSidebar(activeId, container) {
    if (!container) return;
    container.innerHTML = `
      <div class="sidebar-brand">
        <span class="brand-mark" role="img" aria-label="HanzPiw"></span>
        <span class="gradient-text fw-bold">AM</span>
        <span class="text-secondary ms-1 fw-bold">Generator</span>
        <span class="badge badge-premium ms-2" style="font-size:0.6rem">V2.0</span>
      </div>
      <nav class="sidebar-nav">
        ${this.items.map(item => `
          <a href="${item.href}" class="sidebar-item ${item.id === activeId ? 'active' : ''}">
            <span class="nav-icon">${this.iconFor(item)}</span>
            <span>${item.label}</span>
          </a>
        `).join('')}
      </nav>
    `;
  }
};

window.Nav = Nav;
