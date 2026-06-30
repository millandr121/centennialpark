/* GET /api/settings — returns public park settings (booking_mode etc.) */

/* Only these keys are exposed to anonymous callers. Never `SELECT *` here —
   that would leak any future/sensitive setting written to park_settings. */
const PUBLIC_KEYS = new Set(['booking_mode', 'season_open', 'season_close']);

export async function onRequestGet(context) {
  const { env } = context;
  if (!env.DB) return json({ booking_mode: 'form' });

  try {
    const rows = await env.DB.prepare('SELECT key,value FROM park_settings').all();
    const settings = {};
    (rows.results || []).forEach(r => { if (PUBLIC_KEYS.has(r.key)) settings[r.key] = r.value; });
    if (!settings.booking_mode) settings.booking_mode = 'form';
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
