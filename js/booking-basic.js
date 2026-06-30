/* booking-basic.js — stripped-down booking form (camping & moorage only, no pricing) */

(function () {
  'use strict';

  var form = document.querySelector('[data-form="booking-basic"]');
  if (!form) return;

  var campChip = form.querySelector('#bkbCampChip');
  var moorChip = form.querySelector('#bkbMoorChip');
  var campHid  = form.querySelector('#bkbCamp');
  var moorHid  = form.querySelector('#bkbMoor');
  var campSec  = form.querySelector('[data-basic-section="camping"]');
  var moorSec  = form.querySelector('[data-basic-section="moorage"]');
  var hint     = form.querySelector('[data-basic-hint]');

  /* ── Chip → hidden input + section visibility ─────────── */
  function sync() {
    if (campHid) campHid.value = campChip.checked ? 'yes' : 'no';
    if (moorHid) moorHid.value = moorChip.checked ? 'yes' : 'no';
    if (campSec) campSec.classList.toggle('is-hidden', !campChip.checked);
    if (moorSec) moorSec.classList.toggle('is-hidden', !moorChip.checked);
    if (hint && (campChip.checked || moorChip.checked)) hint.style.color = '';
  }
  [campChip, moorChip].forEach(function (c) { if (c) c.addEventListener('change', sync); });

  /* ── Date minimums (today, check-out ≥ check-in) ──────── */
  var cin  = form.querySelector('#bkbIn');
  var cout = form.querySelector('#bkbOut');
  if (cin && cout) {
    var today = new Date().toISOString().split('T')[0];
    cin.min = today;
    cout.min = today;
    cin.addEventListener('change', function () {
      cout.min = cin.value || today;
      if (cout.value && cout.value < cin.value) cout.value = cin.value;
    });
  }

  var submitBtn = form.querySelector('button[type="submit"]');
  var statusEl  = form.querySelector('.form-status');

  /* ── Submit ───────────────────────────────────────────── */
  form.addEventListener('submit', function (e) {
    e.preventDefault();

    /* honeypot */
    var hp = form.querySelector('[name="website"]');
    if (hp && hp.value) return;

    /* validation */
    var ok = true;
    Array.from(form.querySelectorAll('[required]')).forEach(function (inp) {
      var field = inp.closest('.form-field');
      if (field) field.classList.remove('has-error');
      if (!inp.value.trim()) {
        if (field) field.classList.add('has-error');
        ok = false;
      }
      if (inp.type === 'email' && inp.value && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(inp.value)) {
        if (field) field.classList.add('has-error');
        ok = false;
      }
    });
    if (!campChip.checked && !moorChip.checked) {
      if (hint) hint.style.color = '#c0392b';
      ok = false;
    }
    if (!ok) return;

    submitBtn.disabled  = true;
    submitBtn.innerHTML = '<span>Sending…</span>';
    if (statusEl) { statusEl.textContent = ''; statusEl.className = 'form-status'; }

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
      if (statusEl) {
        statusEl.textContent = '✓ Request sent! We’ll confirm by email within one business day.';
        statusEl.className   = 'form-status is-success';
      }
      form.reset();
      sync();
      submitBtn.disabled  = false;
      submitBtn.innerHTML = '<span>Send request</span>';
    })
    .catch(function (err) {
      var msg = (err && err.message) || '';
      if (statusEl) {
        statusEl.textContent = msg.toLowerCase().indexOf('human') !== -1
          ? 'Please complete the human verification and try again.'
          : 'Something went wrong — please call us at 250-728-3006 or email us directly.';
        statusEl.className = 'form-status is-error';
      }
      if (window.turnstile) {
        var ts = form.querySelector('.cf-turnstile');
        if (ts) turnstile.reset(ts);
      }
      submitBtn.disabled  = false;
      submitBtn.innerHTML = '<span>Send request</span>';
    });
  });
})();
