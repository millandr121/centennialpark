/* POST /api/booking — store a booking request in D1, then email it.
   Delivered if EITHER the D1 insert OR the email succeeds. */

import { json, esc, clean, looksLikeEmail, sendEmail, verifyTurnstile } from './_lib.js';

const GREEN  = '#2e5d33';
const BORDER = '#e5e7eb';

function row(label, value) {
  return `<tr>
    <td style="padding:8px 14px;border-bottom:1px solid ${BORDER};color:#6b7280;font-size:13px;white-space:nowrap;width:130px">${label}</td>
    <td style="padding:8px 14px;border-bottom:1px solid ${BORDER};font-size:14px">${value}</td>
  </tr>`;
}

function header(title, sub) {
  return `<div style="background:${GREEN};color:#fff;padding:20px 24px;border-radius:10px 10px 0 0">
    <div style="font-size:18px;font-weight:700">${title}</div>
    <div style="font-size:13px;opacity:.8;margin-top:3px">${sub}</div>
  </div>`;
}

function adminBtn(url) {
  return `<div style="margin:20px 0 8px">
    <a href="${url}" style="display:inline-block;padding:10px 22px;background:${GREEN};color:#fff;border-radius:7px;text-decoration:none;font-weight:600;font-size:14px">Open Admin Panel →</a>
    <span style="font-size:12px;color:#9ca3af;margin-left:10px">Login required</span>
  </div>`;
}

export async function onRequestPost(context) {
  const { request, env } = context;

  let data;
  try { data = await request.json(); }
  catch (_e) { return json({ error: 'Bad request' }, 400); }

  if (data.website) return json({ ok: true });   // honeypot

  const ipAddr = request.headers.get('CF-Connecting-IP') || '';
  const human  = await verifyTurnstile(env, data['cf-turnstile-response'], ipAddr);
  if (!human) return json({ error: 'Could not verify you are human. Please try again.' }, 403);

  const firstName  = clean(data.firstName, 120);
  const lastName   = clean(data.lastName, 120);
  const email      = clean(data.email, 200);
  const campsite   = clean(data.needCampsite, 8);
  const moorage    = clean(data.needMoorage, 8);
  const siteCount  = clean(data.siteCount, 12);
  const groupSize  = clean(data.groupSize, 12);
  const boatLength = clean(data.boatLength, 24);
  const checkIn    = clean(data.checkIn, 30);
  const checkOut   = clean(data.checkOut, 30);
  const notes      = clean(data.additionalRequests, 4000);

  if (!firstName || !looksLikeEmail(email)) {
    return json({ error: 'Please provide your name and a valid email.' }, 422);
  }

  const fullName = esc([firstName, lastName].filter(Boolean).join(' '));
  const wants    = [campsite === 'yes' && 'Campsite', moorage === 'yes' && 'Moorage'].filter(Boolean).join(' + ') || 'Not specified';
  const siteUrl  = env.SITE_URL || 'https://centennialpark.pages.dev';

  /* ── DB insert ── */
  let stored = false, id = null;
  if (env.DB) {
    try {
      const res = await env.DB.prepare(
        'INSERT INTO booking_submissions ' +
        '(first_name, last_name, email, need_campsite, need_moorage, site_count, group_size, boat_length, check_in, check_out, additional_requests, ip, user_agent) ' +
        'VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
      ).bind(firstName, lastName, email, campsite, moorage, siteCount, groupSize, boatLength, checkIn, checkOut, notes, ipAddr, request.headers.get('User-Agent') || '').run();
      stored = true;
      id = (res.meta && res.meta.last_row_id) || null;
    } catch (_e) { /* fall through */ }
  }

  /* ── Park notification ── */
  const parkHtml = `<div style="font-family:sans-serif;max-width:560px;margin:0 auto">
    ${header('📋 New Booking Request', 'Eileen Scott Centennial Park · Bamfield, BC')}
    <div style="background:#f0f7f1;padding:14px 24px;border:1px solid #c6dfc9;border-top:none;border-bottom:none">
      <strong style="font-size:15px">${fullName}</strong> is requesting a booking${id ? ` <span style="color:#6b7280;font-size:13px">(Request #${id})</span>` : ''}
    </div>
    <table style="width:100%;border-collapse:collapse;border:1px solid ${BORDER};border-top:none">
      ${row('Wants',     esc(wants))}
      ${row('Check-in',  esc(checkIn  || '—'))}
      ${row('Check-out', esc(checkOut || '—'))}
      ${row('Party size', esc(groupSize  || '—'))}
      ${row('Sites needed', esc(siteCount  || '—'))}
      ${row('Boat length', esc(boatLength || '—'))}
      ${row('Email',     `<a href="mailto:${esc(email)}">${esc(email)}</a>`)}
      ${notes ? row('Notes', esc(notes).replace(/\n/g, '<br>')) : ''}
    </table>
    ${adminBtn(siteUrl + '/admin')}
    <p style="color:#9ca3af;font-size:12px;margin-top:1.5rem">From: ${esc(email)} · ${new Date().toUTCString()}</p>
  </div>`;

  const parkEmailed = await sendEmail(env, {
    subject: `New booking request — ${firstName} ${lastName}`,
    replyTo: email,
    html: parkHtml
  });

  /* ── Guest acknowledgment ── */
  const guestHtml = `<div style="font-family:sans-serif;max-width:540px;margin:0 auto">
    ${header('We received your request!', 'Eileen Scott Centennial Park · Bamfield, BC')}
    <div style="border:1px solid ${BORDER};border-top:none;border-radius:0 0 10px 10px;padding:20px 24px">
      <p style="margin:0 0 1rem">Hi <strong>${fullName}</strong>, thanks for reaching out!</p>
      <p style="margin:0 0 1rem;color:#374151">We've received your request and will be in touch within 1–2 business days to confirm availability and next steps.</p>
      <div style="background:#f0f7f1;border-radius:8px;padding:14px 18px;margin:1.2rem 0">
        <strong style="color:${GREEN}">Your request summary</strong>
        <table style="width:100%;border-collapse:collapse;margin-top:.75rem">
          ${row('Requested',  esc(wants))}
          ${row('Check-in',   esc(checkIn  || '—'))}
          ${row('Check-out',  esc(checkOut || '—'))}
          ${row('Party size', esc(groupSize || '—'))}
          ${boatLength ? row('Boat length', esc(boatLength)) : ''}
        </table>
      </div>
      <p style="color:#374151;margin:0 0 .5rem">Questions? Reply to this email or call <a href="tel:+12507283006" style="color:${GREEN}">250-728-3006</a>.</p>
      <p style="color:#9ca3af;font-size:12px;margin-top:1.5rem">${id ? `Reference #${id} · ` : ''}Eileen Scott Centennial Park, Bamfield, BC</p>
    </div>
  </div>`;

  const guestEmailed = await sendEmail(env, {
    subject: `We received your request — Eileen Scott Centennial Park`,
    to: email,
    replyTo: env.NOTIFY_TO || 'bamfieldcentennialpark@gmail.com',
    html: guestHtml
  });

  if ((parkEmailed || guestEmailed) && stored && id != null) {
    try { await env.DB.prepare('UPDATE booking_submissions SET emailed = 1 WHERE id = ?').bind(id).run(); }
    catch (_e) { /* non-fatal */ }
  }

  if (stored || parkEmailed || guestEmailed) return json({ ok: true });
  return json({ error: 'Could not submit your request. Please call or email us directly.' }, 502);
}
