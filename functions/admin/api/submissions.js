/* Admin API: form booking requests (the "inbox").
   GET list · PUT edit/status · POST accept → convert to a real reservation. */

import { clean, tableCols } from '../../api/_lib.js';
import { insertReservation } from './reservations.js';

function json(o, s) {
  return new Response(JSON.stringify(o), {
    status: s || 200, headers: { 'Content-Type': 'application/json' }
  });
}

/* GET /admin/api/submissions[?month=YYYY-MM&status=new|accepted|declined|all] */
export async function onRequestGet(context) {
  const { env, request } = context;
  if (!env.DB) return json({ error: 'DB not bound' }, 503);

  const url    = new URL(request.url);
  const month  = url.searchParams.get('month')  || '';
  const status = url.searchParams.get('status') || 'all';
  const cols   = await tableCols(env, 'booking_submissions');

  let q = 'SELECT * FROM booking_submissions WHERE 1=1';
  const params = [];
  if (month) { q += ' AND (check_in LIKE ? OR created_at LIKE ?)'; params.push(month + '%', month + '%'); }
  if (status !== 'all' && cols.has('status')) { q += ' AND COALESCE(status,\'new\') = ?'; params.push(status); }
  q += ' ORDER BY created_at DESC';

  try {
    const res = await env.DB.prepare(q).bind(...params).all();
    return json({ submissions: res.results || [] });
  } catch (e) { return json({ error: e.message }, 500); }
}

/* PUT /admin/api/submissions — edit fields or change status (new/accepted/declined) */
export async function onRequestPut(context) {
  const { env, request } = context;
  if (!env.DB) return json({ error: 'DB not bound' }, 503);

  let d;
  try { d = await request.json(); } catch { return json({ error: 'Bad JSON' }, 400); }

  const id = parseInt(d.id);
  if (!id) return json({ error: 'Missing id' }, 422);

  const cols = await tableCols(env, 'booking_submissions');
  const map = {
    firstName: 'first_name', lastName: 'last_name', email: 'email',
    siteCount: 'site_count', groupSize: 'group_size', boatLength: 'boat_length',
    checkIn: 'check_in', checkOut: 'check_out', additionalRequests: 'additional_requests',
    needCampsite: 'need_campsite', needMoorage: 'need_moorage'
  };
  const sets = [], vals = [];
  for (const [k, col] of Object.entries(map)) {
    if (d[k] !== undefined && cols.has(col)) { sets.push(`${col} = ?`); vals.push(clean(d[k], 2000)); }
  }
  if (d.status && cols.has('status') && ['new', 'accepted', 'declined'].includes(d.status)) {
    sets.push('status = ?'); vals.push(d.status);
  }

  if (sets.length) {
    vals.push(id);
    try { await env.DB.prepare(`UPDATE booking_submissions SET ${sets.join(', ')} WHERE id = ?`).bind(...vals).run(); }
    catch (e) { return json({ error: e.message }, 500); }
  }
  return json({ ok: true });
}

/* POST /admin/api/submissions — accept a request: create a reservation, link it back.
   body: { submissionId, siteId, checkIn, checkOut, partySize, boatLength, amountDue, notes } */
export async function onRequestPost(context) {
  const { env, request } = context;
  if (!env.DB) return json({ error: 'DB not bound' }, 503);

  let d;
  try { d = await request.json(); } catch { return json({ error: 'Bad JSON' }, 400); }

  const submissionId = parseInt(d.submissionId);
  const siteId   = clean(d.siteId, 10);
  const checkIn  = clean(d.checkIn, 12);
  const checkOut = clean(d.checkOut, 12);
  if (!submissionId || !siteId || !checkIn || !checkOut) return json({ error: 'Missing required fields' }, 422);

  const sub = await env.DB.prepare('SELECT * FROM booking_submissions WHERE id = ?').bind(submissionId).first();
  if (!sub) return json({ error: 'Submission not found' }, 404);

  const site = await env.DB.prepare('SELECT id FROM sites WHERE id = ?').bind(siteId).first();
  if (!site) return json({ error: 'Unknown site' }, 404);

  /* availability guard */
  const conflict = await env.DB.prepare(
    `SELECT id FROM reservations WHERE site_id = ? AND status = 'confirmed'
     AND check_in < ? AND date(check_out, '+1 day') > ?`
  ).bind(siteId, checkOut, checkIn).first();
  if (conflict) return json({ error: 'That site is already booked for those dates (reservation #' + conflict.id + ')' }, 409);

  const name = [sub.first_name, sub.last_name].filter(Boolean).join(' ') || 'Guest';
  const id = await insertReservation(env, {
    siteId, checkIn, checkOut,
    name,
    email:     sub.email || '',
    phone:     null,
    partySize: parseInt(d.partySize) || parseInt(sub.group_size) || null,
    boatLen:   parseInt(d.boatLength) || parseInt(sub.boat_length) || null,
    notes:     clean(d.notes, 2000) || sub.additional_requests || null,
    source:    'form',
    status:    'confirmed',
    amountDue: d.amountDue != null && d.amountDue !== '' ? parseFloat(d.amountDue) : null,
    submissionId
  });

  /* mark submission accepted + link (best-effort if columns exist) */
  const subCols = await tableCols(env, 'booking_submissions');
  if (subCols.has('status')) {
    const sets = ['status = ?'], vals = ['accepted'];
    if (subCols.has('reservation_id')) { sets.push('reservation_id = ?'); vals.push(id); }
    vals.push(submissionId);
    await env.DB.prepare(`UPDATE booking_submissions SET ${sets.join(', ')} WHERE id = ?`).bind(...vals).run().catch(() => {});
  }

  /* Send acceptance email to guest */
  const nights = Math.round((new Date(checkOut) - new Date(checkIn)) / 86400000);
  const siteName = siteId;
  const amtNote = d.amountDue ? `$${parseFloat(d.amountDue).toFixed(2)} deposit` : 'deposit';
  await env.RESEND_API_KEY && fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'Authorization': 'Bearer ' + env.RESEND_API_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: env.RESEND_FROM || 'Centennial Park <onboarding@resend.dev>',
      to: sub.email,
      reply_to: env.NOTIFY_TO || 'bamfieldcentennialpark@gmail.com',
      subject: `Booking confirmed — ${siteName}, Eileen Scott Centennial Park`,
      html: `<div style="font-family:sans-serif;max-width:540px;margin:0 auto">
        <div style="background:#2e5d33;color:#fff;padding:20px 24px;border-radius:10px;margin-bottom:1.2rem">
          <div style="font-size:18px;font-weight:700">Your Booking is Confirmed — ${siteName}</div>
          <div style="font-size:13px;opacity:.8">Eileen Scott Centennial Park · Bamfield, BC</div>
        </div>
        <p>Hi <strong>${name}</strong>, we've confirmed your reservation!</p>
        <table style="border-collapse:collapse;width:100%;margin:1rem 0">
          <tr><th style="background:#2e5d33;color:#fff;padding:8px 12px;font-size:12px">Site</th><th style="background:#2e5d33;color:#fff;padding:8px 12px;font-size:12px">Check-in</th><th style="background:#2e5d33;color:#fff;padding:8px 12px;font-size:12px">Check-out</th><th style="background:#2e5d33;color:#fff;padding:8px 12px;font-size:12px">Nights</th></tr>
          <tr><td style="padding:8px 12px;border-bottom:1px solid #e5e7eb">${siteName}</td><td style="padding:8px 12px;border-bottom:1px solid #e5e7eb">${checkIn}</td><td style="padding:8px 12px;border-bottom:1px solid #e5e7eb">${checkOut}</td><td style="padding:8px 12px;border-bottom:1px solid #e5e7eb">${nights}</td></tr>
        </table>
        <div style="background:#fff8ee;border:1px solid #f0b84a;border-radius:8px;padding:14px 18px;margin:1.2rem 0">
          <strong style="color:#d4830a">💳 Payment — Interac e-Transfer</strong><br><br>
          Please send your ${amtNote} to:<br>
          <strong>bamfieldcentennialpark@gmail.com</strong><br>
          Reference: <strong>#${id} ${name}</strong><br><br>
          <span style="color:#6b7280;font-size:13px">Balance is due on arrival. Cash and card also accepted at the park.</span>
        </div>
        <p style="color:#374151">Questions? Reply to this email or call <a href="tel:+12507283006">250-728-3006</a>.</p>
        <p style="color:#9ca3af;font-size:12px;margin-top:2rem">Reservation #${id}</p>
      </div>`
    })
  }).catch(() => {});

  return json({ ok: true, reservationId: id });
}
