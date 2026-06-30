/* Admin API: GET /admin/api/sites — the list of bookable sites for the panel
   (site pickers, report filters). Replaces the old hack of calling
   /api/availability with a dummy date range just to read the site list.
   Auth via _middleware.js. */

import { json } from '../../api/_lib.js';

export async function onRequestGet(context) {
  const { env } = context;
  if (!env.DB) return json({ error: 'DB not bound' }, 503);

  /* Schema fallback: this DB uses name/active; older code used label/status. */
  let sites = [];
  try {
    const r = await env.DB.prepare('SELECT id, name, type, active FROM sites ORDER BY type, id').all();
    sites = r.results || [];
  } catch (_) {
    try {
      const r = await env.DB.prepare("SELECT id, label as name, type, (status='active') as active FROM sites ORDER BY type, id").all();
      sites = r.results || [];
    } catch (e2) {
      console.error('sites GET failed —', e2 && e2.message);
      return json({ error: 'Could not load sites.' }, 500);
    }
  }
  return json({ sites });
}
