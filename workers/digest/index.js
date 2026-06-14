/* Daily digest Worker — safety net on top of the per-submission emails.
 * Runs on a cron trigger, reads the last 24h of D1 rows, and emails a recap
 * to the park's Gmail. Even if a live notification email ever fails, the
 * data is in D1 and shows up here.
 *
 * Deploy from this folder:  wrangler deploy
 * Test now (manual):        open the Worker's URL in a browser (GET).
 */

export default {
  async scheduled(event, env, ctx) {
    ctx.waitUntil(sendDigest(env));
  },
  async fetch(request, env) {
    const ok = await sendDigest(env);
    return new Response(ok ? 'Digest sent.' : 'Nothing to send (or not configured).');
  }
};

async function sendDigest(env) {
  if (!env.DB) return false;

  const contacts = await safeAll(env, 'contact_submissions');
  const bookings = await safeAll(env, 'booking_submissions');
  if (contacts.length === 0 && bookings.length === 0) return false;

  const html =
    '<h2 style="font-family:sans-serif">Centennial Park — last 24 hours</h2>' +
    section('Booking requests (' + bookings.length + ')', bookings.map(function (b) {
      return '<li>' +
        esc((b.first_name || '') + ' ' + (b.last_name || '')) + ' &lt;' + esc(b.email) + '&gt;' +
        ' — ' + esc([b.need_campsite === 'yes' ? 'campsite' : '', b.need_moorage === 'yes' ? 'moorage' : ''].filter(Boolean).join(' + ') || 'unspecified') +
        (b.check_in ? ', ' + esc(b.check_in) + ' → ' + esc(b.check_out || '?') : '') +
        ' <small>(' + esc(b.created_at) + ')</small></li>';
    })) +
    section('Contact messages (' + contacts.length + ')', contacts.map(function (c) {
      return '<li>' + esc(c.name) + ' &lt;' + esc(c.email) + '&gt; — ' +
        esc(c.subject || '(no subject)') + ' <small>(' + esc(c.created_at) + ')</small></li>';
    }));

  return sendEmail(env, { subject: 'Daily form digest — ' + new Date().toISOString().slice(0, 10), html });
}

async function safeAll(env, table) {
  try {
    const res = await env.DB.prepare(
      'SELECT * FROM ' + table + " WHERE created_at >= datetime('now','-1 day') ORDER BY created_at DESC"
    ).all();
    return (res && res.results) || [];
  } catch (_e) { return []; }
}

function section(title, items) {
  return '<h3 style="font-family:sans-serif">' + title + '</h3>' +
    (items.length ? '<ul>' + items.join('') + '</ul>' : '<p>None.</p>');
}

function esc(v) {
  return String(v == null ? '' : v)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

async function sendEmail(env, { subject, html }) {
  const key = env.RESEND_API_KEY;
  if (!key) return false;
  const to   = env.NOTIFY_TO   || 'bamfieldcentennialpark@gmail.com';
  const from = env.RESEND_FROM || 'Centennial Park <onboarding@resend.dev>';
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + key, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from, to, subject, html })
    });
    return res.ok;
  } catch (_e) { return false; }
}
