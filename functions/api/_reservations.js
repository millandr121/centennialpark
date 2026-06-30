/* _reservations.js — neutral reservation data layer.
   Shared by the public route (/api/reserve) AND the admin routes
   (/admin/api/reservations, /admin/api/submissions). Lives under /api (not
   /admin) so nothing public imports admin code. Import-only (underscore prefix).

   Holds: site lookup, the dynamic column-aware insert, the atomic conflict-safe
   insert, and a reusable overlap check. */

import { tableCols } from './_lib.js';
import { OVERLAP_WHERE } from './_calc.js';

/* Numbered slots are single-occupancy; generic service lots are not. */
export function isExclusive(type) { return type === 'campsite' || type === 'moorage'; }

/* 'YYYY-MM-DD HH:MM:SS' (UTC) — matches the DB's datetime('now') format. */
export function nowStamp() { return new Date().toISOString().replace('T', ' ').slice(0, 19); }

/* Site row with schema fallback — this DB uses label/status, older code used
   name/active. One copy instead of four scattered try/catch fallbacks. */
export async function lookupSite(env, siteId) {
  try { return await env.DB.prepare('SELECT id, name, type FROM sites WHERE id = ?').bind(siteId).first(); }
  catch { return await env.DB.prepare('SELECT id, label as name, type FROM sites WHERE id = ?').bind(siteId).first(); }
}

/* True if an EXISTING confirmed reservation overlaps [checkIn, checkOut) for
   this site. `excludeId` skips a row (used when editing that row). */
export async function hasConflict(env, siteId, checkIn, checkOut, excludeId) {
  let sql = `SELECT id FROM reservations
             WHERE site_id = ? AND status = 'confirmed' AND ${OVERLAP_WHERE}`;
  const binds = [siteId, checkOut, checkIn];
  if (excludeId) { sql += ' AND id != ?'; binds.push(excludeId); }
  return await env.DB.prepare(sql).bind(...binds).first();
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
