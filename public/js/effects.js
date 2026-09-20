/* ============================================================
   AM Premium Free v2.0 - Effects JS
   ============================================================ */

/* ─── Self-inject Global UI ────────────────────────────────── */
function injectGlobalUI() {
  if (!document.getElementById('fabWrap')) {
    const el = document.createElement('div');
    el.innerHTML = `
      <div class="fab-wrap" id="fabWrap">
        <div class="fab-items">
          <a href="https://t.me/abouthanzpiww" target="_blank" rel="noopener" class="fab-item tg">
            <span class="fab-item-icon">✈️</span> Telegram
          </a>
          <a href="https://wa.me/6285191782145" target="_blank" rel="noopener" class="fab-item wa">
            <span class="fab-item-icon">💬</span> WhatsApp
          </a>
          <a href="/profile" class="fab-item" id="fabProfile" style="display:none">
            <span class="fab-item-icon" style="background:var(--grad)">👤</span> Profile
          </a>
        </div>
        <button class="fab-main" aria-label="Quick actions">✦</button>
      </div>`;
    document.body.appendChild(el.firstElementChild);
  }

  if (!document.getElementById('colorPickerWrap')) {
    const el = document.createElement('div');
    el.innerHTML = `
      <div class="color-picker-wrap" id="colorPickerWrap">
        <div class="color-swatches">
          <div class="color-swatch red" data-color="red" title="Red Neon"></div>
          <div class="color-swatch blue" data-color="blue" title="Blue Neon"></div>
          <div class="color-swatch green" data-color="green" title="Green Neon"></div>
          <div class="color-swatch purple" data-color="purple" title="Purple Neon"></div>
          <div class="color-swatch gold" data-color="gold" title="Gold Neon"></div>
        </div>
        <button class="color-picker-toggle" aria-label="Change theme color">🎨</button>
      </div>`;
    document.body.appendChild(el.firstElementChild);
  }

  if (!document.getElementById('confettiCanvas')) {
    const c = document.createElement('canvas');
    c.id = 'confettiCanvas';
    document.body.appendChild(c);
  }

  if (typeof Auth !== 'undefined' && Auth.isLoggedIn()) {
    const p = document.getElementById('fabProfile');
    if (p) p.style.display = 'flex';
  }
}

/* ─── Background Extras ─────────────────────────────────────── */
function initBgExtras() {
  if (!document.querySelector('.bg-grid')) {
    const g = document.createElement('div');
    g.className = 'bg-grid';
    document.body.appendChild(g);
  }
  if (!document.querySelector('.glow-orb')) {
    [1,2,3].forEach(n => {
      const o = document.createElement('div');
      o.className = `glow-orb glow-orb-${n}`;
      document.body.appendChild(o);
    });
  }
}

/* ─── Sound Effects ─────────────────────────────────────────── */
const Sound = (() => {
  let actx = null;
  let enabled = localStorage.getItem('amp_sound') !== 'false';

  // Unlock AudioContext on first user gesture (browser requirement)
  function unlockAudio() {
    if (actx && actx.state === 'running') return;
    try {
      if (!actx) actx = new (window.AudioContext || window.webkitAudioContext)();
      if (actx.state === 'suspended') actx.resume();
    } catch (e) {}
  }
  ['click','touchstart','keydown'].forEach(ev => {
    document.addEventListener(ev, unlockAudio, { passive: true });
  });

  function play(type) {
    if (!enabled) return;
    try {
      if (!actx) actx = new (window.AudioContext || window.webkitAudioContext)();
      if (actx.state === 'suspended') actx.resume();
      const now = actx.currentTime;
      const osc = actx.createOscillator();
      const gain = actx.createGain();
      osc.connect(gain);
      gain.connect(actx.destination);

      if (type === 'click') {
        osc.type = 'sine';
        osc.frequency.setValueAtTime(700, now);
        osc.frequency.exponentialRampToValueAtTime(350, now + 0.08);
        gain.gain.setValueAtTime(0.07, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.08);
        osc.start(now); osc.stop(now + 0.08);
      } else if (type === 'send') {
        osc.type = 'sine';
        osc.frequency.setValueAtTime(440, now);
        osc.frequency.exponentialRampToValueAtTime(660, now + 0.15);
        gain.gain.setValueAtTime(0.1, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.2);
        osc.start(now); osc.stop(now + 0.2);
      } else if (type === 'success') {
        osc.type = 'sine';
        [523, 659, 784, 1047].forEach((freq, i) => {
          osc.frequency.setValueAtTime(freq, now + i * 0.1);
        });
        gain.gain.setValueAtTime(0.12, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.55);
        osc.start(now); osc.stop(now + 0.55);
      } else if (type === 'error') {
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(200, now);
        osc.frequency.exponentialRampToValueAtTime(80, now + 0.2);
        gain.gain.setValueAtTime(0.06, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.2);
        osc.start(now); osc.stop(now + 0.2);
      }
    } catch (e) {}
  }

  return {
    click:     () => play('click'),
    send:      () => play('send'),
    success:   () => play('success'),
    error:     () => play('error'),
    toggle:    () => { enabled = !enabled; localStorage.setItem('amp_sound', enabled); return enabled; },
    isEnabled: () => enabled
  };
})();

/* ─── Cursor Trail ─────────────────────────────────────────── */
function initCursorTrail() {
  if (window.innerWidth < 768 || window.matchMedia('(pointer:coarse)').matches) return;
  const main = document.createElement('div');
  main.className = 'cursor-dot cursor-main';
  document.body.appendChild(main);

  const trails = Array.from({ length: 8 }, (_, i) => {
    const d = document.createElement('div');
    d.className = 'cursor-dot cursor-trail';
    d.style.cssText = `opacity:${0.5 - i * 0.055};width:${5 - i * 0.4}px;height:${5 - i * 0.4}px`;
    document.body.appendChild(d);
    return d;
  });

  let mx = 0, my = 0;
  const pos = Array(8).fill({ x: 0, y: 0 });
  document.addEventListener('mousemove', e => { mx = e.clientX; my = e.clientY; });

  (function loop() {
    main.style.left = mx + 'px'; main.style.top = my + 'px';
    pos.unshift({ x: mx, y: my }); pos.pop();
    trails.forEach((t, i) => { t.style.left = pos[i].x + 'px'; t.style.top = pos[i].y + 'px'; });
    requestAnimationFrame(loop);
  })();
}

/* ─── Confetti ─────────────────────────────────────────────── */
function fireConfetti() {
  const canvas = document.getElementById('confettiCanvas');
  if (!canvas) return;
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
  const ctx = canvas.getContext('2d');
  const colors = ['#ff0040','#0050ff','#8000ff','#00e5ff','#ff5500','#fff','#00ff88'];
  const pieces = Array.from({ length: 150 }, () => ({
    x: Math.random() * canvas.width, y: -20,
    r: Math.random() * 6 + 3, d: Math.random() * 4 + 2,
    color: colors[Math.floor(Math.random() * colors.length)],
    tiltAngle: 0, tiltSpeed: Math.random() * 0.07 + 0.05,
    spin: Math.random() * 360, spinSpeed: Math.random() * 6 - 3,
    shape: Math.random() > 0.5 ? 'circle' : 'rect'
  }));
  let frame = 0;
  (function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    let active = false;
    pieces.forEach(p => {
      p.tiltAngle += p.tiltSpeed; p.spin += p.spinSpeed;
      p.y += (Math.cos(frame / 10) + p.d) * 1.2;
      p.x += Math.sin(frame / 8) * 1.5;
      if (p.y < canvas.height + 20) active = true;
      const alpha = Math.max(0, 1 - p.y / (canvas.height * 1.1));
      ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.spin * Math.PI / 180);
      ctx.fillStyle = p.color; ctx.globalAlpha = alpha;
      if (p.shape === 'circle') { ctx.beginPath(); ctx.arc(0, 0, p.r, 0, Math.PI * 2); ctx.fill(); }
      else ctx.fillRect(-p.r, -p.r / 2, p.r * 2, p.r);
      ctx.restore();
    });
    frame++;
    if (active && frame < 200) requestAnimationFrame(draw);
    else ctx.clearRect(0, 0, canvas.width, canvas.height);
  })();
}

/* ─── Card Tilt ─────────────────────────────────────────────── */
function initCardTilt() {
  if (window.matchMedia('(pointer:coarse)').matches) return;
  document.querySelectorAll('.glass-card,.step-card,.stat-card,.contact-card,.sosmed-card').forEach(card => {
    card.addEventListener('mousemove', e => {
      const r = card.getBoundingClientRect();
      const x = (e.clientX - r.left) / r.width - 0.5;
      const y = (e.clientY - r.top) / r.height - 0.5;
      card.style.transition = 'none';
      card.style.transform = `perspective(700px) rotateY(${x * 7}deg) rotateX(${-y * 7}deg) translateZ(6px)`;
    });
    card.addEventListener('mouseleave', () => {
      card.style.transition = 'transform .45s ease';
      card.style.transform = '';
    });
  });
}

/* ─── FAB ───────────────────────────────────────────────────── */
function initFAB() {
  const fab = document.getElementById('fabWrap');
  if (!fab) return;
  fab.querySelector('.fab-main')?.addEventListener('click', e => {
    e.stopPropagation();
    fab.classList.toggle('open');
    Sound.click();
  });
  document.addEventListener('click', e => { if (!fab.contains(e.target)) fab.classList.remove('open'); });
}

/* ─── Color Picker ─────────────────────────────────────────── */
const colorThemes = {
  red:    { '--red':'#ff0040','--blue':'#0050ff','--purple':'#8000ff' },
  blue:   { '--red':'#0050ff','--blue':'#00e5ff','--purple':'#4400ff' },
  green:  { '--red':'#00c853','--blue':'#00e5ff','--purple':'#64dd17' },
  purple: { '--red':'#8000ff','--blue':'#e040fb','--purple':'#aa00ff' },
  gold:   { '--red':'#ff8f00','--blue':'#ffd600','--purple':'#ff6d00' },
};

function applyThemeColor(name) {
  const t = colorThemes[name]; if (!t) return;
  Object.entries(t).forEach(([k, v]) => document.documentElement.style.setProperty(k, v));
  localStorage.setItem('amp_color_theme', name);
  document.querySelectorAll('.color-swatch').forEach(s => s.classList.toggle('active', s.dataset.color === name));
}

function initColorPicker() {
  const wrap = document.getElementById('colorPickerWrap');
  if (!wrap) return;
  wrap.querySelector('.color-picker-toggle')?.addEventListener('click', e => {
    e.stopPropagation(); wrap.classList.toggle('open'); Sound.click();
  });
  wrap.querySelectorAll('.color-swatch').forEach(s => {
    s.addEventListener('click', () => { applyThemeColor(s.dataset.color); Sound.click(); wrap.classList.remove('open'); });
  });
  document.addEventListener('click', e => { if (!wrap.contains(e.target)) wrap.classList.remove('open'); });
  applyThemeColor(localStorage.getItem('amp_color_theme') || 'red');
}

/* ─── Auto Dark/Light by Hour ───────────────────────────────── */
function initAutoTheme() {
  if (localStorage.getItem('amp_theme')) return;
  const h = new Date().getHours();
  document.documentElement.setAttribute('data-theme', (h < 6 || h >= 19) ? 'dark' : 'light');
}

/* ─── Milestone Banner ──────────────────────────────────────── */
function checkMilestone(total) {
  const milestones = [100, 500, 1000, 5000, 10000];
  const last = parseInt(localStorage.getItem('amp_last_milestone') || '0');
  const hit = milestones.filter(m => total >= m && m > last).pop();
  if (!hit) return;
  localStorage.setItem('amp_last_milestone', hit);
  const b = document.createElement('div');
  b.className = 'milestone-banner';
  b.textContent = `🎉 ${hit.toLocaleString()} Generate Tercapai! Terima kasih!`;
  document.body.appendChild(b);
  setTimeout(() => b.remove(), 5000);
}

/* ─── Skeleton Helper ───────────────────────────────────────── */
function skeletonStart(sel) {
  const c = document.querySelector(sel);
  if (!c) return;
  c.innerHTML = `<div style="padding:1rem;display:flex;flex-direction:column;gap:.75rem">
    <div class="skeleton skeleton-title"></div>
    <div class="skeleton skeleton-text w-80"></div>
    <div class="skeleton skeleton-text w-60"></div>
    <div class="skeleton skeleton-text w-40"></div>
  </div>`;
}

/* ─── Typed.js ──────────────────────────────────────────────── */
function initTyped() {
  const el = document.getElementById('typedHero');
  if (!el || typeof Typed === 'undefined') return;
  new Typed('#typedHero', {
    strings: ['Unlock Your Motion.','Create Without Limits.','Generator Premium Gratis.','by HanzPiw Official.'],
    typeSpeed: 55, backSpeed: 30, backDelay: 2000, loop: true, cursorChar: '|',
  });
}

/* ─── Scroll Reveal ─────────────────────────────────────────── */
function initReveal() {
  const els = document.querySelectorAll('.glass-card,.step-card,.stat-card,.contact-card,.tut-step,.faq-item,.sosmed-card');
  if (!els.length) return;
  const obs = new IntersectionObserver(entries => {
    entries.forEach((entry, i) => {
      if (entry.isIntersecting) {
        setTimeout(() => { entry.target.style.opacity = '1'; entry.target.style.transform = 'none'; }, i * 70);
        obs.unobserve(entry.target);
      }
    });
  }, { threshold: 0.1, rootMargin: '0px 0px -30px 0px' });
  els.forEach(el => {
    el.style.opacity = '0';
    el.style.transform = 'translateY(18px)';
    el.style.transition = 'opacity .6s ease, transform .6s ease';
    obs.observe(el);
  });
}

/* ─── Button Click Sounds ───────────────────────────────────── */
function initButtonSounds() {
  document.addEventListener('click', e => {
    if (e.target.closest('button, .btn, .nav-link, .faq-question')) Sound.click();
  });
}

/* ─── Init ──────────────────────────────────────────────────── */
document.addEventListener('DOMContentLoaded', () => {
  initAutoTheme();
  injectGlobalUI();
  initBgExtras();
  initCursorTrail();
  initButtonSounds();
  setTimeout(() => {
    initFAB();
    initColorPicker();
    initCardTilt();
    initTyped();
    initReveal();
  }, 300);
});

window.Sound           = Sound;
window.fireConfetti    = fireConfetti;
window.applyThemeColor = applyThemeColor;
window.checkMilestone  = checkMilestone;
window.skeletonStart   = skeletonStart;
