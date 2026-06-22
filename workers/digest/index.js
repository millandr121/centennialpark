export default {
  async scheduled(event, env, ctx) {
    ctx.waitUntil(runDigest(env));
  },
  async fetch(request, env) {
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

  if (bRows.length === 0 && cRows.length === 0) {
    return new Response('No submissions in the last 24h — nothing to send.');
  }

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

  if (bRows.length > 0) {
    html += '<h3 style="font-size:15px;margin:0 0 .6rem">Booking requests &middot; ' + bRows.length + '</h3>';
    html += '<table style="' + table + '"><thead><tr>' +
      '<th style="' + th + '">Received</th>' +
      '<th style="' + th + '">Name</th>' +
      '<th style="' + th + '">Email</th>' +
      '<th style="' + th + '">Booking</th>' +
      '<th style="' + th + '">Details</th>' +
      '<th style="' + th + '">Dates</th>' +
      '<th style="' + th + '">Notes</th>' +
      '<th style="' + th + '">Sent</th>' +
      '</tr></thead><tbody>';
    bRows.forEach(function (r, i) {
      var cell = i % 2 === 0 ? td : tdAlt;
      var wants = [
        r.need_campsite === 'yes' ? 'Campsite' : '',
        r.need_moorage  === 'yes' ? 'Moorage'  : ''
      ].filter(Boolean).join(' + ') || '—';
      var details = [];
      if (r.need_campsite === 'yes') {
        details.push((r.site_count || '?') + ' site(s), ' + (r.group_size || '?') + ' people');
      }
      if (r.need_moorage === 'yes') {
        details.push('Boat: ' + (r.boat_length || '?') + ' ft');
      }
      html += '<tr>' +
        '<td style="' + cell + '"><span style="' + time + '">' + esc(fmt(r.created_at)) + '</span></td>' +
        '<td style="' + cell + '">' + esc(r.first_name) + ' ' + esc(r.last_name) + '</td>' +
        '<td style="' + cell + '"><a href="mailto:' + esc(r.email) + '" style="color:#2e5d33">' + esc(r.email) + '</a></td>' +
        '<td style="' + cell + '">' + esc(wants) + '</td>' +
        '<td style="' + cell + '">' + esc(details.join(', ') || '—') + '</td>' +
        '<td style="' + cell + '">' + esc(r.check_in || '—') + (r.check_out ? ' → ' + esc(r.check_out) : '') + '</td>' +
        '<td style="' + cell + '">' + esc(r.additional_requests || '—').replace(/\n/g, '<br>') + '</td>' +
        '<td style="' + cell + '">' + (r.emailed ? '✓' : '⚠️') + '</td>' +
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
        '<td style="' + cell + '">' + (r.emailed ? '✓' : '⚠️') + '</td>' +
        '</tr>';
    });
    html += '</tbody></table>';
  }

  html += '<p style="color:#9ca3af;font-size:12px;border-top:1px solid #eef0f2;padding-top:1rem">' +
    'Eileen Scott Centennial Park &middot; Bamfield, BC &middot; automated digest. ' +
    '✓ = a live email was already sent for this entry.</p></div>';

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
