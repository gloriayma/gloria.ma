// Reusable answer gate — see layouts/shortcodes/veil.html.
//
// On submit we hash (salt + ":" + the typed answer) with SHA-256 and treat the hex
// digest as a URL: <base>/<hash>/. If that page exists (HTTP 200) we go there. If it
// doesn't, we either send them to the gate's fallback (router mode) or say the password
// was wrong (classic lock mode). The gate page never contains the answers, their
// destinations, or the protected content — so viewing source reveals nothing.

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
  const fallback = lock.dataset.fallback || '';

  // No match: in router mode every answer goes somewhere, so send them to the
  // fallback. Otherwise fall back to the original wrong-password message.
  function miss() {
    if (fallback) {
      window.location = fallback;
      return;
    }
    if (error) error.hidden = false;
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (error) error.hidden = true;

    // Normalize so typing matches the slug we precomputed on the command line:
    // lowercase and strip every space, so "Peter" and " peter " both land.
    const normalized = input.value.toLowerCase().replace(/\s+/g, '');
    if (!normalized) return; // a stray Enter shouldn't route anyone anywhere

    const hash = await sha256hex(salt + ':' + normalized);
    const target = base + hash + '/';

    try {
      const res = await fetch(target, { method: 'HEAD' });
      if (res.ok) {
        window.location = target; // matched — reveal the material
        return;
      }
    } catch (_) {
      // fall through to miss()
    }
    miss();
  });
}

document.querySelectorAll('.lock').forEach(initLock);
