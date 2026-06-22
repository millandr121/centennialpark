/* POST /api/reserve — create a live reservation */

import { json, clean, looksLikeEmail, sendEmail, verifyTurnstile } from './_lib.js';

export async function onRequestPost(context) {
  const { request, env } = context;

  let data;
  try { data = await request.json(); } catch { return json({ error: 'Bad request' }, 400); }
  if (data.website) return json({ ok: true });   // honeypot

  const ip    = request.headers.get('CF-Connecting-IP') || '';
  const human = await verifyTurnstile(env, data['cf-turnstile-response'], ip);
  if (!human) return json({ error: 'Could not verify you are human. Please try again.' }, 403);

  const siteId    = clean(data.siteId, 10);
  const checkIn   = clean(data.checkIn, 12);
  const checkOut  = clean(data.checkOut, 12);
  const name      = clean(data.guestName, 200);
  const email     = clean(data.guestEmail, 200);
  const phone     = clean(data.guestPhone, 50);
  const partySize = parseInt(data.partySize)  || null;
  const boatLen   = parseInt(data.boatLength) || null;
  const notes     = clean(data.notes, 2000);

  if (!siteId || !checkIn || !checkOut || !name || !looksLikeEmail(email))
    return json({ error: 'Please fill in all required fields.' }, 422);
  if (checkIn >= checkOut)
    return json({ error: 'Check-out must be after check-in.' }, 422);
  if (!env.DB)
    return json({ error: 'Booking system unavailable — please use the request form.' }, 503);

  /* Support both schema variants */
  let site = null;
  try {
    site = await env.DB.prepare('SELECT id,name,type FROM sites WHERE id=? AND active=1').bind(siteId).first();
  } catch (_) {
    try {
      site = await env.DB.prepare("SELECT id,label as name,type FROM sites WHERE id=? AND status='active'").bind(siteId).first();
    } catch (_2) {}
  }
  if (!site) return json({ error: 'That site is not available.' }, 404);

  /* Race-condition guard — re-check availability */
  const conflict = await env.DB.prepare(
    `SELECT id FROM reservations WHERE site_id=? AND status='confirmed'
     AND check_in<? AND date(check_out,'+1 day')>?`
  ).bind(siteId, checkOut, checkIn).first();
  if (conflict) return json({ error: 'Sorry, that site was just booked. Please choose another.' }, 409);

  const res = await env.DB.prepare(
    `INSERT INTO reservations
     (site_id,check_in,check_out,guest_name,guest_email,guest_phone,party_size,boat_length,notes,source)
     VALUES (?,?,?,?,?,?,?,?,?,'online')`
  ).bind(siteId,checkIn,checkOut,name,email,phone||null,partySize,boatLen,notes||null).run();

  const rid    = (res.meta && res.meta.last_row_id) || '';
  const nights = Math.round((new Date(checkOut) - new Date(checkIn)) / 86400000);
  const row    = `padding:9px 12px;border-bottom:1px solid #e5e7eb;font-size:14px`;
  const head   = `background:#2e5d33;color:#fff;padding:9px 12px;font-size:12px;font-weight:600`;

  /* Guest confirmation */
  const guestSent = await sendEmail(env, {
    subject: `Booking confirmed — ${site.name}, Eileen Scott Centennial Park`,
    replyTo: (env.NOTIFY_TO || 'bamfieldcentennialpark@gmail.com'),
    html: `
      <div style="font-family:sans-serif;max-width:540px;margin:0 auto">
        <div style="background:#2e5d33;color:#fff;padding:20px 24px;border-radius:10px;margin-bottom:1.2rem">
          <div style="font-size:18px;font-weight:700">Booking Confirmed</div>
          <div style="font-size:13px;opacity:.8">Eileen Scott Centennial Park · Bamfield, BC</div>
        </div>
        <p>Hi <strong>${esc(name)}</strong>, your reservation is confirmed!</p>
        <table style="border-collapse:collapse;width:100%;margin:1rem 0">
          <tr><th style="${head}">Site</th><th style="${head}">Check-in</th><th style="${head}">Check-out</th><th style="${head}">Nights</th></tr>
          <tr><td style="${row}">${esc(site.name)}</td><td style="${row}">${esc(checkIn)}</td><td style="${row}">${esc(checkOut)}</td><td style="${row}">${nights}</td></tr>
        </table>
        <p style="color:#374151">Payment is collected on arrival. Please bring this email as confirmation.</p>
        <p style="color:#374151">Questions? Reply to this email or call <a href="tel:+12507283006">250-728-3006</a>.</p>
        <p style="color:#9ca3af;font-size:12px;margin-top:2rem">Confirmation #${rid}</p>
      </div>`
  });

  /* Park notification */
  await sendEmail(env, {
    subject: `New online booking — ${site.name}, ${checkIn} → ${checkOut}`,
    replyTo: email,
    html: `
      <div style="font-family:sans-serif;max-width:540px">
        <h2 style="color:#2e5d33">New Online Booking</h2>
        <p><strong>${esc(name)}</strong> booked <strong>${esc(site.name)}</strong><br>
        ${esc(checkIn)} → ${esc(checkOut)} (${nights} night${nights!==1?'s':''})</p>
        <p>Email: <a href="mailto:${esc(email)}">${esc(email)}</a><br>
        Phone: ${esc(phone||'not provided')}<br>
        Party: ${partySize||'?'} people${boatLen?'<br>Boat: '+boatLen+' ft':''}</p>
        ${notes?`<p>Notes: ${esc(notes)}</p>`:''}
        <p style="color:#9ca3af;font-size:12px">Reservation #${rid} · source: online</p>
      </div>`
  });

  if (guestSent && rid)
    await env.DB.prepare('UPDATE reservations SET emailed=1 WHERE id=?').bind(rid).run().catch(()=>{});

  return json({ ok: true, reservationId: rid });
}

function esc(v) {
  return String(v==null?'':v).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}
