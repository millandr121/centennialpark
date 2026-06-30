/* POST /admin/api/settings — update park settings */

import { json } from '../../api/_lib.js';

export async function onRequestPost(context) {
  const { env, request } = context;
  if (!env.DB) return json({ error: 'DB not bound' }, 503);

  let d;
  try { d = await request.json(); } catch { return json({ error: 'Bad JSON' }, 400); }

  const allowed = ['booking_mode', 'season_open', 'season_close'];
  const updates = [];

  for (const key of allowed) {
    if (d[key] !== undefined) {
      await env.DB.prepare(
        'INSERT INTO park_settings (key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value'
      ).bind(key, String(d[key])).run();
      updates.push(key);
    }
  }

  return json({ ok: true, updated: updates });
}

export async function onRequestGet(context) {
  const { env } = context;
  if (!env.DB) return json({});
  const rows = await env.DB.prepare('SELECT key,value FROM park_settings').all();
  const out  = {};
  (rows.results||[]).forEach(r => { out[r.key] = r.value; });
  return json(out);
}
