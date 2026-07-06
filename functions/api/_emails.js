/* _emails.js — shared, themed transactional email templates.
   Import-only (underscore prefix is not routed). Matches the green/amber
   theme used across the booking + day-end-report emails. */

import { esc } from './_lib.js';
import { nightsBetween } from './_calc.js';

const GREEN = '#2e5d33';
const AMBER = '#d4830a';
const ETRANSFER_TO = 'bamfieldcentennialpark@gmail.com';

/* Human label for an assigned site / service.
   Numbered campsite/moorage slots keep their name ("Site C3" / "Slip M2").
   Generic service lots read as "Parking Lot" / "Trailer Lot" / "Boat Launch",
   with a trailer-only parking booking shown as the Trailer Lot. */
export function siteLabel(site, parkingType) {
  if (!site) return 'Your booking';
  const id = String(site.id || '').toUpperCase();
  if (id === 'PARKING') return parkingType === 'trailer' ? 'Trailer Lot' : 'Parking Lot';
  if (id === 'TRAILER') return 'Trailer Lot';
  if (id === 'LAUNCH')  return 'Boat Launch';
  return site.name || site.id || 'Your booking';
}

function shell(headerTitle, innerHtml) {
  return `<div style="font-family:sans-serif;max-width:540px;margin:0 auto">
    <div style="background:${GREEN};color:#fff;padding:20px 24px;border-radius:10px;margin-bottom:1.2rem">
      <div style="font-size:18px;font-weight:700">${headerTitle}</div>
      <div style="font-size:13px;opacity:.8">Eileen Scott Centennial Park · Bamfield, BC</div>
    </div>
    ${innerHtml}
    <p style="color:#374151;margin-top:1.4rem">Questions? Reply to this email or call <a href="tel:+12507283006">250-728-3006</a>.</p>
  </div>`;
}

function detailsTable(label, checkIn, checkOut, nights) {
  const th = `background:${GREEN};color:#fff;padding:8px 12px;font-size:12px`;
  const td = `padding:8px 12px;border-bottom:1px solid #e5e7eb`;
  return `<table style="border-collapse:collapse;width:100%;margin:1rem 0">
    <tr><th style="${th}">Booking</th><th style="${th}">Check-in</th><th style="${th}">Check-out</th><th style="${th}">Nights</th></tr>
    <tr><td style="${td}">${esc(label)}</td><td style="${td}">${esc(checkIn)}</td><td style="${td}">${esc(checkOut)}</td><td style="${td}">${nights}</td></tr>
  </table>`;
}

function totalBlock(estTotal, gstAmt) {
  if (!(estTotal > 0)) return '';
  return `<div style="background:#f0f7f1;border-radius:8px;padding:14px 18px;margin:1.2rem 0">
    <strong style="color:${GREEN}">Total: $${estTotal.toFixed(2)} CAD</strong>
    ${gstAmt > 0 ? `<br><span style="color:#6b7280;font-size:13px">Includes $${gstAmt.toFixed(2)} GST</span>` : ''}
  </div>`;
}

/* Acceptance / awaiting-payment email sent when an admin accepts a request.
   `adminMessage` is a short staff note shown up top; `payMethod` decides the
   payment instructions (etransfer shows the address + reference). */
export function acceptanceEmail({ name, site, parkingType, checkIn, checkOut, estTotal, gstAmt, resId, adminMessage, payMethod }) {
  const nights = Math.max(1, nightsBetween(checkIn, checkOut));
  const label  = siteLabel(site, parkingType);
  const amtNote = estTotal > 0 ? `$${estTotal.toFixed(2)} CAD` : 'your balance';

  const payBlock = payMethod === 'etransfer'
    ? `<div style="background:#fff8ee;border:1px solid #f0b84a;border-radius:8px;padding:14px 18px;margin:1.2rem 0">
        <strong style="color:${AMBER}">Payment — Interac e-Transfer</strong><br><br>
        Please send ${amtNote} to:<br>
        <strong>${ETRANSFER_TO}</strong><br>
        Reference: <strong>#${resId} ${esc(name)}</strong><br><br>
        <span style="color:#6b7280;font-size:13px">Your reservation is held for 48 hours pending payment. We'll email you again once it's received.</span>
      </div>`
    : payMethod === 'on_arrival'
    ? `<div style="background:#fff8ee;border:1px solid #f0b84a;border-radius:8px;padding:14px 18px;margin:1.2rem 0">
        <strong style="color:${AMBER}">Payment — On arrival</strong><br><br>
        ${amtNote !== 'your balance' ? amtNote + ' is ' : ''}payable by cash or card when you arrive at the park.
      </div>`
    : `<div style="background:#fff8ee;border:1px solid #f0b84a;border-radius:8px;padding:14px 18px;margin:1.2rem 0">
        <strong style="color:${AMBER}">Payment</strong><br><br>
        Please pay ${amtNote} via the park honesty box, e-Transfer to <strong>${ETRANSFER_TO}</strong>, or on arrival.
      </div>`;

  const inner = `
    <p>Hi <strong>${esc(name)}</strong>,</p>
    ${adminMessage ? `<p style="font-size:15px;color:#1f2937">${esc(adminMessage)}</p>` : ''}
    ${detailsTable(label, checkIn, checkOut, nights)}
    ${totalBlock(estTotal, gstAmt)}
    ${payBlock}
    <p style="color:#9ca3af;font-size:12px">Reservation #${resId}</p>`;

  return { subject: `Reservation accepted — ${label}, Eileen Scott Centennial Park`, html: shell(`Reservation Accepted — ${esc(label)}`, inner) };
}

/* Payment-request / 48-hour-hold reminder, sent on demand from the admin panel.
   Leads with the hold notice, then the same payment instructions style as the
   acceptance email. `amountDue` is the figure the guest still owes. */
export function paymentRequestEmail({ name, site, parkingType, checkIn, checkOut, amountDue, resId, payMethod }) {
  const nights = Math.max(1, nightsBetween(checkIn, checkOut));
  const label  = siteLabel(site, parkingType);
  const amtNote = amountDue > 0 ? `$${amountDue.toFixed(2)} CAD` : 'your balance';

  const payLine = payMethod === 'on_arrival'
    ? `${amtNote !== 'your balance' ? amtNote + ' is ' : ''}payable by cash or card when you arrive at the park.`
    : `Please send ${amtNote} by Interac e-Transfer to:<br><strong>${ETRANSFER_TO}</strong><br>Reference: <strong>#${resId} ${esc(name)}</strong>`;

  const inner = `
    <p>Hi <strong>${esc(name)}</strong>,</p>
    <p style="font-size:15px;color:#1f2937">This is a friendly reminder that payment is needed to confirm your reservation.</p>
    <div style="background:#fff8ee;border:1px solid #f0b84a;border-radius:8px;padding:14px 18px;margin:1.2rem 0">
      <strong style="color:${AMBER}">Held for 48 hours</strong><br><br>
      ${payLine}<br><br>
      <span style="color:#6b7280;font-size:13px">Your spot is held for 48 hours. If payment isn't received by then it may be released to other guests.</span>
    </div>
    ${detailsTable(label, checkIn, checkOut, nights)}
    <p style="color:#9ca3af;font-size:12px">Reservation #${resId}</p>`;

  return { subject: `Payment needed to hold your booking — ${label} (#${resId})`, html: shell(`Payment Requested — ${esc(label)}`, inner) };
}

/* Payment-received / booking-complete email sent when an admin marks paid. */
export function paidEmail({ name, site, parkingType, checkIn, checkOut, estTotal, resId }) {
  const nights = Math.max(1, nightsBetween(checkIn, checkOut));
  const label  = siteLabel(site, parkingType);

  const inner = `
    <p>Hi <strong>${esc(name)}</strong>,</p>
    <div style="background:#ecfdf3;border:1px solid #16a34a;border-radius:8px;padding:14px 18px;margin:1rem 0">
      <strong style="color:#15803d">Payment received — your reservation is complete!</strong>
    </div>
    ${detailsTable(label, checkIn, checkOut, nights)}
    ${estTotal > 0 ? `<p style="color:#374151">Paid in full: <strong>$${estTotal.toFixed(2)} CAD</strong>. Thank you!</p>` : '<p style="color:#374151">Thank you!</p>'}
    <p style="color:#374151">We look forward to seeing you at the park. Safe travels!</p>
    <p style="color:#9ca3af;font-size:12px">Reservation #${resId}</p>`;

  return { subject: `Payment received — your booking is complete (#${resId})`, html: shell('Payment Received — Booking Complete', inner) };
}
