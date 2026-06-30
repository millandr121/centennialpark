/* Admin API: form booking requests (the "inbox").
   GET list · PUT edit/status · POST accept → convert to a real reservation. */

import { clean, tableCols, sendEmail, json } from '../../api/_lib.js';
import { insertReservation, insertReservationGuarded, isExclusive } from './reservations.js';
import { acceptanceEmail } from '../../api/_emails.js';

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

  let site = null;
  try {
    site = await env.DB.prepare('SELECT id, name, type FROM sites WHERE id = ?').bind(siteId).first();
  } catch (_) {
    site = await env.DB.prepare('SELECT id, label as name, type FROM sites WHERE id = ?').bind(siteId).first();
  }
  if (!site) return json({ error: 'Unknown site' }, 404);

  const name = [sub.first_name, sub.last_name].filter(Boolean).join(' ') || 'Guest';

  /* Pricing + service fields: an admin override wins, else fall back to the
     values the guest submitted on the request form. */
  const num = (v, fb) => (v != null && v !== '' ? parseFloat(v) : (parseFloat(fb) || 0));
  const estTotal    = num(d.estimatedTotal, sub.estimated_total);
  const gstAmt      = num(d.gstAmount, sub.gst_amount);
  const payMethod   = clean(d.paymentMethod, 40) || sub.payment_method || null;
  const payStatus   = ['unpaid', 'deposit', 'paid'].includes(d.paymentStatus) ? d.paymentStatus : 'unpaid';
  const parkingType = clean(d.parkingType, 20) || sub.parking_type || null;
  const launchPrd   = clean(d.boatLaunchPeriod, 20) || sub.boat_launch_period || null;
  const amountDue   = d.amountDue != null && d.amountDue !== '' ? parseFloat(d.amountDue) : (estTotal || null);

  const r = {
    siteId, checkIn, checkOut, name,
    email:     sub.email || '',
    phone:     null,
    partySize: parseInt(d.partySize) || parseInt(sub.group_size) || null,
    boatLen:   parseInt(d.boatLength) || parseInt(sub.boat_length) || null,
    notes:     clean(d.notes, 2000) || sub.additional_requests || null,
    source:    'form',
    status:    'confirmed',
    amountDue,
    paymentStatus:    payStatus,
    paymentMethod:    payMethod,
    estimatedTotal:   estTotal || null,
    gstAmount:        gstAmt || null,
    parkingType,
    boatLaunchPeriod: launchPrd,
    submissionId
  };

  /* availability guard — only exclusive numbered campsite/moorage slots.
     Atomic insert refuses to create an overlapping confirmed booking. */
  let id;
  if (isExclusive(site.type)) {
    const out = await insertReservationGuarded(env, r);
    if (out.conflict) return json({ error: 'That site is already booked for those dates.' }, 409);
    id = out.id;
  } else {
    id = await insertReservation(env, r);
  }

  /* mark submission accepted + link (best-effort if columns exist) */
  const subCols = await tableCols(env, 'booking_submissions');
  if (subCols.has('status')) {
    const sets = ['status = ?'], vals = ['accepted'];
    if (subCols.has('reservation_id')) { sets.push('reservation_id = ?'); vals.push(id); }
    vals.push(submissionId);
    await env.DB.prepare(`UPDATE booking_submissions SET ${sets.join(', ')} WHERE id = ?`).bind(...vals).run().catch(() => {});
  }

  /* Acceptance email — only when the admin opted to send it, with their note.
     The "pay this" figure is the admin's amount-due (defaults to the estimate). */
  let emailSent = false;
  if (d.sendEmail && sub.email) {
    const emailTotal = (amountDue != null && !isNaN(amountDue)) ? amountDue : (estTotal || 0);
    const { subject, html } = acceptanceEmail({
      name, site, parkingType, checkIn, checkOut,
      estTotal: emailTotal, gstAmt: emailTotal === estTotal ? (gstAmt || 0) : 0, resId: id,
      adminMessage: clean(d.adminMessage, 1000), payMethod
    });
    emailSent = await sendEmail(env, {
      subject, html, to: sub.email,
      replyTo: env.NOTIFY_TO || 'bamfieldcentennialpark@gmail.com'
    });
  }

  return json({ ok: true, reservationId: id, emailSent });
}

/* DELETE /admin/api/submissions?id=123 — permanently remove a request */
export async function onRequestDelete(context) {
  const { env, request } = context;
  if (!env.DB) return json({ error: 'DB not bound' }, 503);
  const id = parseInt(new URL(request.url).searchParams.get('id'));
  if (!id) return json({ error: 'Missing id' }, 422);
  try {
    await env.DB.prepare('DELETE FROM booking_submissions WHERE id = ?').bind(id).run();
    return json({ ok: true });
  } catch (e) { return json({ error: e.message }, 500); }
}
