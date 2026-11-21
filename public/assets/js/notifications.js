// Toast Notification System
const ToastTypes = {
  SUCCESS: 'success',
  ERROR: 'error',
  WARNING: 'warning',
  INFO: 'info',
};

const ToastIcons = {
  success: '✓',
  error: '✕',
  warning: '⚠',
  info: 'ℹ',
};

const SoundEnabled = { value: localStorage.getItem('sound_enabled') !== 'false' };

function showToast(message, type = 'info', title = null, duration = 4000) {
  let container = document.getElementById('toast-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'toast-container';
    document.body.appendChild(container);
  }

  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;

  const defaultTitles = { success: 'Berhasil', error: 'Error', warning: 'Peringatan', info: 'Info' };
  const displayTitle = title || defaultTitles[type] || 'Notifikasi';

  toast.innerHTML = `
    <span class="toast-icon">${ToastIcons[type] || 'ℹ'}</span>
    <div class="toast-body">
      <div class="toast-title">${escapeHtml(displayTitle)}</div>
      <div class="toast-message">${escapeHtml(message)}</div>
    </div>
  `;

  toast.addEventListener('click', () => removeToast(toast));
  container.appendChild(toast);

  // Play sound
  if (SoundEnabled.value) playSound(type);

  if (duration > 0) {
    setTimeout(() => removeToast(toast), duration);
  }
  return toast;
}

function removeToast(toast) {
  if (!toast || toast.classList.contains('hiding')) return;
  toast.classList.add('hiding');
  setTimeout(() => toast.remove(), 300);
}

function playSound(type) {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);

    const freqs = { success: [523, 659], error: [220, 180], warning: [440, 380], info: [440, 523] };
    const [f1, f2] = freqs[type] || [440, 440];

    gain.gain.setValueAtTime(0.2, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4);

    osc.frequency.setValueAtTime(f1, ctx.currentTime);
    osc.frequency.setValueAtTime(f2, ctx.currentTime + 0.1);
    osc.type = 'sine';
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.4);
  } catch (e) {
    // Browser audio blocked before interaction — silent
  }
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function setSoundEnabled(enabled) {
  SoundEnabled.value = enabled;
  localStorage.setItem('sound_enabled', enabled ? 'true' : 'false');
}

window.Toast = { show: showToast, success: (m, t) => showToast(m, 'success', t), error: (m, t) => showToast(m, 'error', t), warning: (m, t) => showToast(m, 'warning', t), info: (m, t) => showToast(m, 'info', t), setSoundEnabled };
