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

/* Return a Set of column names for a table (cached per-request via the env). */
export async function tableCols(env, table) {
  try {
    const r = await env.DB.prepare(`PRAGMA table_info(${table})`).all();
    return new Set((r.results || []).map(c => c.name));
  } catch (_e) {
    return new Set();
  }
}

/*
 * Verify a Cloudflare Turnstile token (bot check).
 * Returns true if the token is valid OR if Turnstile isn't configured yet
 * (so the forms keep working before the secret is set). Returns false only
 * when a secret IS set but the token is missing or rejected.
 */
export async function verifyTurnstile(env, token, ip) {
  if (!env.TURNSTILE_SECRET) {
    /* Fail OPEN so forms keep working before the secret is set — but make the
       gap visible in logs rather than silently accepting every submission. */
    console.warn('verifyTurnstile: TURNSTILE_SECRET not set — bot check skipped (forms unprotected).');
    return true;
  }
  if (!token) return false;
  try {
    const form = new URLSearchParams();
    form.append('secret', env.TURNSTILE_SECRET);
    form.append('response', token);
    if (ip) form.append('remoteip', ip);
    const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      body: form
    });
    const data = await res.json();
    return data.success === true;
  } catch (_e) {
    return false;
  }
}

/*
 * Send an email via Resend (https://resend.com).
 * `to` defaults to the park's NOTIFY_TO address when omitted.
 * Returns true on success, false if not configured or the API rejects it.
 * Never throws — callers treat email as best-effort on top of the D1 record.
 */
export async function sendEmail(env, { subject, html, replyTo, to }) {
  const key = env.RESEND_API_KEY;
  if (!key) return false;
  const dest = to || env.NOTIFY_TO || 'bamfieldcentennialpark@gmail.com';
  const from = env.RESEND_FROM || 'Centennial Park <onboarding@resend.dev>';

  const body = { from, to: dest, subject, html };
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
