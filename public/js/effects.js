/* ============================================================
   AM Premium Free v2.0 - Effects JS
   Self-injecting global UI + all visual effects
   ============================================================ */

/* ─── Self-inject Global UI ────────────────────────────────── */
function injectGlobalUI() {
  // FAB
  if (!document.getElementById('fabWrap')) {
    const fab = document.createElement('div');
    fab.innerHTML = `
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
    document.body.appendChild(fab.firstElementChild);
  }

  // Color Picker
  if (!document.getElementById('colorPickerWrap')) {
    const cp = document.createElement('div');
    cp.innerHTML = `
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
    document.body.appendChild(cp.firstElementChild);
  }

  // Shortcuts Modal
  if (!document.getElementById('shortcutsModal')) {
    const sm = document.createElement('div');
    sm.innerHTML = `
      <div class="shortcuts-modal" id="shortcutsModal">
        <div class="shortcuts-box">
          <div class="shortcuts-title">⌨️ Keyboard Shortcuts</div>
          <div class="shortcut-row"><span class="shortcut-key"><span class="key">G</span></span><span class="shortcut-desc">Buka Generator</span></div>
          <div class="shortcut-row"><span class="shortcut-key"><span class="key">H</span></span><span class="shortcut-desc">Kembali ke Home</span></div>
          <div class="shortcut-row"><span class="shortcut-key"><span class="key">S</span></span><span class="shortcut-desc">Halaman Sosmed</span></div>
          <div class="shortcut-row"><span class="shortcut-key"><span class="key">P</span></span><span class="shortcut-desc">Profile (login)</span></div>
          <div class="shortcut-row"><span class="shortcut-key"><span class="key">?</span></span><span class="shortcut-desc">Tampilkan/sembunyikan ini</span></div>
          <div class="shortcut-row"><span class="shortcut-key"><span class="key">Esc</span></span><span class="shortcut-desc">Tutup modal</span></div>
          <div class="shortcut-row"><span class="shortcut-key"><span class="key">hanzpiw</span></span><span class="shortcut-desc">Easter egg 🎯</span></div>
          <button class="btn btn-outline btn-sm shortcuts-close" style="width:100%;margin-top:1rem">Tutup</button>
        </div>
      </div>`;
    document.body.appendChild(sm.firstElementChild);
  }

  // Shortcut hint (only homepage & non-mobile)
  if (!document.querySelector('.shortcut-hint') && window.innerWidth > 768) {
    const hint = document.createElement('div');
    hint.className = 'shortcut-hint';
    hint.innerHTML = 'Press <span class="key">?</span> for shortcuts';
    document.body.appendChild(hint);
  }

  // Confetti canvas
  if (!document.getElementById('confettiCanvas')) {
    const canvas = document.createElement('canvas');
    canvas.id = 'confettiCanvas';
    document.body.appendChild(canvas);
  }

  // Show profile in FAB if logged in
  if (typeof Auth !== 'undefined' && Auth.isLoggedIn()) {
    const fabProf = document.getElementById('fabProfile');
    if (fabProf) fabProf.style.display = 'flex';
  }
}

/* ─── Background Extras ────────────────────────────────────── */
function initBgExtras() {
  if (!document.querySelector('.bg-grid')) {
    const grid = document.createElement('div');
    grid.className = 'bg-grid';
    document.body.appendChild(grid);
  }
  if (!document.querySelector('.glow-orb')) {
    [1,2,3].forEach(n => {
      const orb = document.createElement('div');
      orb.className = `glow-orb glow-orb-${n}`;
      document.body.appendChild(orb);
    });
  }
}

/* ─── Cursor Trail ─────────────────────────────────────────── */
function initCursorTrail() {
  if (window.innerWidth < 768 || window.matchMedia('(pointer:coarse)').matches) return;
  const main = document.createElement('div');
  main.className = 'cursor-dot cursor-main';
  document.body.appendChild(main);

  const trails = Array.from({length:8}, (_, i) => {
    const d = document.createElement('div');
    d.className = 'cursor-dot cursor-trail';
    d.style.opacity = (0.5 - i*0.055).toString();
    d.style.width = (5 - i*0.4) + 'px';
    d.style.height = (5 - i*0.4) + 'px';
    document.body.appendChild(d);
    return d;
  });

  let mx=0, my=0;
  const positions = Array(8).fill({x:0,y:0});
  document.addEventListener('mousemove', e => { mx=e.clientX; my=e.clientY; });

  function animateTrail() {
    main.style.left = mx+'px'; main.style.top = my+'px';
    positions.unshift({x:mx,y:my}); positions.pop();
    trails.forEach((t, i) => {
      t.style.left = positions[i].x+'px';
      t.style.top  = positions[i].y+'px';
    });
    requestAnimationFrame(animateTrail);
  }
  requestAnimationFrame(animateTrail);
}

/* ─── Confetti ─────────────────────────────────────────────── */
function fireConfetti() {
  const canvas = document.getElementById('confettiCanvas');
  if (!canvas) return;
  canvas.width  = window.innerWidth;
  canvas.height = window.innerHeight;
  const ctx = canvas.getContext('2d');
  const colors = ['#ff0040','#0050ff','#8000ff','#00e5ff','#ff5500','#ffffff','#00ff88'];
  const pieces = Array.from({length:150}, () => ({
    x: Math.random()*canvas.width,
    y: -20,
    r: Math.random()*6+3,
    d: Math.random()*4+2,
    color: colors[Math.floor(Math.random()*colors.length)],
    tiltAngle: Math.random()*Math.PI*2,
    tiltSpeed: Math.random()*.07+.05,
    spin: Math.random()*360,
    spinSpeed: Math.random()*6-3,
    shape: Math.random()>.5?'circle':'rect'
  }));

  let frame=0;
  function draw() {
    ctx.clearRect(0,0,canvas.width,canvas.height);
    let active = false;
    pieces.forEach(p => {
      p.tiltAngle += p.tiltSpeed; p.spin += p.spinSpeed;
      p.y += (Math.cos(frame/10)+p.d)*1.2;
      p.x += Math.sin(frame/8)*1.5;
      if (p.y < canvas.height+20) active = true;
      const alpha = Math.max(0, 1 - p.y/(canvas.height*1.1));
      ctx.save(); ctx.translate(p.x,p.y); ctx.rotate(p.spin*Math.PI/180);
      ctx.fillStyle = p.color; ctx.globalAlpha = alpha;
      if (p.shape==='circle') { ctx.beginPath(); ctx.arc(0,0,p.r,0,Math.PI*2); ctx.fill(); }
      else { ctx.fillRect(-p.r,-p.r/2,p.r*2,p.r); }
      ctx.restore();
    });
    frame++;
    if (active && frame < 200) requestAnimationFrame(draw);
    else ctx.clearRect(0,0,canvas.width,canvas.height);
  }
  draw();
}

/* ─── Sound Effects ─────────────────────────────────────────── */
const Sound = (() => {
  let actx=null;
  let enabled = localStorage.getItem('amp_sound') !== 'false';

  function ctx() {
    if (!actx) actx = new (window.AudioContext||window.webkitAudioContext)();
    return actx;
  }

  function play(type) {
    if (!enabled) return;
    try {
      const ac = ctx(), now = ac.currentTime;
      const osc = ac.createOscillator(), gain = ac.createGain();
      osc.connect(gain); gain.connect(ac.destination);
      const map = {
        click:   () => { osc.frequency.setValueAtTime(700,now); osc.frequency.exponentialRampToValueAtTime(350,now+.08); gain.gain.setValueAtTime(.07,now); gain.gain.exponentialRampToValueAtTime(.001,now+.08); osc.start(now); osc.stop(now+.08); },
        send:    () => { osc.type='sine'; osc.frequency.setValueAtTime(440,now); osc.frequency.exponentialRampToValueAtTime(660,now+.15); gain.gain.setValueAtTime(.1,now); gain.gain.exponentialRampToValueAtTime(.001,now+.2); osc.start(now); osc.stop(now+.2); },
        success: () => { osc.type='sine'; const freqs=[523,659,784,1047]; freqs.forEach((f,i)=>osc.frequency.setValueAtTime(f,now+i*.1)); gain.gain.setValueAtTime(.12,now); gain.gain.exponentialRampToValueAtTime(.001,now+.55); osc.start(now); osc.stop(now+.55); },
        error:   () => { osc.type='sawtooth'; osc.frequency.setValueAtTime(200,now); osc.frequency.exponentialRampToValueAtTime(80,now+.2); gain.gain.setValueAtTime(.06,now); gain.gain.exponentialRampToValueAtTime(.001,now+.2); osc.start(now); osc.stop(now+.2); },
      };
      map[type]?.();
    } catch {}
  }

  return {
    click:     () => play('click'),
    send:      () => play('send'),
    success:   () => play('success'),
    error:     () => play('error'),
    toggle:    () => { enabled=!enabled; localStorage.setItem('amp_sound',enabled); return enabled; },
    isEnabled: () => enabled
  };
})();

/* ─── Easter Egg ────────────────────────────────────────────── */
function initEasterEgg() {
  const keyword = 'hanzpiw';
  let typed='', locked=false;

  document.addEventListener('keydown', e => {
    if (['INPUT','TEXTAREA','SELECT'].includes(e.target.tagName)) return;
    typed += e.key.toLowerCase();
    if (typed.length > keyword.length) typed = typed.slice(-keyword.length);
    if (typed === keyword && !locked) {
      locked = true;
      showEasterEgg();
      setTimeout(() => { locked=false; typed=''; }, 5000);
    }
  });

  function showEasterEgg() {
    const el = document.createElement('div');
    el.className = 'easter-egg-overlay';
    el.innerHTML = `<div style="text-align:center">
      <div class="easter-egg-text">⚡ HANZPIW ⚡</div>
      <div style="color:var(--text-2);font-size:1rem;margin-top:1rem;font-family:var(--font-head);letter-spacing:3px">OWNER FOUND 🎯</div>
      <div style="color:var(--text-3);font-size:.85rem;margin-top:.5rem">AM Premium Free v2.0 by HanzPiw Official</div>
    </div>`;
    document.body.appendChild(el);
    requestAnimationFrame(() => el.classList.add('active'));
    fireConfetti();
    Sound.success();
    setTimeout(() => { el.style.opacity='0'; el.style.transition='opacity .5s'; setTimeout(()=>el.remove(),500); }, 3500);
  }
}

/* ─── Keyboard Shortcuts ────────────────────────────────────── */
function initKeyboardShortcuts() {
  const modal = document.getElementById('shortcutsModal');
  const routes = { g:'/generator', h:'/', s:'/sosmed', p:Auth?.isLoggedIn()?'/profile':'/login' };

  document.addEventListener('keydown', e => {
    if (['INPUT','TEXTAREA','SELECT'].includes(e.target.tagName)) return;
    if (e.key === 'Escape') { modal?.classList.remove('open'); return; }
    if (e.key === '?') { modal?.classList.toggle('open'); Sound.click(); return; }
    const route = routes[e.key];
    if (route) { e.preventDefault(); Sound.click(); window.location.href=route; }
  });

  document.querySelector('.shortcuts-close')?.addEventListener('click', () => {
    modal?.classList.remove('open');
  });
  modal?.addEventListener('click', e => { if(e.target===modal) modal.classList.remove('open'); });
}

/* ─── Card Tilt ─────────────────────────────────────────────── */
function initCardTilt() {
  if (window.matchMedia('(pointer:coarse)').matches) return;
  document.querySelectorAll('.glass-card, .step-card, .stat-card, .contact-card, .sosmed-card').forEach(card => {
    card.addEventListener('mousemove', e => {
      const r = card.getBoundingClientRect();
      const x = (e.clientX-r.left)/r.width-.5;
      const y = (e.clientY-r.top)/r.height-.5;
      card.style.transition = 'none';
      card.style.transform = `perspective(700px) rotateY(${x*7}deg) rotateX(${-y*7}deg) translateZ(6px)`;
    });
    card.addEventListener('mouseleave', () => {
      card.style.transition = 'transform .45s ease';
      card.style.transform = '';
    });
  });
}

/* ─── FAB Logic ─────────────────────────────────────────────── */
function initFAB() {
  const fab = document.getElementById('fabWrap');
  if (!fab) return;
  fab.querySelector('.fab-main')?.addEventListener('click', e => {
    e.stopPropagation();
    fab.classList.toggle('open');
    Sound.click();
  });
  document.addEventListener('click', e => { if(!fab.contains(e.target)) fab.classList.remove('open'); });
}

/* ─── Color Picker ──────────────────────────────────────────── */
const colorThemes = {
  red:    {'--red':'#ff0040','--blue':'#0050ff','--purple':'#8000ff'},
  blue:   {'--red':'#0050ff','--blue':'#00e5ff','--purple':'#4400ff'},
  green:  {'--red':'#00c853','--blue':'#00e5ff','--purple':'#64dd17'},
  purple: {'--red':'#8000ff','--blue':'#e040fb','--purple':'#aa00ff'},
  gold:   {'--red':'#ff8f00','--blue':'#ffd600','--purple':'#ff6d00'},
};

function applyThemeColor(name) {
  const t = colorThemes[name]; if (!t) return;
  Object.entries(t).forEach(([k,v]) => document.documentElement.style.setProperty(k,v));
  localStorage.setItem('amp_color_theme', name);
  document.querySelectorAll('.color-swatch').forEach(s => s.classList.toggle('active', s.dataset.color===name));
}

function initColorPicker() {
  const wrap = document.getElementById('colorPickerWrap');
  if (!wrap) return;
  wrap.querySelector('.color-picker-toggle')?.addEventListener('click', e => { e.stopPropagation(); wrap.classList.toggle('open'); Sound.click(); });
  wrap.querySelectorAll('.color-swatch').forEach(s => {
    s.addEventListener('click', () => { applyThemeColor(s.dataset.color); Sound.click(); wrap.classList.remove('open'); });
  });
  document.addEventListener('click', e => { if(!wrap.contains(e.target)) wrap.classList.remove('open'); });
  const saved = localStorage.getItem('amp_color_theme') || 'red';
  applyThemeColor(saved);
}

/* ─── Auto Dark/Light by Hour ───────────────────────────────── */
function initAutoTheme() {
  if (localStorage.getItem('amp_theme')) return;
  const h = new Date().getHours();
  document.documentElement.setAttribute('data-theme', (h<6||h>=19)?'dark':'light');
}

/* ─── Milestone Banner ──────────────────────────────────────── */
function checkMilestone(total) {
  const milestones = [100,500,1000,5000,10000];
  const last = parseInt(localStorage.getItem('amp_last_milestone')||'0');
  const hit = milestones.filter(m=>total>=m&&m>last).pop();
  if (!hit) return;
  localStorage.setItem('amp_last_milestone', hit);
  const b = document.createElement('div');
  b.className = 'milestone-banner';
  b.textContent = `🎉 ${hit.toLocaleString()} Generate Tercapai! Terima kasih!`;
  document.body.appendChild(b);
  setTimeout(()=>b.remove(), 5000);
}

/* ─── Skeleton Helpers ──────────────────────────────────────── */
function skeletonStart(containerSelector) {
  const c = document.querySelector(containerSelector);
  if (!c) return;
  c.innerHTML = `
    <div style="padding:1rem;display:flex;flex-direction:column;gap:.75rem">
      <div class="skeleton skeleton-title"></div>
      <div class="skeleton skeleton-text w-80"></div>
      <div class="skeleton skeleton-text w-60"></div>
      <div class="skeleton skeleton-text w-40"></div>
    </div>`;
}

/* ─── Typed.js Init ─────────────────────────────────────────── */
function initTyped() {
  const el = document.getElementById('typedHero');
  if (!el || typeof Typed==='undefined') return;
  new Typed('#typedHero', {
    strings: ['Unlock Your Motion.','Create Without Limits.','Generator Premium Gratis.','by HanzPiw Official.'],
    typeSpeed: 55, backSpeed: 30, backDelay: 2000, loop: true, cursorChar: '|',
  });
}

/* ─── Scroll Reveal ─────────────────────────────────────────── */
function initReveal() {
  const els = document.querySelectorAll('.glass-card,.step-card,.stat-card,.contact-card,.tut-step,.faq-item,.sosmed-card,.reveal');
  if (!els.length) return;
  const obs = new IntersectionObserver(entries => {
    entries.forEach((entry,i) => {
      if (entry.isIntersecting) {
        setTimeout(() => {
          entry.target.style.opacity='1';
          entry.target.style.transform='none';
        }, i*70);
        obs.unobserve(entry.target);
      }
    });
  }, {threshold:.1, rootMargin:'0px 0px -30px 0px'});
  els.forEach(el => {
    el.style.opacity='0';
    el.style.transform='translateY(18px)';
    el.style.transition='opacity .6s ease,transform .6s ease';
    obs.observe(el);
  });
}

/* ─── Click Sounds on Buttons ───────────────────────────────── */
function initButtonSounds() {
  document.addEventListener('click', e => {
    if (e.target.closest('button,.btn,.nav-link,.faq-question')) Sound.click();
  });
}

/* ─── Init All ──────────────────────────────────────────────── */
document.addEventListener('DOMContentLoaded', () => {
  initAutoTheme();
  injectGlobalUI();
  initBgExtras();
  initCursorTrail();
  initEasterEgg();
  initButtonSounds();
  setTimeout(() => {
    initFAB();
    initColorPicker();
    initKeyboardShortcuts();
    initCardTilt();
    initTyped();
    initReveal();
  }, 300);
});

/* ─── Exports ───────────────────────────────────────────────── */
window.Sound         = Sound;
window.fireConfetti  = fireConfetti;
window.applyThemeColor = applyThemeColor;
window.checkMilestone  = checkMilestone;
window.skeletonStart   = skeletonStart;
