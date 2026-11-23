// Animated Particles Background
function initParticles() {
  const canvas = document.getElementById('particles-canvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');

  let particles = [];
  const RGB_COLORS = ['255, 0, 64', '255, 154, 0', '0, 255, 106', '0, 217, 255', '59, 75, 255', '196, 0, 255'];
  const isRgb = () => document.documentElement.classList.contains('dash-rgb');
  let animId;

  function resize() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
  }

  function createParticle() {
    return {
      x: Math.random() * canvas.width,
      y: Math.random() * canvas.height,
      vx: (Math.random() - 0.5) * 0.4,
      vy: (Math.random() - 0.5) * 0.4,
      size: Math.random() * 1.5 + 0.5,
      opacity: Math.random() * 0.4 + 0.1,
      color: Math.random() > 0.5 ? '190, 200, 255' : '140, 160, 255',
      rgb: RGB_COLORS[(Math.random() * RGB_COLORS.length) | 0],
      pulse: Math.random() * Math.PI * 2,
    };
  }

  function init() {
    resize();
    const isMobile = window.innerWidth < 768;
    const count = Math.min(isMobile ? 28 : 70, Math.floor((canvas.width * canvas.height) / (isMobile ? 22000 : 15000)));
    particles = Array.from({ length: count }, createParticle);
  }

  function drawConnections() {
    if (window.innerWidth < 768) return; // garis penghubung = O(n²), terlalu berat untuk HP
    for (let i = 0; i < particles.length; i++) {
      for (let j = i + 1; j < particles.length; j++) {
        const dx = particles[i].x - particles[j].x;
        const dy = particles[i].y - particles[j].y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < 120) {
          const alpha = (1 - dist / 120) * 0.08;
          ctx.strokeStyle = isRgb() ? `rgba(${particles[i].rgb}, ${alpha * 3})` : `rgba(203, 203, 203, ${alpha})`;
          ctx.lineWidth = 0.5;
          ctx.beginPath();
          ctx.moveTo(particles[i].x, particles[i].y);
          ctx.lineTo(particles[j].x, particles[j].y);
          ctx.stroke();
        }
      }
    }
  }

  let frame = 0;
  let running = true;
  function animate(ts) {
    if (!running) return;
    // HP: render tiap 2 frame (~30fps) — terlihat sama, jauh lebih hemat
    if (window.innerWidth < 768 && (frame++ & 1)) { animId = requestAnimationFrame(animate); return; }
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    drawConnections();

    for (const p of particles) {
      p.pulse += 0.02;
      const pOpacity = p.opacity + Math.sin(p.pulse) * 0.1;

      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fillStyle = isRgb() ? `rgba(${p.rgb}, ${Math.min(1, pOpacity * 2.2)})` : `rgba(${p.color}, ${pOpacity})`;
      ctx.fill();

      p.x += p.vx;
      p.y += p.vy;

      if (p.x < 0) p.x = canvas.width;
      if (p.x > canvas.width) p.x = 0;
      if (p.y < 0) p.y = canvas.height;
      if (p.y > canvas.height) p.y = 0;
    }

    animId = requestAnimationFrame(animate);
  }

  init();
  if (window.reduceMotion) return;
  animate();

  // Berhenti total saat tab/app di background
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) { running = false; cancelAnimationFrame(animId); }
    else if (!running) { running = true; animate(); }
  });

  window.addEventListener('resize', () => { cancelAnimationFrame(animId); init(); if (running) animate(); });
}

window.initParticles = initParticles;
