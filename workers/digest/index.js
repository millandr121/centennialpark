export default {
  async scheduled(event, env, ctx) {
    ctx.waitUntil((async () => {
      await runDigest(env);
      // Monthly safety backup of the booking/income records, on the 1st.
      if (new Date().getUTCDate() === 1) await runBackup(env);
    })());
  },
  async fetch(request, env) {
    // Manual triggers: /?backup=1 forces a backup now; anything else runs the digest.
    if (new URL(request.url).searchParams.get('backup') === '1') {
      return await runBackup(env);
    }
    return await runDigest(env);
  }
};

async function runDigest(env) {
  const since = new Date(Date.now() - 86400000).toISOString();

  const [bookings, contacts] = await Promise.all([
    env.DB.prepare(
      'SELECT * FROM booking_submissions WHERE created_at >= ? ORDER BY created_at DESC'
    ).bind(since).all(),
    env.DB.prepare(
      'SELECT * FROM contact_submissions WHERE created_at >= ? ORDER BY created_at DESC'
    ).bind(since).all()
  ]);

  const bRows = bookings.results || [];
  const cRows = contacts.results || [];

  // Dead-man's-switch: send the digest EVERY day, even with zero activity, so a
  // missing email is itself the alarm that the cron job has stopped working.
  const isEmpty = bRows.length === 0 && cRows.length === 0;

  const wrap  = 'max-width:760px;margin:0 auto;font-family:-apple-system,BlinkMacSystemFont,\'Segoe UI\',Roboto,sans-serif;color:#1f2937';
  const table = 'border-collapse:collapse;width:100%;margin:0 0 2rem;border:1px solid #e5e7eb;border-radius:10px;overflow:hidden';
  const th    = 'background:#2e5d33;color:#fff;padding:10px 12px;text-align:left;font-size:12px;font-weight:600;letter-spacing:.02em';
  const td    = 'padding:10px 12px;border-bottom:1px solid #eef0f2;font-size:13px;vertical-align:top;line-height:1.45';
  const tdAlt = td + ';background:#f9fafb';
  const time  = 'color:#6b7280;font-size:12px;white-space:nowrap';

  let html = '<div style="' + wrap + '">' +
    '<div style="background:#2e5d33;color:#fff;padding:20px 24px;border-radius:12px;margin-bottom:1.5rem">' +
      '<div style="font-size:20px;font-weight:700">Eileen Scott Centennial Park</div>' +
      '<div style="font-size:13px;opacity:.8;margin-top:2px">Daily inquiry digest &middot; last 24 hours</div>' +
    '</div>' +
    '<p style="color:#6b7280;font-size:13px;margin:0 0 1.5rem">Generated ' + fmt(new Date().toISOString()) + '</p>';

  if (isEmpty) {
    html += '<p style="background:#f0f7f1;border:1px solid #cfe3d3;border-radius:10px;' +
      'padding:14px 16px;color:#2e5d33;font-size:13px;margin:0 0 1.5rem">' +
      'No new inquiries in the last 24 hours &mdash; all systems normal. ' +
      'This note is sent daily on purpose: if it ever stops arriving, the digest itself has broken.</p>';
  }

  if (bRows.length > 0) {
    html += '<h3 style="font-size:15px;margin:0 0 .6rem">Booking requests &middot; ' + bRows.length + '</h3>';
    html += '<table style="' + table + '"><thead><tr>' +
      '<th style="' + th + '">Received</th>' +
      '<th style="' + th + '">Name</th>' +
      '<th style="' + th + '">Email</th>' +
      '<th style="' + th + '">Services</th>' +
      '<th style="' + th + '">Details</th>' +
      '<th style="' + th + '">Dates</th>' +
      '<th style="' + th + '">Total</th>' +
      '<th style="' + th + '">Payment</th>' +
      '<th style="' + th + '">Notes</th>' +
      '<th style="' + th + '">Sent</th>' +
      '</tr></thead><tbody>';
    bRows.forEach(function (r, i) {
      var cell = i % 2 === 0 ? td : tdAlt;
      var services = [
        r.need_campsite    === 'yes' ? 'Campsite'    : '',
        r.need_moorage     === 'yes' ? 'Moorage'     : '',
        r.need_parking     === 'yes' ? 'Parking'     : '',
        r.need_boat_launch === 'yes' ? 'Boat Launch' : ''
      ].filter(Boolean).join(' + ') || '—';
      var details = [];
      if (r.need_campsite === 'yes') {
        details.push((r.site_count || '?') + ' site(s), ' + (r.group_size || '?') + ' ppl');
      }
      if (r.need_moorage === 'yes') {
        details.push('Boat: ' + (r.boat_length || '?') + ' ft');
      }
      if (r.need_parking === 'yes' && r.parking_type) {
        details.push('Park: ' + r.parking_type);
      }
      if (r.need_boat_launch === 'yes' && r.boat_launch_period) {
        details.push('Launch: ' + r.boat_launch_period);
      }
      if (r.boat_wash_qty > 0)  details.push('Wash ×' + r.boat_wash_qty);
      if (r.freezer_days  > 0)  details.push('Freezer ' + r.freezer_days + 'd');
      var totalStr = r.estimated_total > 0 ? '$' + (+r.estimated_total).toFixed(2) : '—';
      var pmLabels = { etransfer: 'e-Transfer', honesty_box: 'Honesty box', on_arrival: 'On arrival' };
      var pmStr = r.payment_method ? (pmLabels[r.payment_method] || r.payment_method) : '—';
      html += '<tr>' +
        '<td style="' + cell + '"><span style="' + time + '">' + esc(fmt(r.created_at)) + '</span></td>' +
        '<td style="' + cell + '">' + esc(r.first_name) + ' ' + esc(r.last_name) + '</td>' +
        '<td style="' + cell + '"><a href="mailto:' + esc(r.email) + '" style="color:#2e5d33">' + esc(r.email) + '</a></td>' +
        '<td style="' + cell + '">' + esc(services) + '</td>' +
        '<td style="' + cell + '">' + esc(details.join(', ') || '—') + '</td>' +
        '<td style="' + cell + '">' + esc(r.check_in || '—') + (r.check_out ? ' → ' + esc(r.check_out) : '') + '</td>' +
        '<td style="' + cell + ';font-weight:600;color:#2e5d33">' + esc(totalStr) + '</td>' +
        '<td style="' + cell + '">' + esc(pmStr) + '</td>' +
        '<td style="' + cell + '">' + esc(r.additional_requests || '—').replace(/\n/g, '<br>') + '</td>' +
        '<td style="' + cell + '">' + (r.emailed ? 'Sent' : 'Not sent') + '</td>' +
        '</tr>';
    });
    html += '</tbody></table>';
  }

  if (cRows.length > 0) {
    html += '<h3 style="font-size:15px;margin:0 0 .6rem">Contact messages &middot; ' + cRows.length + '</h3>';
    html += '<table style="' + table + '"><thead><tr>' +
      '<th style="' + th + '">Received</th>' +
      '<th style="' + th + '">Name</th>' +
      '<th style="' + th + '">Email</th>' +
      '<th style="' + th + '">Subject</th>' +
      '<th style="' + th + '">Message</th>' +
      '<th style="' + th + '">Sent</th>' +
      '</tr></thead><tbody>';
    cRows.forEach(function (r, i) {
      var cell = i % 2 === 0 ? td : tdAlt;
      html += '<tr>' +
        '<td style="' + cell + '"><span style="' + time + '">' + esc(fmt(r.created_at)) + '</span></td>' +
        '<td style="' + cell + '">' + esc(r.name) + '</td>' +
        '<td style="' + cell + '"><a href="mailto:' + esc(r.email) + '" style="color:#2e5d33">' + esc(r.email) + '</a></td>' +
        '<td style="' + cell + '">' + esc(r.subject || '—') + '</td>' +
        '<td style="' + cell + '">' + esc(r.message || '—').replace(/\n/g, '<br>') + '</td>' +
        '<td style="' + cell + '">' + (r.emailed ? 'Sent' : 'Not sent') + '</td>' +
        '</tr>';
    });
    html += '</tbody></table>';
  }

  html += '<p style="color:#9ca3af;font-size:12px;border-top:1px solid #eef0f2;padding-top:1rem">' +
    'Eileen Scott Centennial Park &middot; Bamfield, BC &middot; automated digest. ' +
    'Sent = a live email was already sent for this entry.</p></div>';

  const to   = env.NOTIFY_TO   || 'bamfieldcentennialpark@gmail.com';
  const from = env.RESEND_FROM || 'Eileen Scott Centennial Park <onboarding@resend.dev>';

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': 'Bearer ' + env.RESEND_API_KEY,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      from, to,
      subject: 'Daily digest — ' + bRows.length + ' booking(s), ' + cRows.length + ' message(s)',
      html
    })
  });

  const ok = res.ok ? 'sent' : 'failed (' + res.status + ')';
  return new Response('Digest email ' + ok + '. Bookings: ' + bRows.length + ', contacts: ' + cRows.length);
}

/* Format a UTC timestamp ("2026-06-14 19:00:00" or ISO) as Pacific local time. */
function fmt(ts) {
  if (!ts) return '—';
  var iso = String(ts).replace(' ', 'T');
  if (!/[zZ]|[+-]\d\d:?\d\d$/.test(iso)) iso += 'Z';
  var d = new Date(iso);
  if (isNaN(d)) return String(ts);
  try {
    return d.toLocaleString('en-CA', {
      timeZone: 'America/Vancouver',
      month: 'short', day: 'numeric',
      hour: 'numeric', minute: '2-digit', hour12: true
    }) + ' PT';
  } catch (_e) {
    return d.toUTCString();
  }
}

function esc(v) {
  return String(v == null ? '' : v)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/* ── Monthly safety backup ──────────────────────────────────────────────────
   Cloudflare D1 has no automatic off-site backup, and the admin panel can wipe
   data, so this is the durable copy. It also covers CRA record-retention: the
   reservations/misc-income tables are your income+GST records (keep ~6 years).
   Exports each table as a CSV attachment and emails them to the park.
   Runs monthly (1st, from scheduled) or on demand via the worker URL ?backup=1. */
async function runBackup(env) {
  const TABLES = ['reservations', 'misc_items', 'booking_submissions', 'contact_submissions'];
  const stamp = new Date().toISOString().slice(0, 10);
  const attachments = [];
  const counts = [];

  for (const t of TABLES) {
    let rows = [];
    try {
      const res = await env.DB.prepare('SELECT * FROM ' + t + ' ORDER BY id').all();
      rows = res.results || [];
    } catch (e) {
      counts.push(t + ': export error');
      continue;
    }
    counts.push(t + ': ' + rows.length + ' rows');
    attachments.push({
      filename: t + '-' + stamp + '.csv',
      content: toBase64(toCsv(rows) || (t + ' had no rows on ' + stamp))
    });
  }

  const to   = env.NOTIFY_TO   || 'bamfieldcentennialpark@gmail.com';
  const from = env.RESEND_FROM || 'Eileen Scott Centennial Park <onboarding@resend.dev>';

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': 'Bearer ' + env.RESEND_API_KEY,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      from, to,
      subject: 'Monthly data backup — ' + stamp,
      html: '<div style="font-family:-apple-system,BlinkMacSystemFont,sans-serif;color:#1f2937;max-width:600px;margin:0 auto">' +
        '<h2 style="color:#2e5d33;font-size:18px">Monthly data backup &middot; ' + stamp + '</h2>' +
        '<p style="font-size:13px;line-height:1.5">Attached are CSV exports of your booking and income ' +
        'records. Keep them somewhere safe (e.g. Google Drive) — this is your off-site copy and your ' +
        'tax record. CRA expects business records kept for ~6 years.</p>' +
        '<ul style="font-size:13px">' + counts.map(function (c) { return '<li>' + esc(c) + '</li>'; }).join('') + '</ul></div>',
      attachments
    })
  });

  const ok = res.ok ? 'sent' : 'failed (' + res.status + ')';
  return new Response('Backup email ' + ok + '. ' + counts.join('; '));
}

/* rows[] -> CSV text (RFC-4180 quoting). Columns come from the first row's keys. */
function toCsv(rows) {
  if (!rows || !rows.length) return '';
  const cols = Object.keys(rows[0]);
  const cell = function (v) {
    if (v == null) return '';
    const s = String(v);
    return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  };
  const out = [cols.join(',')];
  for (const r of rows) out.push(cols.map(function (c) { return cell(r[c]); }).join(','));
  return out.join('\r\n');
}

/* UTF-8 safe base64 for Resend attachments (chunked to avoid call-stack limits). */
function toBase64(str) {
  const bytes = new TextEncoder().encode(str);
  let bin = '';
  const CH = 0x8000;
  for (let i = 0; i < bytes.length; i += CH) {
    bin += String.fromCharCode.apply(null, bytes.subarray(i, i + CH));
  }
  return btoa(bin);
}
