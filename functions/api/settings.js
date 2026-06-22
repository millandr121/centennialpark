/* GET /api/settings — returns public park settings (booking_mode etc.) */

export async function onRequestGet(context) {
  const { env } = context;
  if (!env.DB) return json({ booking_mode: 'form' });

  try {
    const rows = await env.DB.prepare('SELECT key,value FROM park_settings').all();
    const settings = {};
    (rows.results || []).forEach(r => { settings[r.key] = r.value; });
    return json(settings);
  } catch {
    return json({ booking_mode: 'form' });
  }
}

function json(obj) {
  return new Response(JSON.stringify(obj), {
    headers: { 'Content-Type':'application/json', 'Cache-Control':'no-store' }
  });
}
