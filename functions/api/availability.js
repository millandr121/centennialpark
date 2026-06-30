/* GET /api/availability?checkin=YYYY-MM-DD&checkout=YYYY-MM-DD[&type=campsite|moorage|all] */

import { OVERLAP_WHERE } from './_calc.js';

export async function onRequestGet(context) {
  const { env, request } = context;
  const url      = new URL(request.url);
  const checkIn  = url.searchParams.get('checkin')  || '';
  const checkOut = url.searchParams.get('checkout') || '';
  const type     = url.searchParams.get('type')     || 'all';

  if (!checkIn || !checkOut) return err('checkin and checkout are required', 400);
  if (checkIn >= checkOut)   return err('checkout must be after checkin', 400);
  if (!env.DB)               return err('Booking system unavailable', 503);

  /* Support both schema variants: name/active and label/status */
  let sites = [];
  try {
    const q = type === 'all'
      ? 'SELECT id, name, type FROM sites WHERE active=1'
      : 'SELECT id, name, type FROM sites WHERE active=1 AND type=?';
    const r = await env.DB.prepare(q).bind(...(type === 'all' ? [] : [type])).all();
    sites = r.results || [];
  } catch (_) {
    /* Fallback: schema uses label/status columns */
    try {
      const q = type === 'all'
        ? "SELECT id, label as name, type FROM sites WHERE status='active'"
        : "SELECT id, label as name, type FROM sites WHERE status='active' AND type=?";
      const r = await env.DB.prepare(q).bind(...(type === 'all' ? [] : [type])).all();
      sites = r.results || [];
    } catch (e2) {
      return err('Could not load sites: ' + e2.message, 500);
    }
  }

  /* Overlap (half-open intervals): existing.check_in < requested.checkout AND
     existing.check_out > requested.checkin. Same-day turnover is allowed. */
  const bookedRes = await env.DB.prepare(
    `SELECT DISTINCT site_id FROM reservations
     WHERE status='confirmed' AND ${OVERLAP_WHERE}`
  ).bind(checkOut, checkIn).all();

  const booked = new Set((bookedRes.results || []).map(r => r.site_id));

  return json({
    checkin:   checkIn,
    checkout:  checkOut,
    available: sites.filter(s => !booked.has(s.id)),
    booked:    sites.filter(s =>  booked.has(s.id))
  });
}

function json(obj, s) {
  return new Response(JSON.stringify(obj), {
    status: s || 200,
    headers: { 'Content-Type':'application/json', 'Access-Control-Allow-Origin':'*' }
  });
}
function err(msg, s) { return json({ error: msg }, s); }

