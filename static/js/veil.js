// Reusable password lock — see layouts/shortcodes/lock.html.
//
// On submit we hash (salt + ":" + the typed password) with SHA-256 and treat the
// hex digest as a URL: <base>/<hash>/. If that page exists (HTTP 200) we go there;
// otherwise the password was wrong. The lock page never contains the password, the
// destination URL, or the protected content — so viewing source reveals nothing.

async function sha256hex(text) {
  const bytes = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function initLock(lock) {
  const form = lock.querySelector('.lock-form');
  const input = lock.querySelector('.lock-input');
  const error = lock.querySelector('.lock-error');
  const salt = lock.dataset.salt || '';
  const base = lock.dataset.base || '/blog/';

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    error.hidden = true;

    // Normalize so typing matches the slug we precomputed on the command line.
    const normalized = input.value.trim().toLowerCase();
    if (!normalized) {
      error.hidden = false;
      return;
    }

    const hash = await sha256hex(salt + ':' + normalized);
    const target = base + hash + '/';

    try {
      const res = await fetch(target, { method: 'HEAD' });
      if (res.ok) {
        window.location = target; // correct — reveal the material
        return;
      }
    } catch (_) {
      // fall through to the wrong-password message
    }
    error.hidden = false; // wrong password (or the page genuinely 404s)
  });
}

document.querySelectorAll('.lock').forEach(initLock);
