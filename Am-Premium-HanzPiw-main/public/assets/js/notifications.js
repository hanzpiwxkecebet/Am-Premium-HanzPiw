// Toast Notification System
const ToastTypes = {
  SUCCESS: 'success',
  ERROR: 'error',
  WARNING: 'warning',
  INFO: 'info',
};

const ToastIcons = {
  success: '<i class="ic ic-check"></i>',
  error: '<i class="ic ic-x"></i>',
  warning: '<i class="ic ic-alert"></i>',
  info: '<i class="ic ic-info"></i>',
};

function readSoundSetting() {
  try { return localStorage.getItem('sound_enabled') !== 'false'; } catch (e) { return true; }
}

const SoundEnabled = { value: readSoundSetting() };

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
    <span class="toast-icon">${ToastIcons[type] || '<i class="ic ic-info"></i>'}</span>
    <div class="toast-body">
      <div class="toast-title">${escapeHtml(displayTitle)}</div>
      <div class="toast-message">${escapeHtml(message)}</div>
    </div>
  `;

  toast.addEventListener('click', () => removeToast(toast));
  toast.style.setProperty('--dur', (duration > 0 ? duration : 0) + 'ms');
  if (duration > 0) toast.classList.add('has-timer');
  // maksimal 3 toast sekaligus, yang tertua dihapus
  const existing = container.querySelectorAll('.toast:not(.hiding)');
  if (existing.length >= 3) removeToast(existing[0]);
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
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function setSoundEnabled(enabled) {
  SoundEnabled.value = enabled;
  try { localStorage.setItem('sound_enabled', enabled ? 'true' : 'false'); } catch (e) { /* storage diblokir */ }
}

window.Toast = { show: showToast, success: (m, t) => showToast(m, 'success', t), error: (m, t) => showToast(m, 'error', t), warning: (m, t) => showToast(m, 'warning', t), info: (m, t) => showToast(m, 'info', t), setSoundEnabled };
