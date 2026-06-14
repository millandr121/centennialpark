/* POST /api/contact — store the contact message in D1, then email it.
   The submission is considered delivered if EITHER the D1 insert OR the
   email succeeds, so a lead is never silently lost. */

import { json, esc, clean, looksLikeEmail, sendEmail } from './_lib.js';

export async function onRequestPost(context) {
  const { request, env } = context;

  let data;
  try { data = await request.json(); }
  catch (_e) { return json({ error: 'Bad request' }, 400); }

  /* honeypot — pretend success so bots don't retry */
  if (data.website) return json({ ok: true });

  const name    = clean(data.name, 200);
  const email   = clean(data.email, 200);
  const subject = clean(data.subject, 300);
  const message = clean(data.message, 5000);

  if (!name || !looksLikeEmail(email) || !message) {
    return json({ error: 'Please provide your name, a valid email, and a message.' }, 422);
  }

  const ip = request.headers.get('CF-Connecting-IP') || '';
  const ua = request.headers.get('User-Agent') || '';

  /* 1. durable backup in D1 (if bound) */
  let stored = false, id = null;
  if (env.DB) {
    try {
      const res = await env.DB.prepare(
        'INSERT INTO contact_submissions (name, email, subject, message, ip, user_agent) VALUES (?, ?, ?, ?, ?, ?)'
      ).bind(name, email, subject, message, ip, ua).run();
      stored = true;
      id = (res.meta && res.meta.last_row_id) || null;
    } catch (_e) { /* fall through to email */ }
  }

  /* 2. instant email notification */
  const emailed = await sendEmail(env, {
    subject: 'New website message' + (subject ? ': ' + subject : ''),
    replyTo: email,
    html:
      '<h2 style="font-family:sans-serif">New contact message</h2>' +
      '<p><strong>Name:</strong> ' + esc(name) + '</p>' +
      '<p><strong>Email:</strong> ' + esc(email) + '</p>' +
      '<p><strong>Subject:</strong> ' + esc(subject || '(none)') + '</p>' +
      '<p><strong>Message:</strong><br>' + esc(message).replace(/\n/g, '<br>') + '</p>'
  });

  if (emailed && stored && id != null) {
    try { await env.DB.prepare('UPDATE contact_submissions SET emailed = 1 WHERE id = ?').bind(id).run(); }
    catch (_e) { /* non-fatal */ }
  }

  if (stored || emailed) return json({ ok: true });
  return json({ error: 'Could not deliver your message. Please email us directly.' }, 502);
}
