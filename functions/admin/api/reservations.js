/* Admin API: CRUD for reservations (all routes require auth via _middleware.js) */

import { clean } from '../../api/_lib.js';

function json(o, s) {
  return new Response(JSON.stringify(o), {
    status: s||200, headers: {'Content-Type':'application/json'}
  });
}

/* Build site name expression — try name first, fall back to label */
async function siteNameExpr(env) {
  try {
    await env.DB.prepare('SELECT name FROM sites LIMIT 1').first();
    return 's.name';
  } catch (_) {
    return 's.label';
  }
}

/* GET /admin/api/reservations[?month=YYYY-MM&status=confirmed|cancelled|all&site=C1] */
export async function onRequestGet(context) {
  const { env, request } = context;
  if (!env.DB) return json({ error: 'DB not bound' }, 503);

  const url    = new URL(request.url);
  const month  = url.searchParams.get('month')  || '';
  const status = url.searchParams.get('status') || 'confirmed';
  const site   = url.searchParams.get('site')   || '';

  const nameCol = await siteNameExpr(env);

  let q = `SELECT r.*, COALESCE(r.party_size, r.people) as party_size,
            ${nameCol} as site_name, s.type as site_type
            FROM reservations r JOIN sites s ON r.site_id=s.id WHERE 1=1`;
  const params = [];

  if (month) {
    q += ' AND r.check_in LIKE ?';
    params.push(month + '%');
  }
  if (status !== 'all') {
    q += ' AND r.status=?';
    params.push(status);
  }
  if (site) {
    q += ' AND r.site_id=?';
    params.push(site);
  }
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
  const source    = ['phone','walkin','admin'].includes(d.source) ? d.source : 'admin';

  if (!siteId||!checkIn||!checkOut||!name) return json({ error: 'Missing required fields' }, 422);

  const site = await env.DB.prepare('SELECT id FROM sites WHERE id=?').bind(siteId).first();
  if (!site) return json({ error: 'Unknown site' }, 404);

  const conflict = await env.DB.prepare(
    `SELECT id FROM reservations WHERE site_id=? AND status='confirmed'
     AND check_in<? AND date(check_out,'+1 day')>?`
  ).bind(siteId,checkOut,checkIn).first();
  if (conflict) return json({ error: 'Date conflict with existing reservation #'+conflict.id }, 409);

  /* Try full INSERT; fall back to minimal if optional columns don't exist yet */
  let res;
  try {
    res = await env.DB.prepare(
      `INSERT INTO reservations (site_id,check_in,check_out,guest_name,guest_email,guest_phone,
       party_size,boat_length,notes,source) VALUES (?,?,?,?,?,?,?,?,?,?)`
    ).bind(siteId,checkIn,checkOut,name,email||'',phone||null,partySize,boatLen,notes||null,source).run();
  } catch (_) {
    res = await env.DB.prepare(
      `INSERT INTO reservations (site_id,check_in,check_out,guest_name,guest_email,guest_phone,notes)
       VALUES (?,?,?,?,?,?,?)`
    ).bind(siteId,checkIn,checkOut,name,email||'',phone||null,notes||null).run();
  }

  return json({ ok: true, id: res.meta && res.meta.last_row_id });
}

/* PUT /admin/api/reservations — update status or edit fields */
export async function onRequestPut(context) {
  const { env, request } = context;
  if (!env.DB) return json({ error: 'DB not bound' }, 503);

  let d;
  try { d = await request.json(); } catch { return json({ error: 'Bad JSON' }, 400); }

  const id     = parseInt(d.id);
  const status = ['confirmed','cancelled','pending'].includes(d.status) ? d.status : null;
  if (!id) return json({ error: 'Missing id' }, 422);

  const sets = [];
  const vals = [];

  if (status)                    { sets.push('status=?');      vals.push(status); }
  if (d.notes !== undefined)     { sets.push('notes=?');       vals.push(clean(d.notes,2000)); }
  if (d.checkIn)                 { sets.push('check_in=?');    vals.push(clean(d.checkIn,12)); }
  if (d.checkOut)                { sets.push('check_out=?');   vals.push(clean(d.checkOut,12)); }
  if (d.guestName)               { sets.push('guest_name=?');  vals.push(clean(d.guestName,200)); }
  if (d.guestEmail !== undefined){ sets.push('guest_email=?'); vals.push(clean(d.guestEmail,200)); }
  if (d.guestPhone !== undefined){ sets.push('guest_phone=?'); vals.push(clean(d.guestPhone,50)); }
  if (d.siteId)                  { sets.push('site_id=?');     vals.push(clean(d.siteId,10)); }
  /* party_size — column might be named people in older schema */
  if (d.partySize !== undefined) {
    const v = parseInt(d.partySize)||null;
    try {
      await env.DB.prepare('SELECT party_size FROM reservations LIMIT 1').first();
      sets.push('party_size=?'); vals.push(v);
    } catch (_) {
      sets.push('people=?'); vals.push(v);
    }
  }
  if (d.boatLength !== undefined){ sets.push('boat_length=?'); vals.push(parseInt(d.boatLength)||null); }

  if (sets.length) {
    vals.push(id);
    await env.DB.prepare(`UPDATE reservations SET ${sets.join(',')} WHERE id=?`).bind(...vals).run();
  }

  return json({ ok: true });
}
