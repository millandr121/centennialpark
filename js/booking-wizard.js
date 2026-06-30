/* booking-wizard.js — multi-step booking form wizard */

(function () {
  'use strict';

  var form = document.querySelector('[data-form="booking"]');
  if (!form) return;

  var panels     = Array.from(form.querySelectorAll('[data-wizard-step]'));
  var steps      = form.querySelectorAll('.wizard-steps li');
  var barFill    = document.getElementById('wizard-bar-fill');
  var backBtn    = form.querySelector('.wizard-back');
  var primaryBtn = form.querySelector('.wizard-primary');
  var current    = 0;

  /* ── Chip → hidden input sync ─────────────────────────── */
  var campsiteChip = form.querySelector('#needCampsiteChip');
  var moorageChip  = form.querySelector('#needMoorageChip');
  var parkingChip  = form.querySelector('#needParkingChip');
  var launchChip   = form.querySelector('#needLaunchChip');
  var campsiteHid  = form.querySelector('#needCampsite');
  var moorageHid   = form.querySelector('#needMoorage');
  var parkingHid   = form.querySelector('#needParking');
  var launchHid    = form.querySelector('#needLaunch');

  function syncChips() {
    if (campsiteChip && campsiteHid) campsiteHid.value = campsiteChip.checked ? 'yes' : 'no';
    if (moorageChip  && moorageHid)  moorageHid.value  = moorageChip.checked  ? 'yes' : 'no';
    if (parkingChip  && parkingHid)  parkingHid.value  = parkingChip.checked  ? 'yes' : 'no';
    if (launchChip   && launchHid)   launchHid.value   = launchChip.checked   ? 'yes' : 'no';
  }
  [campsiteChip, moorageChip, parkingChip, launchChip].forEach(function (c) {
    if (c) c.addEventListener('change', syncChips);
  });

  /* ── Show/hide booking sections on step 3 ─────────────── */
  function updateStep3Sections() {
    var needCamp   = campsiteChip && campsiteChip.checked;
    var needMoor   = moorageChip  && moorageChip.checked;
    var needPark   = parkingChip  && parkingChip.checked;
    var needLnch   = launchChip   && launchChip.checked;
    var needAddons = needMoor || needLnch;

    var campSec   = form.querySelector('[data-booking-section="camping"]');
    var moorSec   = form.querySelector('[data-booking-section="moorage"]');
    var parkSec   = form.querySelector('[data-booking-section="parking"]');
    var lnchSec   = form.querySelector('[data-booking-section="launch"]');
    var addnSec   = form.querySelector('[data-booking-section="addons"]');

    if (campSec) campSec.classList.toggle('is-hidden', !needCamp);
    if (moorSec) moorSec.classList.toggle('is-hidden', !needMoor);
    if (parkSec) parkSec.classList.toggle('is-hidden', !needPark);
    if (lnchSec) lnchSec.classList.toggle('is-hidden', !needLnch);
    if (addnSec) addnSec.classList.toggle('is-hidden', !needAddons);
  }

  /* ── Launch period → show/hide daily qty field ───────── */
  var launchPeriodSel = form.querySelector('#launchPeriod');
  var launchDaysWrap  = form.querySelector('#launchDaysWrap');
  function updateLaunchDaysVisibility() {
    if (!launchPeriodSel || !launchDaysWrap) return;
    var isDaily = !launchPeriodSel.value || launchPeriodSel.value === 'day';
    launchDaysWrap.classList.toggle('is-hidden', !isDaily);
  }
  if (launchPeriodSel) {
    launchPeriodSel.addEventListener('change', updateLaunchDaysVisibility);
    updateLaunchDaysVisibility();
  }

  /* ── Progress bar & step indicators ──────────────────── */
  function updateProgress() {
    var pct = ((current + 1) / panels.length) * 100;
    if (barFill) barFill.style.width = pct + '%';
    var bar = form.querySelector('.wizard-bar');
    if (bar) bar.setAttribute('aria-valuenow', current + 1);
    steps.forEach(function (s, i) {
      s.classList.toggle('is-active', i === current);
      s.classList.toggle('is-done',   i < current);
    });
  }

  /* ── Navigate to step ─────────────────────────────────── */
  function goTo(idx) {
    panels[current].classList.remove('is-active');
    current = idx;
    panels[current].classList.add('is-active');
    if (current === 2) updateStep3Sections();
    if (current === 3) buildReview();
    backBtn.hidden       = current === 0;
    primaryBtn.innerHTML = '<span>' + (current === panels.length - 1 ? 'Send request' : 'Continue') + '</span>';
    updateProgress();
    var top = form.getBoundingClientRect().top + window.scrollY - 80;
    window.scrollTo({ top: top > 0 ? top : 0, behavior: 'smooth' });
  }

  /* ── Per-field error helpers — errors are conveyed in TEXT + aria-invalid,
        not by colour alone (WCAG 1.4.1 / 3.3.1 / 4.1.3). ─────────────────── */
  function setError(inp, msg) {
    var field = inp.closest('.form-field'); if (!field) return;
    field.classList.add('has-error');
    inp.setAttribute('aria-invalid', 'true');
    var e = field.querySelector('.field-error');
    if (!e) {
      e = document.createElement('p');
      e.className = 'field-error';
      e.setAttribute('role', 'alert');
      if (!inp.id) inp.id = 'f' + Math.random().toString(36).slice(2, 8);
      e.id = inp.id + '-err';
      field.appendChild(e);
    }
    inp.setAttribute('aria-describedby', e.id);
    e.textContent = msg;
  }
  function clearError(inp) {
    var field = inp.closest('.form-field'); if (!field) return;
    field.classList.remove('has-error');
    inp.removeAttribute('aria-invalid');
    var e = field.querySelector('.field-error'); if (e) e.textContent = '';
  }

  /* ── Validation ───────────────────────────────────────── */
  function validateCurrent() {
    var panel = panels[current];
    var inputs = Array.from(panel.querySelectorAll('input[required], textarea[required]'));
    var ok = true;
    inputs.forEach(function (inp) {
      clearError(inp);
      if (!inp.value.trim()) {
        setError(inp, 'This field is required.');
        ok = false;
      } else if (inp.type === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(inp.value)) {
        setError(inp, 'Enter a valid email address, e.g. name@example.com.');
        ok = false;
      }
    });

    /* step 1: at least one selection — announce in text, not just colour */
    if (current === 0) {
      var any = [campsiteChip, moorageChip, parkingChip, launchChip].some(function (c) { return c && c.checked; });
      var hint = form.querySelector('.wizard-hint');
      if (!any) {
        if (hint) { hint.textContent = 'Please choose at least one option to continue.'; hint.setAttribute('role', 'alert'); hint.classList.add('field-error'); }
        ok = false;
      } else if (hint) {
        hint.textContent = 'Select all that apply'; hint.removeAttribute('role'); hint.classList.remove('field-error');
      }
    }

    /* step 3: parking type required if parking selected */
    if (current === 2 && parkingChip && parkingChip.checked) {
      var ptSel = form.querySelector('#parkingType');
      if (ptSel && !ptSel.value) { setError(ptSel, 'Please choose a parking type.'); ok = false; }
      else if (ptSel) { clearError(ptSel); }
    }

    return ok;
  }

  /* ── Review summary + pricing ─────────────────────────── */
  function buildReview() {
    var box  = document.getElementById('booking-review');
    var pbox = document.getElementById('booking-pricing');
    if (!box) return;

    var fn    = val('#firstName');
    var ln    = val('#lastName');
    var em    = val('#email');
    var camp  = campsiteChip && campsiteChip.checked;
    var moor  = moorageChip  && moorageChip.checked;
    var park  = parkingChip  && parkingChip.checked;
    var lnch  = launchChip   && launchChip.checked;
    var cin   = val('#checkIn');
    var cout  = val('#checkOut');
    var sites = val('#siteCount') || '1';
    var ppl   = val('#groupSize');
    var blen  = val('#boatLength');
    var ptype = val('#parkingType');
    var lprd  = val('#launchPeriod') || 'day';
    var ldays = val('#launchDays') || '1';
    var bwq   = val('#boatWashQty') || '0';
    var frdays= val('#freezerDays') || '0';
    var pmeth = val('#paymentMethod');

    var lines = [];
    lines.push('<strong>' + fn + ' ' + ln + '</strong> &middot; ' + em);
    if (camp) lines.push('Campsite &middot; ' + sites + ' site(s)' + (ppl ? ', ' + ppl + ' people' : ''));
    if (moor) lines.push('Moorage &middot; ' + (blen || '?') + ' ft');
    if (park) {
      var ptL = { car: 'Car parking', trailer: 'Trailer parking', both: 'Car + Trailer parking' };
      lines.push(ptL[ptype] || 'Parking');
    }
    if (lnch) {
      var lpL = { day: 'Boat launch (daily)', seasonal: 'Boat launch — seasonal pass', annual: 'Boat launch — annual pass' };
      lines.push(lpL[lprd] || 'Boat launch');
    }
    if (cin) lines.push('Check-in: ' + cin + (cout ? '&nbsp;&nbsp;&rarr;&nbsp;&nbsp;Check-out: ' + cout : ''));
    box.innerHTML = lines.join('<br>');

    /* pricing */
    if (!pbox || !window.ParkPricing) return;

    var nights = 0;
    if (cin && cout) nights = Math.round((new Date(cout) - new Date(cin)) / 86400000);

    var p = window.ParkPricing.calcPricing({
      nights:       nights,
      needCampsite: camp,
      siteCount:    parseInt(sites) || 1,
      needMoorage:  moor,
      boatLength:   blen,
      needParking:  park,
      parkingType:  ptype,
      needLaunch:   lnch,
      launchPeriod: lprd,
      launchDays:   lprd === 'day' ? (parseInt(ldays) || Math.max(nights, 1)) : 0,
      boatWashQty:  parseInt(bwq)   || 0,
      freezerDays:  parseInt(frdays)|| 0
    });

    var etEl = form.querySelector('#estimatedTotal');
    var gaEl = form.querySelector('#gstAmount');
    if (etEl) etEl.value = p.total.toFixed(2);
    if (gaEl) gaEl.value = p.gst.toFixed(2);

    if (p.lines.length === 0) { pbox.innerHTML = ''; return; }

    var fmt = window.ParkPricing.fmtCAD;
    var html = '<div class="wizard-price-box">' +
      '<p class="wizard-subhead" style="margin-top:1.25rem">Estimated cost</p>' +
      '<table class="price-table">';
    p.lines.forEach(function (l) {
      html += '<tr><td>' + l.label + '</td><td>' + fmt(l.amount) + '</td></tr>';
    });
    if (p.gst > 0) {
      html += '<tr class="price-sub"><td>Subtotal (ex. GST)</td><td>' + fmt(p.subtotal) + '</td></tr>';
      html += '<tr class="price-sub"><td>GST (5%, included)</td><td>' + fmt(p.gst) + '</td></tr>';
    }
    html += '<tr class="price-total"><td>Estimated total (all-in)</td><td>' + fmt(p.total) + '</td></tr>';
    html += '</table>';
    if (pmeth) {
      var pmL = { etransfer: 'Interac e-Transfer', honesty_box: 'Honesty box at park office', on_arrival: 'Cash / card on arrival' };
      html += '<p class="price-note">Payment: ' + (pmL[pmeth] || pmeth) + '</p>';
    }
    html += '<p class="price-note">Estimate only &mdash; staff will confirm before payment is due.</p></div>';
    pbox.innerHTML = html;
  }

  function val(sel) {
    var el = form.querySelector(sel);
    return el ? el.value : '';
  }

  /* ── Button events ────────────────────────────────────── */
  primaryBtn.addEventListener('click', function () {
    if (!validateCurrent()) return;
    if (current < panels.length - 1) {
      goTo(current + 1);
    } else {
      submitForm();
    }
  });

  backBtn.addEventListener('click', function () {
    if (current > 0) goTo(current - 1);
  });

  /* ── Submit ───────────────────────────────────────────── */
  function submitForm() {
    var status = form.querySelector('.form-status');
    primaryBtn.disabled  = true;
    primaryBtn.innerHTML = '<span>Sending…</span>';
    if (status) { status.textContent = ''; status.className = 'form-status'; }

    var data = {};
    new FormData(form).forEach(function (v, k) { data[k] = v; });

    fetch('/api/booking', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    })
    .then(function (r) {
      return r.json().then(function (j) {
        if (!r.ok) throw new Error(j.error || r.status);
        return j;
      });
    })
    .then(function () {
      if (status) {
        status.textContent = '✓ Request sent! We’ll confirm by email within one business day.';
        status.className   = 'form-status is-success';
      }
      form.reset();
      goTo(0);
    })
    .catch(function (err) {
      var msg = (err && err.message) || '';
      if (status) {
        status.textContent = msg.toLowerCase().indexOf('human') !== -1
          ? 'Please complete the human verification and try again.'
          : 'Something went wrong — please call us at 250-728-3006 or email us directly.';
        status.className = 'form-status is-error';
      }
      if (window.turnstile) {
        var ts = form.querySelector('.cf-turnstile');
        if (ts) turnstile.reset(ts);
      }
      primaryBtn.disabled  = false;
      primaryBtn.innerHTML = '<span>Send request</span>';
    });
  }

  /* ── Init ─────────────────────────────────────────────── */
  updateProgress();

})();
