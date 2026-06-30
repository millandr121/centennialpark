/* POST /api/booking — store a booking request in D1, then email it. */

import { json, esc, clean, looksLikeEmail, sendEmail, verifyTurnstile } from './_lib.js';

const GREEN  = '#2e5d33';
const BORDER = '#e5e7eb';

function row(label, value) {
  return `<tr>
    <td style="padding:8px 14px;border-bottom:1px solid ${BORDER};color:#6b7280;font-size:13px;white-space:nowrap;width:140px">${label}</td>
    <td style="padding:8px 14px;border-bottom:1px solid ${BORDER};font-size:14px">${value}</td>
  </tr>`;
}

function header(title, sub) {
  return `<div style="background:${GREEN};color:#fff;padding:20px 24px;border-radius:10px 10px 0 0">
    <div style="font-size:18px;font-weight:700">${title}</div>
    <div style="font-size:13px;opacity:.8;margin-top:3px">${sub}</div>
  </div>`;
}

function adminBtn(url) {
  return `<div style="margin:20px 0 8px">
    <a href="${url}" style="display:inline-block;padding:10px 22px;background:${GREEN};color:#fff;border-radius:7px;text-decoration:none;font-weight:600;font-size:14px">Open Admin Panel →</a>
    <span style="font-size:12px;color:#9ca3af;margin-left:10px">Login required</span>
  </div>`;
}

function priceRows(total, gst) {
  const t = parseFloat(total) || 0;
  const g = parseFloat(gst)   || 0;
  if (t <= 0) return '';
  const sub = Math.round((t - g) * 100) / 100;
  return `<tr><td colspan="2" style="padding:0;border-bottom:2px solid ${BORDER}"></td></tr>` +
    (g > 0 ? row('Subtotal', `$${sub.toFixed(2)} CAD`) + row('GST (5%)', `$${g.toFixed(2)} CAD`) : '') +
    `<tr>
      <td style="padding:8px 14px;border-bottom:1px solid ${BORDER};font-weight:700;font-size:14px">Estimated total</td>
      <td style="padding:8px 14px;border-bottom:1px solid ${BORDER};font-weight:700;font-size:15px;color:${GREEN}">$${t.toFixed(2)} CAD</td>
    </tr>`;
}

export async function onRequestPost(context) {
  const { request, env } = context;

  let data;
  try { data = await request.json(); }
  catch (_e) { return json({ error: 'Bad request' }, 400); }

  if (data.website) return json({ ok: true });

  const ipAddr = request.headers.get('CF-Connecting-IP') || '';
  const human  = await verifyTurnstile(env, data['cf-turnstile-response'], ipAddr);
  if (!human) return json({ error: 'Could not verify you are human. Please try again.' }, 403);

  const firstName   = clean(data.firstName, 120);
  const lastName    = clean(data.lastName, 120);
  const email       = clean(data.email, 200);
  const campsite    = clean(data.needCampsite, 8);
  const moorage     = clean(data.needMoorage, 8);
  const parking     = clean(data.needParking, 8);
  const launch      = clean(data.needLaunch, 8);
  const siteCount   = clean(data.siteCount, 12);
  const groupSize   = clean(data.groupSize, 12);
  const boatLength  = clean(data.boatLength, 24);
  const checkIn     = clean(data.checkIn, 30);
  const checkOut    = clean(data.checkOut, 30);
  const notes       = clean(data.additionalRequests, 4000);
  const parkType    = clean(data.parkingType, 20);
  const launchPrd   = clean(data.launchPeriod, 20);
  const launchDays  = parseInt(data.launchDays)  || null;
  const boatWash    = parseInt(data.boatWashQty) || 0;
  const freezer     = parseInt(data.freezerDays) || 0;
  const payMethod   = clean(data.paymentMethod, 40);
  const estTotal    = parseFloat(data.estimatedTotal) || 0;
  const gstAmt      = parseFloat(data.gstAmount)      || 0;

  if (!firstName || !looksLikeEmail(email)) {
    return json({ error: 'Please provide your name and a valid email.' }, 422);
  }
  const hasService = campsite === 'yes' || moorage === 'yes' || parking === 'yes' || launch === 'yes';
  if (!hasService) {
    return json({ error: 'Please select at least one service.' }, 422);
  }

  const fullName = esc([firstName, lastName].filter(Boolean).join(' '));
  const siteUrl  = env.SITE_URL || 'https://centennialpark.pages.dev';

  const services = [];
  if (campsite === 'yes') services.push('Campsite');
  if (moorage  === 'yes') services.push('Moorage');
  if (parking  === 'yes') {
    const ptL = { car: 'Car parking', trailer: 'Trailer parking', both: 'Car + Trailer parking' };
    services.push(ptL[parkType] || 'Parking');
  }
  if (launch === 'yes') {
    const lpL = { day: 'Boat launch (daily)', seasonal: 'Boat launch (seasonal pass)', annual: 'Boat launch (annual pass)' };
    services.push(lpL[launchPrd] || 'Boat launch');
  }
  const wants = services.join(' + ') || 'Not specified';

  /* ── DB insert ── */
  let stored = false, id = null;
  if (env.DB) {
    try {
      const res = await env.DB.prepare(
        'INSERT INTO booking_submissions ' +
        '(first_name,last_name,email,need_campsite,need_moorage,need_parking,parking_type,' +
        'need_boat_launch,boat_launch_period,boat_launch_days,site_count,group_size,boat_length,' +
        'boat_wash_qty,freezer_days,check_in,check_out,additional_requests,' +
        'payment_method,estimated_total,gst_amount,ip,user_agent) ' +
        'VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)'
      ).bind(
        firstName, lastName, email, campsite, moorage, parking, parkType || null,
        launch, launchPrd || null, launchDays,
        siteCount || null, groupSize || null, boatLength || null,
        boatWash, freezer, checkIn || null, checkOut || null, notes || null,
        payMethod || null, estTotal || null, gstAmt || null,
        ipAddr, request.headers.get('User-Agent') || ''
      ).run();
      stored = true;
      id = (res.meta && res.meta.last_row_id) || null;
    } catch (_e) {
      /* The full insert failed — log WHY (so a real bug isn't masked as
         "old schema") before falling back to the minimal column set. The
         fallback intentionally drops optional fields to preserve the core
         enquiry; the warning makes that trade-off visible in logs. */
      console.warn('booking.js: full insert failed, using minimal fallback —', _e && _e.message);
      try {
        const res = await env.DB.prepare(
          'INSERT INTO booking_submissions (first_name,last_name,email,need_campsite,need_moorage,site_count,group_size,boat_length,check_in,check_out,additional_requests,ip,user_agent) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)'
        ).bind(firstName, lastName, email, campsite, moorage, siteCount || null, groupSize || null, boatLength || null, checkIn || null, checkOut || null, notes || null, ipAddr, request.headers.get('User-Agent') || '').run();
        stored = true;
        id = (res.meta && res.meta.last_row_id) || null;
      } catch (_e2) {
        console.error('booking.js: minimal fallback insert ALSO failed —', _e2 && _e2.message);
      }
    }
  }

  const pmLabel = { etransfer: 'Interac e-Transfer', honesty_box: 'Honesty box at park office', on_arrival: 'Cash / card on arrival' };

  /* ── Park notification ── */
  const parkHtml = `<div style="font-family:sans-serif;max-width:560px;margin:0 auto">
    ${header('📋 New Booking Request', 'Eileen Scott Centennial Park · Bamfield, BC')}
    <div style="background:#f0f7f1;padding:14px 24px;border:1px solid #c6dfc9;border-top:none;border-bottom:none">
      <strong style="font-size:15px">${fullName}</strong> is requesting a booking${id ? ` <span style="color:#6b7280;font-size:13px">(Request #${id})</span>` : ''}
    </div>
    <table style="width:100%;border-collapse:collapse;border:1px solid ${BORDER};border-top:none">
      ${row('Wants',        esc(wants))}
      ${checkIn   ? row('Check-in',     esc(checkIn))  : ''}
      ${checkOut  ? row('Check-out',    esc(checkOut)) : ''}
      ${groupSize ? row('Party size',   esc(groupSize)) : ''}
      ${siteCount ? row('Sites needed', esc(siteCount)) : ''}
      ${boatLength ? row('Boat length', esc(boatLength) + ' ft') : ''}
      ${boatWash  > 0 ? row('Boat washes',   String(boatWash)) : ''}
      ${freezer   > 0 ? row('Freezer days',  String(freezer))  : ''}
      ${payMethod ? row('Payment',      esc(pmLabel[payMethod] || payMethod)) : ''}
      ${row('Email', `<a href="mailto:${esc(email)}">${esc(email)}</a>`)}
      ${notes ? row('Notes', esc(notes).replace(/\n/g, '<br>')) : ''}
      ${priceRows(estTotal, gstAmt)}
    </table>
    ${adminBtn(siteUrl + '/admin')}
    <p style="color:#9ca3af;font-size:12px;margin-top:1.5rem">From: ${esc(email)} · ${new Date().toUTCString()}</p>
  </div>`;

  const parkEmailed = await sendEmail(env, {
    subject: `New booking request — ${firstName} ${lastName}`,
    replyTo: email,
    html: parkHtml
  });

  /* ── Guest acknowledgment ── */
  const guestHtml = `<div style="font-family:sans-serif;max-width:540px;margin:0 auto">
    ${header('We received your request!', 'Eileen Scott Centennial Park · Bamfield, BC')}
    <div style="border:1px solid ${BORDER};border-top:none;border-radius:0 0 10px 10px;padding:20px 24px">
      <p style="margin:0 0 1rem">Hi <strong>${fullName}</strong>, thanks for reaching out!</p>
      <p style="margin:0 0 1rem;color:#374151">We've received your request and will be in touch within 1–2 business days to confirm availability and next steps.</p>
      <div style="background:#f0f7f1;border-radius:8px;padding:14px 18px;margin:1.2rem 0">
        <strong style="color:${GREEN}">Your request summary</strong>
        <table style="width:100%;border-collapse:collapse;margin-top:.75rem">
          ${row('Requested', esc(wants))}
          ${checkIn   ? row('Check-in',   esc(checkIn))  : ''}
          ${checkOut  ? row('Check-out',  esc(checkOut)) : ''}
          ${groupSize ? row('Party size', esc(groupSize)) : ''}
          ${boatLength ? row('Boat length', esc(boatLength) + ' ft') : ''}
          ${boatWash > 0  ? row('Boat washes',  String(boatWash)) : ''}
          ${freezer  > 0  ? row('Freezer days', String(freezer))  : ''}
          ${payMethod ? row('Payment', esc(pmLabel[payMethod] || payMethod)) : ''}
          ${priceRows(estTotal, gstAmt)}
        </table>
      </div>
      <p style="color:#374151;margin:0 0 .5rem">Questions? Reply to this email or call <a href="tel:+12507283006" style="color:${GREEN}">250-728-3006</a>.</p>
      <p style="color:#9ca3af;font-size:12px;margin-top:1.5rem">${id ? `Reference #${id} · ` : ''}Eileen Scott Centennial Park, Bamfield, BC</p>
    </div>
  </div>`;

  const guestEmailed = await sendEmail(env, {
    subject: `We received your request — Eileen Scott Centennial Park`,
    to: email,
    replyTo: env.NOTIFY_TO || 'bamfieldcentennialpark@gmail.com',
    html: guestHtml
  });

  if ((parkEmailed || guestEmailed) && stored && id != null) {
    try { await env.DB.prepare('UPDATE booking_submissions SET emailed = 1 WHERE id = ?').bind(id).run(); }
    catch (_e) { /* non-fatal */ }
  }

  if (stored || parkEmailed || guestEmailed) return json({ ok: true });
  return json({ error: 'Could not submit your request. Please call or email us directly.' }, 502);
}
