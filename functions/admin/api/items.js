/* Admin API: misc income items (the ledger) — ad-hoc, non-booking revenue.
   Boat launches, shower/general donations, parking drop-ins, freezer rentals…
   Each row carries its own GST so income/tax reports can total it per category.
   All routes require auth via _middleware.js. */

import { clean, tableCols } from '../../api/_lib.js';
import { gstIncluded } from '../../api/_calc.js';

function json(o, s) {
  return new Response(JSON.stringify(o), {
    status: s || 200, headers: { 'Content-Type': 'application/json' }
  });
}

/* Normalise the money fields from a request body into what we store.
   `amount` is the all-in (GST-inclusive) figure; gst is the portion within it. */
function moneyFields(d) {
  const amount  = d.amount != null && d.amount !== '' ? Math.max(0, parseFloat(d.amount) || 0) : 0;
  const exempt  = d.gstExempt === true || d.gstExempt === 1 || d.gstExempt === '1';
  let gst = 0;
  if (!exempt) {
    gst = (d.gstAmount != null && d.gstAmount !== '')
      ? Math.max(0, parseFloat(d.gstAmount) || 0)
      : gstIncluded(amount);
  }
  return { amount, gst, exempt: exempt ? 1 : 0 };
}

/* GET /admin/api/items[?from=YYYY-MM-DD&to=YYYY-MM-DD&category=shower] */
export async function onRequestGet(context) {
  const { env, request } = context;
  if (!env.DB) return json({ error: 'DB not bound' }, 503);

  const cols = await tableCols(env, 'misc_items');
  if (!cols.has('id')) return json({ items: [] });   // table not created yet

  const url      = new URL(request.url);
  const from     = url.searchParams.get('from')     || '';
  const to       = url.searchParams.get('to')       || '';
  const category = url.searchParams.get('category') || '';

  let q = 'SELECT * FROM misc_items WHERE 1=1';
  const params = [];
  if (from)     { q += ' AND item_date >= ?'; params.push(from); }
  if (to)       { q += ' AND item_date <= ?'; params.push(to); }
  if (category) { q += ' AND category = ?';   params.push(category); }
  q += ' ORDER BY item_date DESC, id DESC';

  try {
    const res = await env.DB.prepare(q).bind(...params).all();
    return json({ items: res.results || [] });
  } catch (e) {
    return json({ error: e.message }, 500);
  }
}

/* POST /admin/api/items — record a new item */
export async function onRequestPost(context) {
  const { env, request } = context;
  if (!env.DB) return json({ error: 'DB not bound' }, 503);

  const cols = await tableCols(env, 'misc_items');
  if (!cols.has('id')) return json({ error: 'Run schema-items.sql first — the misc_items table does not exist yet.' }, 503);

  let d;
  try { d = await request.json(); } catch { return json({ error: 'Bad JSON' }, 400); }

  const itemDate = clean(d.itemDate, 12);
  const category = clean(d.category, 40) || 'other';
  if (!itemDate)            return json({ error: 'Date is required' }, 422);
  if (!(parseFloat(d.amount) >= 0)) return json({ error: 'Amount is required' }, 422);

  const { amount, gst, exempt } = moneyFields(d);

  try {
    const res = await env.DB.prepare(
      `INSERT INTO misc_items (item_date, category, description, amount, gst_amount, gst_exempt, payment_method, notes)
       VALUES (?,?,?,?,?,?,?,?)`
    ).bind(
      itemDate, category, clean(d.description, 300) || null,
      amount, gst, exempt, clean(d.paymentMethod, 40) || null, clean(d.notes, 2000) || null
    ).run();
    return json({ ok: true, id: res.meta && res.meta.last_row_id });
  } catch (e) {
    return json({ error: e.message }, 500);
  }
}

/* PUT /admin/api/items — edit an item */
export async function onRequestPut(context) {
  const { env, request } = context;
  if (!env.DB) return json({ error: 'DB not bound' }, 503);

  let d;
  try { d = await request.json(); } catch { return json({ error: 'Bad JSON' }, 400); }

  const id = parseInt(d.id);
  if (!id) return json({ error: 'Missing id' }, 422);

  const sets = [], vals = [];
  if (d.itemDate)      { sets.push('item_date = ?');      vals.push(clean(d.itemDate, 12)); }
  if (d.category)      { sets.push('category = ?');       vals.push(clean(d.category, 40)); }
  if (d.description !== undefined)   { sets.push('description = ?');    vals.push(clean(d.description, 300) || null); }
  if (d.paymentMethod !== undefined) { sets.push('payment_method = ?'); vals.push(clean(d.paymentMethod, 40) || null); }
  if (d.notes !== undefined)         { sets.push('notes = ?');          vals.push(clean(d.notes, 2000) || null); }
  /* money fields move together so amount/gst stay consistent */
  if (d.amount !== undefined || d.gstAmount !== undefined || d.gstExempt !== undefined) {
    const { amount, gst, exempt } = moneyFields(d);
    sets.push('amount = ?');     vals.push(amount);
    sets.push('gst_amount = ?'); vals.push(gst);
    sets.push('gst_exempt = ?'); vals.push(exempt);
  }
  if (!sets.length) return json({ ok: true });

  vals.push(id);
  try {
    await env.DB.prepare(`UPDATE misc_items SET ${sets.join(', ')} WHERE id = ?`).bind(...vals).run();
    return json({ ok: true });
  } catch (e) {
    return json({ error: e.message }, 500);
  }
}

/* DELETE /admin/api/items?id=123 */
export async function onRequestDelete(context) {
  const { env, request } = context;
  if (!env.DB) return json({ error: 'DB not bound' }, 503);
  const id = parseInt(new URL(request.url).searchParams.get('id'));
  if (!id) return json({ error: 'Missing id' }, 422);
  try {
    await env.DB.prepare('DELETE FROM misc_items WHERE id = ?').bind(id).run();
    return json({ ok: true });
  } catch (e) { return json({ error: e.message }, 500); }
}
