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

  const style = 'font-family:sans-serif;border-collapse:collapse;width:100%;margin-bottom:2rem';
  const th    = 'background:#2e5d33;color:#fff;padding:8px 12px;text-align:left;font-size:13px';
  const td    = 'padding:8px 12px;border-bottom:1px solid #e5e7eb;font-size:13px;vertical-align:top';
  const tdAlt = td + ';background:#f9fafb';

  let html = '<h2 style="font-family:sans-serif;color:#2e5d33">Daily digest — Centennial Park</h2>' +
             '<p style="font-family:sans-serif;color:#6b7280;font-size:13px">Last 24 hours · ' +
             new Date().toUTCString() + '</p>';

  if (bRows.length > 0) {
    html += '<h3 style="font-family:sans-serif">Booking requests (' + bRows.length + ')</h3>';
    html += '<table style="' + style + '"><thead><tr>' +
      '<th style="' + th + '">Name</th>' +
      '<th style="' + th + '">Email</th>' +
      '<th style="' + th + '">Booking</th>' +
      '<th style="' + th + '">Details</th>' +
      '<th style="' + th + '">Dates</th>' +
      '<th style="' + th + '">Notes</th>' +
      '<th style="' + th + '">Emailed?</th>' +
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
        '<td style="' + cell + '">' + esc(r.first_name) + ' ' + esc(r.last_name) + '</td>' +
        '<td style="' + cell + '"><a href="mailto:' + esc(r.email) + '">' + esc(r.email) + '</a></td>' +
        '<td style="' + cell + '">' + esc(wants) + '</td>' +
        '<td style="' + cell + '">' + esc(details.join('<br>')) + '</td>' +
        '<td style="' + cell + '">' + esc(r.check_in || '—') + (r.check_out ? ' → ' + esc(r.check_out) : '') + '</td>' +
        '<td style="' + cell + '">' + esc(r.additional_requests || '—') + '</td>' +
        '<td style="' + cell + '">' + (r.emailed ? '✓' : '⚠️') + '</td>' +
        '</tr>';
    });
    html += '</tbody></table>';
  }

  if (cRows.length > 0) {
    html += '<h3 style="font-family:sans-serif">Contact messages (' + cRows.length + ')</h3>';
    html += '<table style="' + style + '"><thead><tr>' +
      '<th style="' + th + '">Name</th>' +
      '<th style="' + th + '">Email</th>' +
      '<th style="' + th + '">Subject</th>' +
      '<th style="' + th + '">Message</th>' +
      '<th style="' + th + '">Emailed?</th>' +
      '</tr></thead><tbody>';
    cRows.forEach(function (r, i) {
      var cell = i % 2 === 0 ? td : tdAlt;
      html += '<tr>' +
        '<td style="' + cell + '">' + esc(r.name) + '</td>' +
        '<td style="' + cell + '"><a href="mailto:' + esc(r.email) + '">' + esc(r.email) + '</a></td>' +
        '<td style="' + cell + '">' + esc(r.subject || '—') + '</td>' +
        '<td style="' + cell + '">' + esc(r.message || '—').replace(/\n/g, '<br>') + '</td>' +
        '<td style="' + cell + '">' + (r.emailed ? '✓' : '⚠️') + '</td>' +
        '</tr>';
    });
    html += '</tbody></table>';
  }

  const to   = env.NOTIFY_TO   || 'bamfieldcentennialpark@gmail.com';
  const from = env.RESEND_FROM || 'Centennial Park <onboarding@resend.dev>';

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

function esc(v) {
  return String(v == null ? '' : v)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
