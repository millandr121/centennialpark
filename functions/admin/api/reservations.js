/* Admin API: CRUD for reservations — the unified booking backend.
   All routes require auth via _middleware.js. Data-layer helpers live in
   functions/api/_reservations.js (shared with the public /api/reserve route). */

import { clean, tableCols, sendEmail, json } from '../../api/_lib.js';
import { paidEmail, paymentRequestEmail } from '../../api/_emails.js';
import { clampMoney } from '../../api/_calc.js';
import { PAYMENT_STATUSES, RES_STATUSES, MANUAL_SOURCES } from '../../api/_constants.js';
import {
  isExclusive, lookupSite, hasConflict,
  insertReservation, insertReservationGuarded
} from '../../api/_reservations.js';

/* Build a "party size" SELECT expression that works on either schema. */
function partyExpr(cols) {
  if (cols.has('party_size') && cols.has('people')) return 'COALESCE(r.party_size, r.people)';
  if (cols.has('party_size')) return 'r.party_size';
  if (cols.has('people'))     return 'r.people';
  return 'NULL';
}

/* GET /admin/api/reservations[?month=YYYY-MM&status=...&site=C1&payment=unpaid] */
export async function onRequestGet(context) {
  const { env, request } = context;
  if (!env.DB) return json({ error: 'DB not bound' }, 503);

  const url     = new URL(request.url);
  const month   = url.searchParams.get('month')   || '';
  const status  = url.searchParams.get('status')  || 'all';
  const site    = url.searchParams.get('site')    || '';
  const payment = url.searchParams.get('payment') || '';

  const rCols = await tableCols(env, 'reservations');
  const sCols = await tableCols(env, 'sites');
  const nameCol = sCols.has('name') ? 's.name' : sCols.has('label') ? 's.label' : 's.id';
  const party   = partyExpr(rCols);

  let q = `SELECT r.*, ${party} as party_size, ${nameCol} as site_name, s.type as site_type
           FROM reservations r JOIN sites s ON r.site_id = s.id WHERE 1=1`;
  const params = [];

  /* Indexed range beats a leading-prefix LIKE for the month filter. */
  if (month)   { q += ' AND r.check_in >= ? AND r.check_in < ?'; params.push(month + '-01', month + '-32'); }
  if (status !== 'all') { q += ' AND r.status = ?'; params.push(status); }
  if (site)    { q += ' AND r.site_id = ?'; params.push(site); }
  if (payment && rCols.has('payment_status')) { q += ' AND r.payment_status = ?'; params.push(payment); }
  // Opt-in window for the admin list: recent past + everything upcoming. Off by
  // default so the dashboard and income reports keep seeing all-time data.
  if (url.searchParams.get('recent') === '1' && !month) {
    q += " AND r.check_in >= date('now','-90 days')";
  }
  q += ' ORDER BY r.check_in ASC, r.created_at ASC';

  try {
    const res = await env.DB.prepare(q).bind(...params).all();
    return json({ reservations: res.results || [] });
  } catch (e) {
    console.error('reservations GET failed —', e && e.message);
    return json({ error: 'Could not load reservations.' }, 500);
  }
}

/* POST /admin/api/reservations — create manual booking */
export async function onRequestPost(context) {
  const { env, request } = context;
  if (!env.DB) return json({ error: 'DB not bound' }, 503);

  let d;
  try { d = await request.json(); } catch { return json({ error: 'Bad JSON' }, 400); }

  const siteId    = clean(d.siteId, 10);
  const checkIn   = clean(d.checkIn, 12);
  const checkOut  = clean(d.checkOut, 12);
  const name      = clean(d.guestName, 200);
  const email     = clean(d.guestEmail, 200);
  const phone     = clean(d.guestPhone, 50);
  const partySize = parseInt(d.partySize)  || null;
  const boatLen   = parseInt(d.boatLength) || null;
  const notes     = clean(d.notes, 2000);
  const source    = MANUAL_SOURCES.includes(d.source) ? d.source : 'admin';
  const amountDue = clampMoney(d.amountDue);
  const payMethod = clean(d.paymentMethod, 40) || null;
  const payStatus = PAYMENT_STATUSES.includes(d.paymentStatus) ? d.paymentStatus : 'unpaid';

  if (!siteId || !checkIn || !checkOut || !name) return json({ error: 'Missing required fields' }, 422);

  const site = await env.DB.prepare('SELECT id, type FROM sites WHERE id = ?').bind(siteId).first();
  if (!site) return json({ error: 'Unknown site' }, 404);

  const r = {
    siteId, checkIn, checkOut, name, email, phone, partySize, boatLen, notes,
    source, status: 'confirmed', amountDue,
    paymentMethod: payMethod, paymentStatus: payStatus,
    submissionId: parseInt(d.submissionId) || null
  };

  /* Only numbered campsite/moorage slots are exclusive. Generic service lots
     (parking, launch) hold many bookings at once — never conflict-check them.
     The guarded insert checks availability and writes in ONE statement, so two
     concurrent requests can't both win the same slot. */
  try {
    if (isExclusive(site.type)) {
      const out = await insertReservationGuarded(env, r);
      if (out.conflict) return json({ error: 'Date conflict — that site is already booked for those dates.' }, 409);
      return json({ ok: true, id: out.id });
    }
    const id = await insertReservation(env, r);
    return json({ ok: true, id });
  } catch (e) {
    console.error('reservations POST failed —', e && e.message);
    return json({ error: 'Could not create the reservation.' }, 500);
  }
}

/* PUT /admin/api/reservations — update any field incl. status + payment */
export async function onRequestPut(context) {
  const { env, request } = context;
  if (!env.DB) return json({ error: 'DB not bound' }, 503);

  let d;
  try { d = await request.json(); } catch { return json({ error: 'Bad JSON' }, 400); }

  const id = parseInt(d.id);
  if (!id) return json({ error: 'Missing id' }, 422);

  const rCols  = await tableCols(env, 'reservations');
  const status = RES_STATUSES.includes(d.status) ? d.status : null;
  const pay    = PAYMENT_STATUSES.includes(d.paymentStatus) ? d.paymentStatus : null;

  /* Conflict guard for the EDIT path: if the admin moves a booking to a new
     site or new dates, make sure it doesn't land on an occupied exclusive slot.
     Inserts are already atomic; this closes the same hole on updates. */
  if (d.siteId || d.checkIn || d.checkOut) {
    const cur = await env.DB.prepare(
      'SELECT site_id, check_in, check_out, status FROM reservations WHERE id = ?'
    ).bind(id).first();
    if (cur) {
      const effSite   = d.siteId   ? clean(d.siteId, 10)   : cur.site_id;
      const effIn     = d.checkIn  ? clean(d.checkIn, 12)  : cur.check_in;
      const effOut    = d.checkOut ? clean(d.checkOut, 12) : cur.check_out;
      const effStatus = status || cur.status || 'confirmed';
      if (effStatus === 'confirmed' && effIn < effOut) {
        const site = await lookupSite(env, effSite);
        if (site && isExclusive(site.type)) {
          const conflict = await hasConflict(env, effSite, effIn, effOut, id);
          if (conflict) return json({ error: 'Date conflict — that site is already booked for those dates (#' + conflict.id + ').' }, 409);
        }
      }
    }
  }

  const sets = [], vals = [];
  if (status)                     { sets.push('status = ?');      vals.push(status); }
  if (d.notes      !== undefined) { sets.push('notes = ?');       vals.push(clean(d.notes, 2000)); }
  if (d.checkIn)                  { sets.push('check_in = ?');    vals.push(clean(d.checkIn, 12)); }
  if (d.checkOut)                 { sets.push('check_out = ?');   vals.push(clean(d.checkOut, 12)); }
  if (d.guestName)                { sets.push('guest_name = ?');  vals.push(clean(d.guestName, 200)); }
  if (d.guestEmail !== undefined) { sets.push('guest_email = ?'); vals.push(clean(d.guestEmail, 200)); }
  if (d.guestPhone !== undefined) { sets.push('guest_phone = ?'); vals.push(clean(d.guestPhone, 50)); }
  if (d.siteId)                   { sets.push('site_id = ?');     vals.push(clean(d.siteId, 10)); }
  if (d.boatLength !== undefined) { sets.push('boat_length = ?'); vals.push(parseInt(d.boatLength) || null); }
  if (d.partySize  !== undefined) {
    const col = rCols.has('party_size') ? 'party_size' : 'people';
    sets.push(`${col} = ?`); vals.push(parseInt(d.partySize) || null);
  }
  if (pay && rCols.has('payment_status'))      { sets.push('payment_status = ?'); vals.push(pay); }
  /* Stamp when payment landed (income is reported by this date). Keep the first
     paid date if already set; clear it if reverted to unpaid. */
  if (pay && rCols.has('paid_at')) {
    if (pay === 'paid')        sets.push("paid_at = COALESCE(paid_at, datetime('now'))");
    else if (pay === 'unpaid') sets.push('paid_at = NULL');
  }
  if (d.amountDue  !== undefined && rCols.has('amount_due'))  { sets.push('amount_due = ?');  vals.push(clampMoney(d.amountDue)); }
  if (d.amountPaid !== undefined && rCols.has('amount_paid')) { sets.push('amount_paid = ?'); vals.push(clampMoney(d.amountPaid)); }
  if (d.paymentMethod   !== undefined && rCols.has('payment_method'))     { sets.push('payment_method = ?');     vals.push(clean(d.paymentMethod, 50) || null); }
  if (d.estimatedTotal  !== undefined && rCols.has('estimated_total'))     { sets.push('estimated_total = ?');    vals.push(clampMoney(d.estimatedTotal)); }
  /* GST: an exempt booking always stores 0; otherwise store what was sent. */
  const gstExempt = d.gstExempt === true || d.gstExempt === 1 || d.gstExempt === '1';
  if (d.gstExempt !== undefined && rCols.has('gst_exempt')) { sets.push('gst_exempt = ?'); vals.push(gstExempt ? 1 : 0); }
  if (rCols.has('gst_amount') && (d.gstAmount !== undefined || d.gstExempt !== undefined)) {
    sets.push('gst_amount = ?');
    vals.push(gstExempt ? 0 : clampMoney(d.gstAmount));
  }
  if (d.parkingType     !== undefined && rCols.has('parking_type'))        { sets.push('parking_type = ?');       vals.push(clean(d.parkingType, 50) || null); }
  if (d.boatLaunchPeriod !== undefined && rCols.has('boat_launch_period')) { sets.push('boat_launch_period = ?'); vals.push(clean(d.boatLaunchPeriod, 50) || null); }

  if (sets.length) {
    vals.push(id);
    try {
      await env.DB.prepare(`UPDATE reservations SET ${sets.join(', ')} WHERE id = ?`).bind(...vals).run();
    } catch (e) {
      console.error('reservations PUT failed —', e && e.message);
      return json({ error: 'Could not save the reservation.' }, 500);
    }
  }

  /* Optional: email the guest that payment was received and their booking is
     complete. Triggered explicitly by the admin (checkbox), not automatic. */
  let paidEmailSent = false;
  if (d.notifyPaid) {
    try {
      const r = await env.DB.prepare('SELECT * FROM reservations WHERE id = ?').bind(id).first();
      if (r && r.guest_email) {
        const site = await lookupSite(env, r.site_id);
        const { subject, html } = paidEmail({
          name: r.guest_name, site, parkingType: r.parking_type,
          checkIn: r.check_in, checkOut: r.check_out, resId: id,
          estTotal: parseFloat(r.amount_paid) || parseFloat(r.amount_due) || parseFloat(r.estimated_total) || 0
        });
        paidEmailSent = await sendEmail(env, { subject, html, to: r.guest_email, replyTo: env.NOTIFY_TO });
      }
    } catch (_e) { console.error('paid email failed —', _e && _e.message); }
  }

  /* Optional: email the guest a payment request with a 48-hour hold. Admin-triggered. */
  let paymentRequestSent = false;
  if (d.requestPayment) {
    try {
      const r = await env.DB.prepare('SELECT * FROM reservations WHERE id = ?').bind(id).first();
      if (r && r.guest_email) {
        const site = await lookupSite(env, r.site_id);
        const due = parseFloat(r.amount_due) || parseFloat(r.estimated_total) || 0;
        const { subject, html } = paymentRequestEmail({
          name: r.guest_name, site, parkingType: r.parking_type,
          checkIn: r.check_in, checkOut: r.check_out, resId: id,
          amountDue: due, payMethod: r.payment_method
        });
        paymentRequestSent = await sendEmail(env, { subject, html, to: r.guest_email, replyTo: env.NOTIFY_TO });
      }
    } catch (_e) { console.error('payment-request email failed —', _e && _e.message); }
  }

  return json({ ok: true, paidEmailSent, paymentRequestSent });
}

/* DELETE /admin/api/reservations?id=123 — permanently remove a reservation */
export async function onRequestDelete(context) {
  const { env, request } = context;
  if (!env.DB) return json({ error: 'DB not bound' }, 503);
  const id = parseInt(new URL(request.url).searchParams.get('id'));
  if (!id) return json({ error: 'Missing id' }, 422);
  try {
    await env.DB.prepare('DELETE FROM reservations WHERE id = ?').bind(id).run();
    return json({ ok: true });
  } catch (e) {
    console.error('reservations DELETE failed —', e && e.message);
    return json({ error: 'Could not delete the reservation.' }, 500);
  }
}
