/* POST /api/booking — store a booking request in D1, then email it.
   Delivered if EITHER the D1 insert OR the email succeeds. */

import { json, esc, clean, looksLikeEmail, sendEmail, verifyTurnstile } from './_lib.js';

export async function onRequestPost(context) {
  const { request, env } = context;

  let data;
  try { data = await request.json(); }
  catch (_e) { return json({ error: 'Bad request' }, 400); }

  if (data.website) return json({ ok: true });   // honeypot

  /* bot check (skipped automatically if Turnstile isn't configured) */
  const ipAddr = request.headers.get('CF-Connecting-IP') || '';
  const human = await verifyTurnstile(env, data['cf-turnstile-response'], ipAddr);
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

  const ip = ipAddr;
  const ua = request.headers.get('User-Agent') || '';

  let stored = false, id = null;
  if (env.DB) {
    try {
      const res = await env.DB.prepare(
        'INSERT INTO booking_submissions ' +
        '(first_name, last_name, email, need_campsite, need_moorage, site_count, group_size, boat_length, check_in, check_out, additional_requests, ip, user_agent) ' +
        'VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
      ).bind(firstName, lastName, email, campsite, moorage, siteCount, groupSize, boatLength, checkIn, checkOut, notes, ip, ua).run();
      stored = true;
      id = (res.meta && res.meta.last_row_id) || null;
    } catch (_e) { /* fall through to email */ }
  }

  const wants = [];
  if (campsite === 'yes') wants.push('Campsite');
  if (moorage === 'yes')  wants.push('Moorage');

  const emailed = await sendEmail(env, {
    subject: 'New booking request — ' + firstName + ' ' + lastName,
    replyTo: email,
    html:
      '<h2 style="font-family:sans-serif">New booking request</h2>' +
      '<p><strong>Name:</strong> ' + esc(firstName + ' ' + lastName) + '</p>' +
      '<p><strong>Email:</strong> ' + esc(email) + '</p>' +
      '<p><strong>Booking:</strong> ' + esc(wants.join(' + ') || '(not specified)') + '</p>' +
      '<p><strong>Sites:</strong> ' + esc(siteCount || '—') + ' &nbsp; <strong>People:</strong> ' + esc(groupSize || '—') + '</p>' +
      '<p><strong>Boat length:</strong> ' + esc(boatLength || '—') + '</p>' +
      '<p><strong>Check-in:</strong> ' + esc(checkIn || '—') + ' &nbsp; <strong>Check-out:</strong> ' + esc(checkOut || '—') + '</p>' +
      '<p><strong>Notes:</strong><br>' + esc(notes || '(none)').replace(/\n/g, '<br>') + '</p>'
  });

  if (emailed && stored && id != null) {
    try { await env.DB.prepare('UPDATE booking_submissions SET emailed = 1 WHERE id = ?').bind(id).run(); }
    catch (_e) { /* non-fatal */ }
  }

  if (stored || emailed) return json({ ok: true });
  return json({ error: 'Could not submit your request. Please call or email us directly.' }, 502);
}
