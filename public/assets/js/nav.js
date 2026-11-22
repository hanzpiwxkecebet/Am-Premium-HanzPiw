// Bottom Navigation & Desktop Sidebar Manager
const Nav = {
  items: [
    { id: 'home', label: 'Home', icon: '<i class="ic ic-home"></i>', href: '/pages/dashboard.html' },
    { id: 'generator', label: 'Generator', icon: '<i class="ic ic-bolt"></i>', href: '/pages/generator.html' },
    { id: 'history', label: 'History', icon: '<i class="ic ic-clock"></i>', href: '/pages/history.html' },
    { id: 'redeem', label: 'Redeem', icon: '<i class="ic ic-ticket"></i>', href: '/pages/redeem.html' },
    { id: 'updates', label: 'Updates', icon: '<i class="ic ic-bell"></i>', href: '/pages/updates.html' },
    { id: 'profile', label: 'Profile', icon: '<i class="ic ic-user"></i>', href: '/pages/profile.html' },
  ],

  init(activeId) {
    this.render(activeId);
  },

  render(activeId) {
    const nav = document.getElementById('bottom-nav');
    if (!nav) return;
    nav.innerHTML = this.items.map(item => `
      <a href="${item.href}" class="nav-item ${item.id === activeId ? 'active' : ''}" data-id="${item.id}">
        <span class="nav-icon">${item.icon}</span>
        <span class="nav-label">${item.label}</span>
      </a>
    `).join('');
  },

  renderDesktopSidebar(activeId, container) {
    if (!container) return;
    container.innerHTML = `
      <div class="sidebar-brand">
        <span class="gradient-text fw-bold">AM</span>
        <span class="text-secondary ms-1 fw-bold">Generator</span>
        <span class="badge badge-premium ms-2" style="font-size:0.6rem">V2.0</span>
      </div>
      <nav class="sidebar-nav">
        ${this.items.map(item => `
          <a href="${item.href}" class="sidebar-item ${item.id === activeId ? 'active' : ''}">
            <span class="nav-icon">${item.icon}</span>
            <span>${item.label}</span>
          </a>
        `).join('')}
      </nav>
    `;
  }
};

window.Nav = Nav;
