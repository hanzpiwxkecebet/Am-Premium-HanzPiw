/* ============================================================
   AM Premium Free by HanzPiw - Generator JS
   ============================================================ */

const Generator = (() => {
  const API = '/api/generator';
  let currentStep = 1;
  let userEmail = '';
  let resultData = null;
  let cooldownTimer = null;

  /* ─── Elements ───────────────────────────────────────────── */
  const $ = id => document.getElementById(id);
  const els = () => ({
    step1:       $('step1'),
    step2:       $('step2'),
    step3:       $('step3'),
    dot1:        $('stepDot1'),
    dot2:        $('stepDot2'),
    dot3:        $('stepDot3'),
    line1:       $('stepLine1'),
    line2:       $('stepLine2'),
    emailInput:  $('emailInput'),
    emailError:  $('emailError'),
    sendBtn:     $('sendBtn'),
    linkInput:   $('linkInput'),
    linkError:   $('linkError'),
    verifyBtn:   $('verifyBtn'),
    backBtn:     $('backBtn'),
    resultBox:   $('resultBox'),
    resultTitle: $('resultTitle'),
    resultMsg:   $('resultMsg'),
    copyBtn:     $('copyBtn'),
    shareBtn:    $('shareBtn'),
    dlBtn:       $('dlBtn'),
    resetBtn:    $('resetBtn'),
    cooldownWrap:$('cooldownWrap'),
    cooldownSec: $('cooldownSec'),
    cooldownBar: $('cooldownBar'),
  });

  /* ─── Step Management ────────────────────────────────────── */
  function goToStep(step) {
    const e = els();
    currentStep = step;
    [e.step1, e.step2, e.step3].forEach((s, i) => {
      if (s) s.classList.toggle('active', i + 1 === step);
    });
    [e.dot1, e.dot2, e.dot3].forEach((d, i) => {
      if (!d) return;
      d.classList.remove('active', 'done');
      if (i + 1 === step) d.classList.add('active');
      else if (i + 1 < step) d.classList.add('done');
    });
    [e.line1, e.line2].forEach((l, i) => {
      if (l) l.classList.toggle('done', step > i + 1);
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  /* ─── Validation ─────────────────────────────────────────── */
  function validateEmail(email) {
    if (!email) return 'Email tidak boleh kosong.';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return 'Format email tidak valid.';
    if (email.length > 100) return 'Email terlalu panjang.';
    return null;
  }

  function validateLink(link) {
    if (!link || link.trim().length < 10) return 'Link verifikasi tidak boleh kosong.';
    if (link.trim().length > 2000) return 'Link terlalu panjang.';
    return null;
  }

  function showError(el, msg) {
    if (el) { el.textContent = msg || ''; el.classList.toggle('hidden', !msg); }
  }

  /* ─── Cooldown UI ────────────────────────────────────────── */
  function startCooldown(seconds) {
    const e = els();
    if (!e.cooldownWrap) return;
    let remaining = seconds;
    e.cooldownWrap.classList.add('active');
    e.cooldownSec.textContent = remaining;
    e.cooldownBar.style.width = '100%';
    if (e.sendBtn) e.sendBtn.disabled = true;

    const interval = 1000;
    cooldownTimer = setInterval(() => {
      remaining--;
      if (e.cooldownSec) e.cooldownSec.textContent = remaining;
      if (e.cooldownBar) e.cooldownBar.style.width = `${(remaining / seconds) * 100}%`;
      if (remaining <= 0) {
        clearInterval(cooldownTimer);
        e.cooldownWrap.classList.remove('active');
        if (e.sendBtn) e.sendBtn.disabled = false;
      }
    }, interval);
  }

  /* ─── Send Verification ──────────────────────────────────── */
  async function handleSend() {
    const e = els();
    const email = e.emailInput?.value?.trim() || '';
    const err = validateEmail(email);
    if (err) { showError(e.emailError, err); e.emailInput?.focus(); return; }
    showError(e.emailError, null);
    userEmail = email;

    setLoading(e.sendBtn, true);
    try {
      const token = sessionStorage.getItem('amp_token') || '';
      const res = await fetch(`${API}/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
        body: JSON.stringify({ email }),
      });
      const json = await res.json();

      if (json.code === 'AUTH_REQUIRED' || json.code === 'INVALID_TOKEN') {
        window.location.href = '/login?redirect=/generator';
        return;
      }
      if (json.code === 'DAILY_LIMIT') {
        window.Toast?.warning(json.error || '🚫 Limit harian habis.');
        setLoading(e.sendBtn, false);
        return;
      }
      if (json.code === 'COOLDOWN') {
        startCooldown(json.remaining || 30);
        window.Toast?.warning(json.error || 'Harap tunggu sebentar.');
        return;
      }
      if (!json.success) {
        showError(e.emailError, json.error || 'Gagal mengirim. Coba lagi.');
        window.Toast?.error(json.error || 'Gagal mengirim email verifikasi.');
        return;
      }
      window.Toast?.success(json.message || 'Email verifikasi berhasil dikirim!');
      goToStep(2);
    } catch (err) {
      window.Toast?.error('Koneksi gagal. Periksa internet kamu.');
      showError(e.emailError, 'Koneksi error. Coba lagi.');
    } finally {
      setLoading(e.sendBtn, false);
    }
  }

  /* ─── Verify ─────────────────────────────────────────────── */
  async function handleVerify() {
    const e = els();
    const link = e.linkInput?.value?.trim() || '';
    const err = validateLink(link);
    if (err) { showError(e.linkError, err); e.linkInput?.focus(); return; }
    showError(e.linkError, null);

    setLoading(e.verifyBtn, true);
    try {
      const token = sessionStorage.getItem('amp_token') || '';
      const res = await fetch(`${API}/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
        body: JSON.stringify({ email: userEmail, link }),
      });
      const json = await res.json();

      if (!json.success) {
        showError(e.linkError, json.error || 'Verifikasi gagal. Periksa link kamu.');
        window.Toast?.error(json.error || 'Verifikasi gagal.');
        return;
      }

      resultData = json;
      renderResult(json);
      goToStep(3);
      window.Toast?.success('Verifikasi berhasil! 🎉');
    } catch (err) {
      window.Toast?.error('Koneksi gagal. Periksa internet kamu.');
      showError(e.linkError, 'Koneksi error. Coba lagi.');
    } finally {
      setLoading(e.verifyBtn, false);
    }
  }

  /* ─── Render Result ──────────────────────────────────────── */
  function renderResult(json) {
    const e = els();
    if (!e.resultBox) return;

    // Build display content
    let content = '';
    const d = json;

    if (d.message) content += `<div style="margin-bottom:.75rem;font-weight:600;color:var(--text)">${escHtml(d.message)}</div>`;

    if (d.link) {
      content += `<div style="margin-bottom:.75rem">
        <span style="color:var(--text-3);font-size:.78rem;text-transform:uppercase;letter-spacing:1px">Link</span><br>
        <a href="${escHtml(d.link)}" target="_blank" rel="noopener" style="color:var(--blue);word-break:break-all;font-size:.88rem">${escHtml(d.link)}</a>
      </div>`;
    }

    if (d.data && typeof d.data === 'object') {
      const entries = Object.entries(d.data).slice(0, 8);
      entries.forEach(([k, v]) => {
        if (typeof v !== 'object' && v !== null && v !== undefined) {
          if (k.toLowerCase() === 'author') v = 'HanzPiw Official';
          content += `<div style="margin-bottom:.4rem">
            <span style="color:var(--text-3);font-size:.72rem;text-transform:uppercase;letter-spacing:1px">${escHtml(k)}</span><br>
            <span style="font-size:.88rem;word-break:break-all">${escHtml(String(v))}</span>
          </div>`;
        }
      });
    } else if (d.raw) {
      content += `<div style="font-size:.78rem;color:var(--text-3);margin-top:.5rem">
        <span style="text-transform:uppercase;letter-spacing:1px">API Response</span>
      </div>
      <pre style="margin-top:.35rem;white-space:pre-wrap;word-break:break-all;font-size:.78rem;color:var(--text-2)">${escHtml(JSON.stringify(d.raw, null, 2))}</pre>`;
    }

    if (!content) content = `<p style="color:var(--text-2)">Proses berhasil diselesaikan.</p>`;

    e.resultBox.innerHTML = content;

    // Show/hide download button
    if (e.dlBtn) e.dlBtn.style.display = d.link ? 'inline-flex' : 'none';
  }

  /* ─── Result Actions ─────────────────────────────────────── */
  async function handleCopy() {
    if (!resultData) return;
    const text = formatResultText(resultData);
    const ok = await App.copyText(text);
    window.Toast?.[ok ? 'success' : 'error'](ok ? '✓ Result copied!' : '✕ Failed to copy');
    const e = els();
    if (ok && e.copyBtn) { e.copyBtn.textContent = '✓ Copied!'; setTimeout(() => e.copyBtn.innerHTML = '📋 Copy Result', 2000); }
  }

  async function handleShare() {
    if (!resultData) return;
    const text = formatResultText(resultData);
    const shared = await App.shareText('AM Premium Free Result', text);
    if (!shared) {
      const ok = await App.copyText(text);
      window.Toast?.info(ok ? 'Link disalin ke clipboard!' : 'Share tidak tersedia.');
    }
  }

  function handleDownload() {
    if (!resultData?.link) return;
    window.open(resultData.link, '_blank', 'noopener');
  }

  function handleReset() {
    const e = els();
    userEmail = '';
    resultData = null;
    if (e.emailInput) e.emailInput.value = '';
    if (e.linkInput)  e.linkInput.value = '';
    if (e.resultBox)  e.resultBox.innerHTML = '';
    showError(e.emailError, null);
    showError(e.linkError, null);
    goToStep(1);
    if (cooldownTimer) clearInterval(cooldownTimer);
  }

  /* ─── Helpers ────────────────────────────────────────────── */
  function setLoading(btn, loading) {
    if (!btn) return;
    btn.disabled = loading;
    btn.classList.toggle('btn-loading', loading);
  }

  function formatResultText(json) {
    let text = 'AM Premium Free Result\n====================\n';
    if (json.message) text += `Status: ${json.message}\n`;
    if (json.link) text += `Link: ${json.link}\n`;
    if (json.data && typeof json.data === 'object') {
      Object.entries(json.data).forEach(([k, v]) => {
        if (typeof v !== 'object') text += `${k}: ${v}\n`;
      });
    }
    text += `\nGenerated by: AM Premium Free by HanzPiw`;
    return text;
  }

  function escHtml(str) { return App?.escHtml ? App.escHtml(str) : String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

  /* ─── Init ───────────────────────────────────────────────── */
  function init() {
    const e = els();
    e.sendBtn?.addEventListener('click', handleSend);
    e.verifyBtn?.addEventListener('click', handleVerify);
    e.backBtn?.addEventListener('click', () => goToStep(1));
    e.copyBtn?.addEventListener('click', handleCopy);
    e.shareBtn?.addEventListener('click', handleShare);
    e.dlBtn?.addEventListener('click', handleDownload);
    e.resetBtn?.addEventListener('click', handleReset);

    // Enter key
    e.emailInput?.addEventListener('keydown', ev => { if (ev.key === 'Enter') handleSend(); });
    e.linkInput?.addEventListener('keydown',  ev => { if (ev.key === 'Enter') handleVerify(); });
  }

  document.addEventListener('DOMContentLoaded', init);
  return { goToStep };
})();
