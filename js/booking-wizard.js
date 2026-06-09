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
  var campsiteHid  = form.querySelector('#needCampsite');
  var moorageHid   = form.querySelector('#needMoorage');

  function syncChips() {
    if (campsiteChip && campsiteHid) campsiteHid.value = campsiteChip.checked ? 'yes' : 'no';
    if (moorageChip  && moorageHid)  moorageHid.value  = moorageChip.checked  ? 'yes' : 'no';
  }
  if (campsiteChip) campsiteChip.addEventListener('change', syncChips);
  if (moorageChip)  moorageChip.addEventListener('change', syncChips);

  /* ── Show/hide booking sections on step 3 ─────────────── */
  function updateStep3Sections() {
    var needCamp   = campsiteChip && campsiteChip.checked;
    var needMoor   = moorageChip  && moorageChip.checked;
    var campSec    = form.querySelector('[data-booking-section="camping"]');
    var moorSec    = form.querySelector('[data-booking-section="moorage"]');
    var datesSec   = form.querySelector('[data-booking-section="dates"]');
    if (campSec)  campSec.classList.toggle('is-hidden', !needCamp);
    if (moorSec)  moorSec.classList.toggle('is-hidden', !needMoor);
    if (datesSec) datesSec.classList.remove('is-hidden');
  }

  /* ── Progress bar & step indicators ──────────────────── */
  function updateProgress() {
    var pct = ((current + 1) / panels.length) * 100;
    if (barFill) barFill.style.width = pct + '%';
    var bar = form.querySelector('.wizard-bar');
    if (bar) { bar.setAttribute('aria-valuenow', current + 1); }
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
    backBtn.hidden    = current === 0;
    primaryBtn.textContent = current === panels.length - 1 ? 'Send request' : 'Continue';
    updateProgress();
  }

  /* ── Validation ───────────────────────────────────────── */
  function validateCurrent() {
    var panel = panels[current];
    var inputs = Array.from(panel.querySelectorAll('input[required], textarea[required]'));
    var ok = true;
    inputs.forEach(function (inp) {
      inp.closest('.form-field').classList.remove('has-error');
      if (!inp.value.trim()) {
        inp.closest('.form-field').classList.add('has-error');
        ok = false;
      }
      if (inp.type === 'email' && inp.value && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(inp.value)) {
        inp.closest('.form-field').classList.add('has-error');
        ok = false;
      }
    });
    /* step 1: at least one selection */
    if (current === 0) {
      if (campsiteChip && moorageChip && !campsiteChip.checked && !moorageChip.checked) {
        var hint = form.querySelector('.wizard-hint');
        if (hint) hint.style.color = '#c0392b';
        ok = false;
      }
    }
    return ok;
  }

  /* ── Review summary ───────────────────────────────────── */
  function buildReview() {
    var box = document.getElementById('booking-review');
    if (!box) return;
    var fn    = (form.querySelector('#firstName') || {}).value || '';
    var ln    = (form.querySelector('#lastName')  || {}).value || '';
    var em    = (form.querySelector('#email')     || {}).value || '';
    var camp  = campsiteChip && campsiteChip.checked;
    var moor  = moorageChip  && moorageChip.checked;
    var cin   = (form.querySelector('#checkIn')   || {}).value || '';
    var cout  = (form.querySelector('#checkOut')  || {}).value || '';
    var sites = (form.querySelector('#siteCount') || {}).value || '';
    var ppl   = (form.querySelector('#groupSize') || {}).value || '';
    var blen  = (form.querySelector('#boatLength')|| {}).value || '';

    var lines = [];
    lines.push('<strong>' + fn + ' ' + ln + '</strong> · ' + em);
    if (camp) lines.push('Campsite · ' + (sites || '1') + ' site(s), ' + (ppl || '?') + ' people');
    if (moor) lines.push('Moorage · ' + (blen || '?') + ' ft');
    if (cin)  lines.push('Check-in: ' + cin + (cout ? '  →  Check-out: ' + cout : ''));
    box.innerHTML = lines.join('<br>');
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
    primaryBtn.disabled = true;
    primaryBtn.textContent = 'Sending…';
    if (status) { status.textContent = ''; status.className = 'form-status'; }

    var data = {};
    new FormData(form).forEach(function (v, k) { data[k] = v; });

    fetch('/api/booking', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    })
    .then(function (r) { return r.ok ? r.json() : Promise.reject(r.status); })
    .then(function () {
      if (status) {
        status.textContent = '✓ Request sent! We\'ll confirm by email within one business day.';
        status.className   = 'form-status is-success';
      }
      form.reset();
      goTo(0);
    })
    .catch(function () {
      if (status) {
        status.textContent = 'Something went wrong — please call us at 250-728-3006 or email us directly.';
        status.className   = 'form-status is-error';
      }
      primaryBtn.disabled    = false;
      primaryBtn.textContent = 'Send request';
    });
  }

  /* ── Init ─────────────────────────────────────────────── */
  updateProgress();

})();
