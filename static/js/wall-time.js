// The server can't know a reader's timezone, so convert each post's instant
// client-side. Shown to every reader, even when it matches the posted time.
document.querySelectorAll('.wall-post').forEach(function (post) {
  const stampEl = post.querySelector('time');
  const out = post.querySelector('.yourtime');
  if (!stampEl || !out) return;

  const stamp = stampEl.getAttribute('datetime');
  const posted = new Date(stamp);
  if (isNaN(posted)) return;

  const offset = stamp.match(/([+-])(\d{2}):(\d{2})$/);
  const postMinutes = offset
    ? (offset[1] === '-' ? -1 : 1) * (parseInt(offset[2], 10) * 60 + parseInt(offset[3], 10))
    : 0;

  const time = posted.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
  const postLocal = new Date(posted.getTime() + postMinutes * 60000);
  const sameDay = postLocal.getUTCDate() === posted.getDate()
    && postLocal.getUTCMonth() === posted.getMonth();
  const label = sameDay
    ? time
    : posted.toLocaleDateString([], { month: 'short', day: 'numeric' }) + ', ' + time;

  out.textContent = ' · ' + label + ', in your time';
  out.hidden = false;
});
