/* GET /admin/api/submissions — form booking requests (read-only) */

export async function onRequestGet(context) {
  const { env, request } = context;
  if (!env.DB) return json({ error: 'DB not bound' }, 503);

  const url   = new URL(request.url);
  const month = url.searchParams.get('month') || '';

  let q = 'SELECT * FROM booking_submissions WHERE 1=1';
  const params = [];

  if (month) {
    q += ' AND (check_in LIKE ? OR created_at LIKE ?)';
    params.push(month + '%', month + '%');
  }
  q += ' ORDER BY created_at DESC';

  const res = await env.DB.prepare(q).bind(...params).all();
  return json({ submissions: res.results || [] });
}

function json(o, s) {
  return new Response(JSON.stringify(o), {
    status: s||200, headers: {'Content-Type':'application/json'}
  });
}
