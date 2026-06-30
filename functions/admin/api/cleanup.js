/* POST /admin/api/cleanup — bulk-delete records.
   Age-based:  { type: 'reservations'|'submissions'|'all', days: number }
   Full wipe:  { type: 'reservations'|'submissions'|'all'|'items', wipeAll: true }  // every row, no age filter

   On a full wipe we also clear the table's sqlite_sequence row so reference
   numbers (the AUTOINCREMENT ids) restart at 1 — otherwise SQLite keeps
   counting up from the highest id ever used even after the rows are gone. */

function json(o, s) {
  return new Response(JSON.stringify(o), {
    status: s || 200, headers: { 'Content-Type': 'application/json' }
  });
}

/* Tables touched by each scope. 'all' clears bookings + requests + the misc
   income ledger (a full reset). 'items' clears just the ledger. */
const SCOPE_TABLES = {
  reservations: ['reservations'],
  submissions:  ['booking_submissions'],
  items:        ['misc_items'],
  all:          ['reservations', 'booking_submissions', 'misc_items'],
};

/* Delete every row in a table and restart its ids at 1. Best-effort: a missing
   table (pre-migration) or absent sqlite_sequence is treated as 0 deleted. */
async function wipeTable(env, table) {
  try {
    const r = await env.DB.prepare(`DELETE FROM ${table}`).run();
    await env.DB.prepare('DELETE FROM sqlite_sequence WHERE name = ?').bind(table).run().catch(() => {});
    return r.meta?.changes ?? 0;
  } catch (_e) {
    return 0;
  }
}

export async function onRequestPost(context) {
  const { env, request } = context;
  if (!env.DB) return json({ error: 'DB not bound' }, 503);

  let d;
  try { d = await request.json(); } catch { return json({ error: 'Bad JSON' }, 400); }

  const type = d.type || 'all';
  if (!SCOPE_TABLES[type]) return json({ error: 'Invalid type' }, 422);

  /* ── Full wipe: every row, reset ids ─────────────────────────────────── */
  if (d.wipeAll === true) {
    const counts = {};
    for (const t of SCOPE_TABLES[type]) counts[t] = await wipeTable(env, t);
    return json({
      ok: true, wipeAll: true,
      reservationsDeleted: counts.reservations ?? 0,
      submissionsDeleted:  counts.booking_submissions ?? 0,
      itemsDeleted:        counts.misc_items ?? 0,
    });
  }

  /* ── Age-based cleanup: bookings + requests only (financial misc items
        are kept; clear them with the explicit full wipe instead). ──────── */
  const days = parseInt(d.days);
  if (!days || days < 1) return json({ error: 'days must be a positive integer' }, 422);
  const interval = '-' + days + ' days';
  const where = ` WHERE date(created_at) < date('now', ?)`;
  let resDeleted = 0, subDeleted = 0;

  try {
    if (type === 'reservations' || type === 'all') {
      const r = await env.DB.prepare(`DELETE FROM reservations${where}`).bind(interval).run();
      resDeleted = r.meta?.changes ?? 0;
    }
    if (type === 'submissions' || type === 'all') {
      const r = await env.DB.prepare(`DELETE FROM booking_submissions${where}`).bind(interval).run();
      subDeleted = r.meta?.changes ?? 0;
    }
    return json({ ok: true, wipeAll: false, reservationsDeleted: resDeleted, submissionsDeleted: subDeleted });
  } catch (e) {
    return json({ error: e.message }, 500);
  }
}
