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
    /* Cache at the Cloudflare edge for 60s so this Function doesn't run on every
       page load. Browsers still revalidate (max-age=0), but the edge answers
       most hits from cache; a booking-mode switch in admin propagates within ~60s
       (or ~5min worst case via stale-while-revalidate). */
    return json(settings, 'public, max-age=0, s-maxage=60, stale-while-revalidate=300');
  } catch {
    return json({ booking_mode: 'form' });
  }
}

function json(obj, cache) {
  return new Response(JSON.stringify(obj), {
    headers: { 'Content-Type': 'application/json', 'Cache-Control': cache || 'no-store' }
  });
}
