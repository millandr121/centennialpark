/* Admin API: CRUD for reservations — the unified booking backend.
   All routes require auth via _middleware.js. */

import { clean, tableCols, sendEmail, json } from '../../api/_lib.js';
import { paidEmail, paymentRequestEmail } from '../../api/_emails.js';
import { OVERLAP_WHERE } from '../../api/_calc.js';

/* Numbered slots are single-occupancy; generic service lots are not. */
export function isExclusive(type) { return type === 'campsite' || type === 'moorage'; }

/* 'YYYY-MM-DD HH:MM:SS' (UTC) — matches the DB's datetime('now') format. */
function nowStamp() { return new Date().toISOString().replace('T', ' ').slice(0, 19); }

/* Site row with schema fallback — this DB uses label/status, older code used name/active. */
async function lookupSite(env, siteId) {
  try { return await env.DB.prepare('SELECT id, name, type FROM sites WHERE id = ?').bind(siteId).first(); }
  catch { return await env.DB.prepare('SELECT id, label as name, type FROM sites WHERE id = ?').bind(siteId).first(); }
}

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

  if (month)   { q += ' AND r.check_in LIKE ?'; params.push(month + '%'); }
  if (status !== 'all') { q += ' AND r.status = ?'; params.push(status); }
  if (site)    { q += ' AND r.site_id = ?'; params.push(site); }
  if (payment && rCols.has('payment_status')) { q += ' AND r.payment_status = ?'; params.push(payment); }
  q += ' ORDER BY r.check_in ASC, r.created_at ASC';

  try {
    const res = await env.DB.prepare(q).bind(...params).all();
    return json({ reservations: res.results || [] });
  } catch (e) {
    return json({ error: e.message }, 500);
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
  const source    = ['phone', 'walkin', 'admin'].includes(d.source) ? d.source : 'admin';
  const amountDue = d.amountDue != null && d.amountDue !== '' ? parseFloat(d.amountDue) : null;
  const payMethod = clean(d.paymentMethod, 40) || null;
  const payStatus = ['unpaid', 'deposit', 'paid'].includes(d.paymentStatus) ? d.paymentStatus : 'unpaid';

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
  if (isExclusive(site.type)) {
    const out = await insertReservationGuarded(env, r);
    if (out.conflict) return json({ error: 'Date conflict — that site is already booked for those dates.' }, 409);
    return json({ ok: true, id: out.id });
  }
  const id = await insertReservation(env, r);
  return json({ ok: true, id });
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
  const status = ['confirmed', 'cancelled', 'pending'].includes(d.status) ? d.status : null;
  const pay    = ['unpaid', 'deposit', 'paid'].includes(d.paymentStatus) ? d.paymentStatus : null;

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
  if (d.amountDue  !== undefined && rCols.has('amount_due'))  { sets.push('amount_due = ?');  vals.push(d.amountDue === '' ? null : parseFloat(d.amountDue)); }
  if (d.amountPaid !== undefined && rCols.has('amount_paid')) { sets.push('amount_paid = ?'); vals.push(d.amountPaid === '' ? null : parseFloat(d.amountPaid)); }
  if (d.paymentMethod   !== undefined && rCols.has('payment_method'))     { sets.push('payment_method = ?');     vals.push(clean(d.paymentMethod, 50) || null); }
  if (d.estimatedTotal  !== undefined && rCols.has('estimated_total'))     { sets.push('estimated_total = ?');    vals.push(d.estimatedTotal === '' ? null : parseFloat(d.estimatedTotal)); }
  /* GST: an exempt booking always stores 0; otherwise store what was sent. */
  const gstExempt = d.gstExempt === true || d.gstExempt === 1 || d.gstExempt === '1';
  if (d.gstExempt !== undefined && rCols.has('gst_exempt')) { sets.push('gst_exempt = ?'); vals.push(gstExempt ? 1 : 0); }
  if (rCols.has('gst_amount') && (d.gstAmount !== undefined || d.gstExempt !== undefined)) {
    sets.push('gst_amount = ?');
    vals.push(gstExempt ? 0 : (d.gstAmount === '' || d.gstAmount == null ? null : parseFloat(d.gstAmount)));
  }
  if (d.parkingType     !== undefined && rCols.has('parking_type'))        { sets.push('parking_type = ?');       vals.push(clean(d.parkingType, 50) || null); }
  if (d.boatLaunchPeriod !== undefined && rCols.has('boat_launch_period')) { sets.push('boat_launch_period = ?'); vals.push(clean(d.boatLaunchPeriod, 50) || null); }

  if (sets.length) {
    vals.push(id);
    try {
      await env.DB.prepare(`UPDATE reservations SET ${sets.join(', ')} WHERE id = ?`).bind(...vals).run();
    } catch (e) { return json({ error: e.message }, 500); }
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
    } catch (_e) { /* email is best-effort */ }
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
    } catch (_e) { /* best-effort */ }
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
  } catch (e) { return json({ error: e.message }, 500); }
}

/* Build the column/value lists for a reservation insert, writing only the
   columns the live table actually has (pre-migration safety). */
function buildReservationInsert(cols, r) {
  const fields = ['site_id', 'check_in', 'check_out', 'guest_name', 'guest_email', 'guest_phone', 'notes'];
  const values = [r.siteId, r.checkIn, r.checkOut, r.name, r.email || '', r.phone || null, r.notes || null];

  const opt = (col, val) => { if (cols.has(col)) { fields.push(col); values.push(val); } };
  opt(cols.has('party_size') ? 'party_size' : 'people', r.partySize ?? null);
  opt('boat_length',   r.boatLen ?? null);
  opt('boat_wash_qty', r.boatWash ?? 0);
  opt('freezer_days',  r.freezer ?? 0);
  opt('source',        r.source || 'admin');
  opt('status',        r.status || 'confirmed');
  opt('payment_status', r.paymentStatus || 'unpaid');
  opt('amount_due',    r.amountDue ?? null);
  opt('payment_method',     r.paymentMethod ?? null);
  opt('estimated_total',    r.estimatedTotal ?? null);
  opt('gst_amount',         r.gstAmount ?? null);
  opt('gst_exempt',         r.gstExempt ? 1 : 0);
  opt('paid_at',            r.paidAt ?? (r.paymentStatus === 'paid' ? nowStamp() : null));
  opt('parking_type',       r.parkingType ?? null);
  opt('boat_launch_period', r.boatLaunchPeriod ?? null);
  opt('submission_id', r.submissionId ?? null);
  return { fields, values };
}

/* Shared insert that only writes columns the table actually has. */
export async function insertReservation(env, r) {
  const cols = await tableCols(env, 'reservations');
  const { fields, values } = buildReservationInsert(cols, r);
  const placeholders = fields.map(() => '?').join(',');
  const res = await env.DB.prepare(
    `INSERT INTO reservations (${fields.join(',')}) VALUES (${placeholders})`
  ).bind(...values).run();
  return res.meta && res.meta.last_row_id;
}

/* Atomic, conflict-safe insert for EXCLUSIVE sites (campsite/moorage).
   Performs the overlap check and the write in a single INSERT…SELECT…WHERE
   NOT EXISTS statement, so two concurrent bookings can't both take the same
   slot (no check-then-act race). Returns { id } on success, { conflict:true }
   if an overlapping confirmed reservation already exists. */
export async function insertReservationGuarded(env, r) {
  const cols = await tableCols(env, 'reservations');
  const { fields, values } = buildReservationInsert(cols, r);
  const placeholders = fields.map(() => '?').join(',');
  const sql =
    `INSERT INTO reservations (${fields.join(',')})
     SELECT ${placeholders}
     WHERE NOT EXISTS (
       SELECT 1 FROM reservations
       WHERE site_id = ? AND status = 'confirmed' AND ${OVERLAP_WHERE}
     )`;
  const res = await env.DB.prepare(sql)
    .bind(...values, r.siteId, r.checkOut, r.checkIn)
    .run();
  if ((res.meta?.changes ?? 0) === 0) return { conflict: true };
  return { id: res.meta && res.meta.last_row_id };
}
