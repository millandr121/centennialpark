/* _lib.js — shared helpers for the form API (Cloudflare Pages Functions).
   Files prefixed with "_" are not routed, so this is import-only. */

export function json(obj, status) {
  return new Response(JSON.stringify(obj), {
    status: status || 200,
    headers: { 'Content-Type': 'application/json' }
  });
}

/* HTML-escape user input before putting it in an email body */
export function esc(v) {
  return String(v == null ? '' : v)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/* trim + cap length so a single field can't blow up storage or email */
export function clean(v, max) {
  return String(v == null ? '' : v).trim().slice(0, max || 1000);
}

export function looksLikeEmail(v) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(v || ''));
}

/*
 * Send a notification email via Resend (https://resend.com).
 * Returns true on success, false if not configured or the API rejects it.
 * Never throws — callers treat email as best-effort on top of the D1 record.
 */
export async function sendEmail(env, { subject, html, replyTo }) {
  const key = env.RESEND_API_KEY;
  if (!key) return false;                       // not configured yet
  const to   = env.NOTIFY_TO   || 'bamfieldcentennialpark@gmail.com';
  const from = env.RESEND_FROM || 'Centennial Park <onboarding@resend.dev>';

  const body = { from, to, subject, html };
  if (replyTo) body.reply_to = replyTo;

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + key,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body)
    });
    return res.ok;
  } catch (_e) {
    return false;
  }
}
