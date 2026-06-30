/* booking-basic.js — stripped-down booking form (camping & moorage only, no pricing) */

(function () {
  'use strict';

  var form = document.querySelector('[data-form="booking-basic"]');
  if (!form) return;

  /* Per-field errors in TEXT + aria-invalid, not colour alone (1.4.1 / 3.3.1). */
  function setError(inp, msg) {
    var field = inp.closest('.form-field'); if (!field) return;
    field.classList.add('has-error');
    inp.setAttribute('aria-invalid', 'true');
    var e = field.querySelector('.field-error');
    if (!e) {
      e = document.createElement('p'); e.className = 'field-error'; e.setAttribute('role', 'alert');
      if (!inp.id) inp.id = 'f' + Math.random().toString(36).slice(2, 8);
      e.id = inp.id + '-err'; field.appendChild(e);
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
    // Local date — UTC toISOString() rolls a day ahead for evening Pacific users.
    var _now = new Date();
    var today = _now.getFullYear() + '-' + String(_now.getMonth() + 1).padStart(2, '0') + '-' + String(_now.getDate()).padStart(2, '0');
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
      clearError(inp);
      if (!inp.value.trim()) {
        setError(inp, 'This field is required.');
        ok = false;
      } else if (inp.type === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(inp.value)) {
        setError(inp, 'Enter a valid email address, e.g. name@example.com.');
        ok = false;
      }
    });
    if (!campChip.checked && !moorChip.checked) {
      if (hint) { hint.textContent = 'Please choose Campsite, Moorage, or both to continue.'; hint.setAttribute('role', 'alert'); hint.classList.add('field-error'); }
      ok = false;
    } else if (hint) {
      hint.textContent = 'Select all that apply'; hint.removeAttribute('role'); hint.classList.remove('field-error');
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
