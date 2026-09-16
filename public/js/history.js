/* ─── History Page JS ─────────────────────────────── */
document.addEventListener('DOMContentLoaded', async () => {
  const tbody = document.getElementById('historyBody');
  const loadingEl = document.getElementById('historyLoading');
  const emptyEl = document.getElementById('historyEmpty');
  if (!tbody) return;

  try {
    const res = await fetch('/api/stats'); // public stats
    if (loadingEl) loadingEl.style.display = 'none';
    // History is private; show placeholder guidance
    if (emptyEl) emptyEl.style.display = 'block';
  } catch {
    if (loadingEl) loadingEl.style.display = 'none';
    if (emptyEl) emptyEl.style.display = 'block';
  }
});
