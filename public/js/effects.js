/* ============================================================
   AM Premium Free v2.0 - Effects JS
   ============================================================ */

/* ─── Cursor Trail ─────────────────────────────────────────── */
function initCursorTrail() {
  if (window.innerWidth < 768 || window.matchMedia('(pointer:coarse)').matches) return;
  const main = document.createElement('div');
  main.className = 'cursor-dot cursor-main';
  document.body.appendChild(main);

  const trails = Array.from({length:8}, (_, i) => {
    const d = document.createElement('div');
    d.className = 'cursor-dot cursor-trail';
    d.style.opacity = (0.5 - i*0.06).toString();
    document.body.appendChild(d);
    return d;
  });

  let mx=0, my=0, positions = Array(8).fill({x:0,y:0});

  document.addEventListener('mousemove', e => { mx=e.clientX; my=e.clientY; });

  function animateTrail() {
    main.style.left = mx+'px'; main.style.top = my+'px';
    positions = [{x:mx,y:my}, ...positions.slice(0,7)];
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
  const canvas = document.getElementById('confettiCanvas') || (() => {
    const c = document.createElement('canvas');
    c.id = 'confettiCanvas';
    document.body.appendChild(c);
    return c;
  })();
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
  const ctx = canvas.getContext('2d');
  const colors = ['#ff0040','#0050ff','#8000ff','#00e5ff','#ff5500','#ffffff','#00ff88'];
  const pieces = Array.from({length:150}, () => ({
    x: Math.random()*canvas.width,
    y: -10,
    r: Math.random()*6+3,
    d: Math.random()*5+2,
    color: colors[Math.floor(Math.random()*colors.length)],
    tilt: Math.random()*10-10,
    tiltAngle: 0,
    tiltSpeed: Math.random()*.07+.05,
    spin: Math.random()*360,
    spinSpeed: Math.random()*6-3,
    shape: Math.random() > .5 ? 'circle' : 'rect'
  }));

  let frame=0, running=true;
  function draw() {
    if (!running) { ctx.clearRect(0,0,canvas.width,canvas.height); return; }
    ctx.clearRect(0,0,canvas.width,canvas.height);
    pieces.forEach(p => {
      p.tiltAngle += p.tiltSpeed; p.spin += p.spinSpeed;
      p.y += (Math.cos(frame/10)+p.d)*1.2;
      p.x += Math.sin(frame/8)*1.5;
      p.tilt = Math.sin(p.tiltAngle)*12;
      ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.spin*Math.PI/180);
      ctx.fillStyle = p.color; ctx.globalAlpha = Math.max(0, 1 - p.y/canvas.height*1.2);
      if (p.shape === 'circle') { ctx.beginPath(); ctx.arc(0,0,p.r,0,Math.PI*2); ctx.fill(); }
      else { ctx.fillRect(-p.r,-p.r/2,p.r*2,p.r); }
      ctx.restore();
    });
    frame++;
    if (frame < 180) requestAnimationFrame(draw);
    else { running=false; ctx.clearRect(0,0,canvas.width,canvas.height); }
  }
  draw();
}

/* ─── Sound Effects ─────────────────────────────────────────── */
const Sound = (() => {
  let ctx=null, enabled=true;
  const storageKey = 'amp_sound';
  enabled = localStorage.getItem(storageKey) !== 'false';

  function getCtx() {
    if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
    return ctx;
  }

  function play(type) {
    if (!enabled) return;
    try {
      const ac = getCtx();
      const osc = ac.createOscillator();
      const gain = ac.createGain();
      osc.connect(gain); gain.connect(ac.destination);
      const now = ac.currentTime;

      if (type === 'click') {
        osc.frequency.setValueAtTime(800, now);
        osc.frequency.exponentialRampToValueAtTime(400, now+.08);
        gain.gain.setValueAtTime(.08, now);
        gain.gain.exponentialRampToValueAtTime(.001, now+.08);
        osc.start(now); osc.stop(now+.08);
      } else if (type === 'success') {
        osc.type = 'sine';
        [523,659,784,1047].forEach((freq, i) => {
          const t = now + i*.1;
          osc.frequency.setValueAtTime(freq, t);
        });
        gain.gain.setValueAtTime(.12, now);
        gain.gain.exponentialRampToValueAtTime(.001, now+.5);
        osc.start(now); osc.stop(now+.5);
      } else if (type === 'error') {
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(200, now);
        osc.frequency.exponentialRampToValueAtTime(100, now+.2);
        gain.gain.setValueAtTime(.06, now);
        gain.gain.exponentialRampToValueAtTime(.001, now+.2);
        osc.start(now); osc.stop(now+.2);
      } else if (type === 'send') {
        osc.type = 'sine';
        osc.frequency.setValueAtTime(440, now);
        osc.frequency.exponentialRampToValueAtTime(660, now+.15);
        gain.gain.setValueAtTime(.1, now);
        gain.gain.exponentialRampToValueAtTime(.001, now+.2);
        osc.start(now); osc.stop(now+.2);
      }
    } catch {}
  }

  return {
    click:   () => play('click'),
    success: () => play('success'),
    error:   () => play('error'),
    send:    () => play('send'),
    toggle:  () => { enabled=!enabled; localStorage.setItem(storageKey, enabled); return enabled; },
    isEnabled: () => enabled
  };
})();

/* ─── Easter Egg ────────────────────────────────────────────── */
function initEasterEgg() {
  const keyword = 'hanzpiw';
  let typed = '';
  let triggered = false;

  document.addEventListener('keydown', e => {
    typed += e.key.toLowerCase();
    if (typed.length > keyword.length) typed = typed.slice(-keyword.length);
    if (typed === keyword && !triggered) {
      triggered = true;
      showEasterEgg();
      setTimeout(() => { triggered=false; typed=''; }, 4000);
    }
  });

  function showEasterEgg() {
    const overlay = document.createElement('div');
    overlay.className = 'easter-egg-overlay';
    overlay.innerHTML = `
      <div style="text-align:center">
        <div class="easter-egg-text">⚡ HANZPIW ⚡</div>
        <div style="color:var(--text-2);font-size:1rem;margin-top:1rem;font-family:var(--font-head);letter-spacing:3px">OWNER FOUND 🎯</div>
        <div style="color:var(--text-3);font-size:.8rem;margin-top:.5rem">by HanzPiw Official</div>
      </div>
    `;
    document.body.appendChild(overlay);
    setTimeout(() => overlay.classList.add('active'), 10);
    fireConfetti();
    Sound.success();
    setTimeout(() => {
      overlay.style.opacity='0';
      setTimeout(() => overlay.remove(), 500);
    }, 3500);
  }
}

/* ─── Keyboard Shortcuts ────────────────────────────────────── */
function initKeyboardShortcuts() {
  const modal = document.getElementById('shortcutsModal');

  const shortcuts = {
    'g': () => window.location.href='/generator',
    'h': () => window.location.href='/',
    's': () => window.location.href='/sosmed',
    'p': () => { if(Auth?.isLoggedIn()) window.location.href='/profile'; },
    'Escape': () => modal?.classList.remove('open'),
    '?': () => modal?.classList.toggle('open'),
  };

  document.addEventListener('keydown', e => {
    if (['INPUT','TEXTAREA','SELECT'].includes(e.target.tagName)) return;
    const fn = shortcuts[e.key];
    if (fn) { e.preventDefault(); fn(); Sound.click(); }
  });

  modal?.querySelector('.shortcuts-close')?.addEventListener('click', () => {
    modal.classList.remove('open');
  });
}

/* ─── Card Tilt Effect ──────────────────────────────────────── */
function initCardTilt() {
  if (window.matchMedia('(pointer:coarse)').matches) return;
  document.querySelectorAll('.glass-card, .step-card, .stat-card, .contact-card').forEach(card => {
    card.classList.add('tilt-card');
    card.addEventListener('mousemove', e => {
      const rect = card.getBoundingClientRect();
      const x = (e.clientX - rect.left) / rect.width - .5;
      const y = (e.clientY - rect.top) / rect.height - .5;
      card.style.transform = `perspective(600px) rotateY(${x*8}deg) rotateX(${-y*8}deg) translateZ(4px)`;
    });
    card.addEventListener('mouseleave', () => {
      card.style.transform = '';
      card.style.transition = 'transform .4s ease';
    });
    card.addEventListener('mouseenter', () => {
      card.style.transition = 'none';
    });
  });
}

/* ─── Floating Action Button ────────────────────────────────── */
function initFAB() {
  const fab = document.getElementById('fabWrap');
  if (!fab) return;
  const toggle = fab.querySelector('.fab-main');
  toggle?.addEventListener('click', () => {
    fab.classList.toggle('open');
    Sound.click();
  });
  document.addEventListener('click', e => {
    if (!fab.contains(e.target)) fab.classList.remove('open');
  });
}

/* ─── Color Picker ──────────────────────────────────────────── */
const themes = {
  red:    { '--red':'#ff0040', '--blue':'#0050ff', '--purple':'#8000ff' },
  blue:   { '--red':'#0050ff', '--blue':'#00e5ff', '--purple':'#4400ff' },
  green:  { '--red':'#00c853', '--blue':'#00e5ff', '--purple':'#64dd17' },
  purple: { '--red':'#8000ff', '--blue':'#e040fb', '--purple':'#aa00ff' },
  gold:   { '--red':'#ff8f00', '--blue':'#ffd600', '--purple':'#ff6d00' },
};

function applyThemeColor(name) {
  const t = themes[name];
  if (!t) return;
  const root = document.documentElement;
  Object.entries(t).forEach(([k, v]) => root.style.setProperty(k, v));
  localStorage.setItem('amp_color_theme', name);
  document.querySelectorAll('.color-swatch').forEach(s => s.classList.toggle('active', s.dataset.color===name));
}

function initColorPicker() {
  const wrap = document.getElementById('colorPickerWrap');
  if (!wrap) return;
  const toggle = wrap.querySelector('.color-picker-toggle');
  toggle?.addEventListener('click', () => { wrap.classList.toggle('open'); Sound.click(); });
  wrap.querySelectorAll('.color-swatch').forEach(s => {
    s.addEventListener('click', () => { applyThemeColor(s.dataset.color); Sound.click(); });
  });
  document.addEventListener('click', e => { if (!wrap.contains(e.target)) wrap.classList.remove('open'); });
  const saved = localStorage.getItem('amp_color_theme');
  if (saved) applyThemeColor(saved);
}

/* ─── Auto Dark/Light by Time ───────────────────────────────── */
function initAutoTheme() {
  if (localStorage.getItem('amp_theme')) return; // user has manual preference
  const hour = new Date().getHours();
  const isDark = hour < 6 || hour >= 19;
  document.documentElement.setAttribute('data-theme', isDark ? 'dark' : 'light');
}

/* ─── Milestone Banner ──────────────────────────────────────── */
function checkMilestone(total) {
  const milestones = [100, 500, 1000, 5000, 10000];
  const key = 'amp_last_milestone';
  const last = parseInt(localStorage.getItem(key) || '0');
  const hit = milestones.filter(m => total >= m && m > last).pop();
  if (!hit) return;
  localStorage.setItem(key, hit);
  const banner = document.createElement('div');
  banner.className = 'milestone-banner';
  banner.textContent = `🎉 ${hit.toLocaleString()} Generate Tercapai! Terima kasih!`;
  document.body.appendChild(banner);
  setTimeout(() => banner.remove(), 5000);
}

/* ─── Typed.js Hero ─────────────────────────────────────────── */
function initTyped() {
  const el = document.getElementById('typedHero');
  if (!el || typeof Typed === 'undefined') return;
  new Typed('#typedHero', {
    strings: [
      'Unlock Your Motion.',
      'Create Without Limits.',
      'Generator Premium Gratis.',
      'by HanzPiw Official.',
    ],
    typeSpeed: 55,
    backSpeed: 30,
    backDelay: 2000,
    loop: true,
    cursorChar: '|',
  });
}

/* ─── Init All ──────────────────────────────────────────────── */
document.addEventListener('DOMContentLoaded', () => {
  initAutoTheme();
  initCursorTrail();
  initEasterEgg();
  initKeyboardShortcuts();
  initFAB();
  initColorPicker();
  initCardTilt();
  setTimeout(initTyped, 500);

  // Add click sound to all buttons
  document.addEventListener('click', e => {
    if (e.target.closest('button, .btn, .nav-link')) Sound.click();
  });
});

window.Sound = Sound;
window.fireConfetti = fireConfetti;
window.applyThemeColor = applyThemeColor;
window.checkMilestone = checkMilestone;
