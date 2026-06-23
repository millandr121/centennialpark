/* POST /admin/api/cleanup — bulk-delete old records by age
   body: { type: 'reservations'|'submissions'|'all', days: number } */

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

  const days = parseInt(d.days);
  if (!days || days < 1) return json({ error: 'days must be a positive integer' }, 422);
  const type = d.type || 'all';
  if (!['reservations', 'submissions', 'all'].includes(type)) return json({ error: 'Invalid type' }, 422);

  /* cutoff = midnight days ago (SQLite date arithmetic) */
  const cutoff = `date('now', '-${days} days')`;
  let resDeleted = 0, subDeleted = 0;

  try {
    if (type === 'reservations' || type === 'all') {
      const r = await env.DB.prepare(
        `DELETE FROM reservations WHERE date(created_at) < ${cutoff}`
      ).run();
      resDeleted = r.meta?.changes ?? 0;
    }
    if (type === 'submissions' || type === 'all') {
      const r = await env.DB.prepare(
        `DELETE FROM booking_submissions WHERE date(created_at) < ${cutoff}`
      ).run();
      subDeleted = r.meta?.changes ?? 0;
    }
    return json({ ok: true, reservationsDeleted: resDeleted, submissionsDeleted: subDeleted });
  } catch (e) {
    return json({ error: e.message }, 500);
  }
}
