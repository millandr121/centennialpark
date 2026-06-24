/* POST /admin/api/cleanup — bulk-delete records.
   Age-based:  { type: 'reservations'|'submissions'|'all', days: number }
   Full wipe:  { type: 'reservations'|'submissions'|'all', wipeAll: true }  // every row, no age filter */

function json(o, s) {
  return new Response(JSON.stringify(o), {
    status: s || 200, headers: { 'Content-Type': 'application/json' }
  });
}

export async function onRequestPost(context) {
  const { env, request } = context;
  if (!env.DB) return json({ error: 'DB not bound' }, 503);

  let d;
  try { d = await request.json(); } catch { return json({ error: 'Bad JSON' }, 400); }

  const type = d.type || 'all';
  if (!['reservations', 'submissions', 'all'].includes(type)) return json({ error: 'Invalid type' }, 422);

  const wipeAll = d.wipeAll === true;

  /* Age cutoff (ignored on a full wipe). Passed as a bind parameter — never
     interpolated into the SQL string. */
  let interval = null;
  if (!wipeAll) {
    const days = parseInt(d.days);
    if (!days || days < 1) return json({ error: 'days must be a positive integer' }, 422);
    interval = '-' + days + ' days';
  }

  const where = wipeAll ? '' : ` WHERE date(created_at) < date('now', ?)`;
  const binds = wipeAll ? [] : [interval];
  let resDeleted = 0, subDeleted = 0;

  try {
    if (type === 'reservations' || type === 'all') {
      const r = await env.DB.prepare(`DELETE FROM reservations${where}`).bind(...binds).run();
      resDeleted = r.meta?.changes ?? 0;
    }
    if (type === 'submissions' || type === 'all') {
      const r = await env.DB.prepare(`DELETE FROM booking_submissions${where}`).bind(...binds).run();
      subDeleted = r.meta?.changes ?? 0;
    }
    return json({ ok: true, wipeAll, reservationsDeleted: resDeleted, submissionsDeleted: subDeleted });
  } catch (e) {
    return json({ error: e.message }, 500);
  }
}
