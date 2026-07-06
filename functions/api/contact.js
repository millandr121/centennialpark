/* POST /api/contact — store the contact message in D1, then email it.
   Delivered if EITHER the D1 insert OR the email succeeds. */

import { json, esc, clean, looksLikeEmail, sendEmail, verifyTurnstile } from './_lib.js';

const GREEN  = '#2e5d33';
const BORDER = '#e5e7eb';

function header(title, sub) {
  return `<div style="background:${GREEN};color:#fff;padding:20px 24px;border-radius:10px 10px 0 0">
    <div style="font-size:18px;font-weight:700">${title}</div>
    <div style="font-size:13px;opacity:.8;margin-top:3px">${sub}</div>
  </div>`;
}

/* Collapse CR/LF so user-supplied text can't inject extra email headers when
   placed in a Subject line. */
function oneLine(v) { return String(v == null ? '' : v).replace(/[\r\n]+/g, ' ').trim(); }

export async function onRequestPost(context) {
  const { request, env } = context;

  let data;
  try { data = await request.json(); }
  catch (_e) { return json({ error: 'Bad request' }, 400); }

  if (data.website) return json({ ok: true });   // honeypot

  const ipAddr = request.headers.get('CF-Connecting-IP') || '';
  const human  = await verifyTurnstile(env, data['cf-turnstile-response'], ipAddr);
  if (!human) return json({ error: 'Could not verify you are human. Please try again.' }, 403);

  const name    = clean(data.name, 200);
  const email   = clean(data.email, 200);
  const subject = clean(data.subject, 300);
  const message = clean(data.message, 5000);

  if (!name || !looksLikeEmail(email) || !message) {
    return json({ error: 'Please provide your name, a valid email, and a message.' }, 422);
  }

  const siteUrl = env.SITE_URL || 'https://bamfieldparks.com';

  /* ── DB insert ── */
  let stored = false, id = null;
  if (env.DB) {
    try {
      const res = await env.DB.prepare(
        'INSERT INTO contact_submissions (name, email, subject, message, ip, user_agent) VALUES (?, ?, ?, ?, ?, ?)'
      ).bind(name, email, subject, message, ipAddr, request.headers.get('User-Agent') || '').run();
      stored = true;
      id = (res.meta && res.meta.last_row_id) || null;
    } catch (_e) { /* fall through */ }
  }

  /* ── Park notification ── */
  const parkHtml = `<div style="font-family:sans-serif;max-width:560px;margin:0 auto">
    ${header('New Website Inquiry', 'Eileen Scott Centennial Park · Bamfield, BC')}
    <div style="background:#f0f7f1;padding:14px 24px;border:1px solid #c6dfc9;border-top:none;border-bottom:none">
      <strong style="font-size:15px">${esc(name)}</strong>
      ${subject ? ` &mdash; <em style="color:#6b7280">${esc(subject)}</em>` : ''}
    </div>
    <div style="border:1px solid ${BORDER};border-top:none;padding:18px 24px">
      <table style="width:100%;border-collapse:collapse;margin-bottom:1rem">
        <tr>
          <td style="padding:6px 0;color:#6b7280;font-size:13px;width:70px">From</td>
          <td style="padding:6px 0;font-size:14px"><a href="mailto:${esc(email)}">${esc(email)}</a></td>
        </tr>
      </table>
      <div style="background:#f9fafb;border:1px solid ${BORDER};border-radius:8px;padding:14px 18px;font-size:14px;line-height:1.7;white-space:pre-wrap">${esc(message)}</div>
    </div>
    <p style="color:#9ca3af;font-size:12px;margin-top:1rem">Received ${new Date().toUTCString()}</p>
  </div>`;

  const parkEmailed = await sendEmail(env, {
    subject: oneLine('New website message' + (subject ? ': ' + subject : '')),
    replyTo: email,
    html: parkHtml
  });

  /* ── Guest acknowledgment ── */
  const guestHtml = `<div style="font-family:sans-serif;max-width:540px;margin:0 auto">
    ${header('Message received — thanks for reaching out!', 'Eileen Scott Centennial Park · Bamfield, BC')}
    <div style="border:1px solid ${BORDER};border-top:none;border-radius:0 0 10px 10px;padding:20px 24px">
      <p style="margin:0 0 1rem">Hi <strong>${esc(name)}</strong>,</p>
      <p style="margin:0 0 1rem;color:#374151">Thanks for your message! We'll get back to you as soon as we can — usually within 1–2 business days.</p>
      <div style="background:#f0f7f1;border-radius:8px;padding:14px 18px;margin:1.2rem 0">
        <strong style="color:${GREEN};font-size:13px">Your message${subject ? ': ' + esc(subject) : ''}</strong>
        <div style="margin-top:.6rem;font-size:13px;color:#374151;line-height:1.6;white-space:pre-wrap">${esc(message)}</div>
      </div>
      <p style="color:#374151;margin:0 0 .5rem">Need a faster response? Call us at <a href="tel:+12507283006" style="color:${GREEN}">250-728-3006</a>.</p>
      <p style="color:#9ca3af;font-size:12px;margin-top:1.5rem">Eileen Scott Centennial Park &mdash; Bamfield, BC &mdash; <a href="${siteUrl}" style="color:#9ca3af">${siteUrl.replace('https://', '')}</a></p>
    </div>
  </div>`;

  const guestEmailed = await sendEmail(env, {
    subject: `Thanks for your message — Eileen Scott Centennial Park`,
    to: email,
    replyTo: env.NOTIFY_TO || 'bamfieldcentennialpark@gmail.com',
    html: guestHtml
  });

  if ((parkEmailed || guestEmailed) && stored && id != null) {
    try { await env.DB.prepare('UPDATE contact_submissions SET emailed = 1 WHERE id = ?').bind(id).run(); }
    catch (_e) { /* non-fatal */ }
  }

  if (stored || parkEmailed || guestEmailed) return json({ ok: true });
  return json({ error: 'Could not deliver your message. Please email us directly.' }, 502);
}
