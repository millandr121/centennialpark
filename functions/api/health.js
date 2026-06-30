/* GET /api/health — lightweight liveness/readiness probe for uptime monitors.
   Returns 200 when the app + D1 binding are healthy, 503 otherwise. Leaks no
   secrets or data — just booleans + a timestamp. Point UptimeRobot (or similar)
   at this and alert on non-200. */
export async function onRequestGet({ env }) {
  const dbBound = !!env.DB;
  let dbOk = false;
  if (dbBound) {
    try {
      await env.DB.prepare('SELECT 1').first();
      dbOk = true;
    } catch {
      dbOk = false;
    }
  }
  const ok = dbBound && dbOk;
  return new Response(JSON.stringify({ ok, db: dbOk, ts: new Date().toISOString() }), {
    status: ok ? 200 : 503,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }
  });
}
