/* forms.js — contact form submission */

(function () {
  'use strict';

  var form = document.querySelector('[data-form="contact"]');
  if (!form) return;

  /* Add submit button dynamically so it only appears when the panel opens */
  var submitBtn = document.createElement('button');
  submitBtn.type = 'submit';
  submitBtn.className = 'btn btn-primary';
  submitBtn.textContent = 'Send message';
  submitBtn.style.marginTop = '.75rem';
  form.appendChild(submitBtn);

  var statusEl = form.querySelector('.inquire-form-status');

  form.addEventListener('submit', function (e) {
    e.preventDefault();

    /* honeypot */
    var hp = form.querySelector('[name="website"]');
    if (hp && hp.value) return;

    /* basic validation */
    var required = Array.from(form.querySelectorAll('[required]'));
    var ok = true;
    required.forEach(function (inp) {
      inp.closest('.form-field').classList.remove('has-error');
      if (!inp.value.trim()) {
        inp.closest('.form-field').classList.add('has-error');
        ok = false;
      }
    });
    if (!ok) return;

    submitBtn.disabled     = true;
    submitBtn.textContent  = 'Sending…';
    if (statusEl) { statusEl.textContent = ''; }

    var data = {};
    new FormData(form).forEach(function (v, k) { data[k] = v; });

    fetch('/api/contact', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    })
    .then(function (r) { return r.json().then(function(j) { if (!r.ok) throw new Error(j.error || r.status); return j; }); })
    .then(function () {
      if (statusEl) { statusEl.textContent = '✓ Message sent — we\'ll be in touch soon!'; statusEl.style.color = '#4ade80'; }
      form.reset();
      submitBtn.disabled    = false;
      submitBtn.textContent = 'Send message';
    })
    .catch(function (err) {
      var msg = (err && err.message) || '';
      if (statusEl) {
        statusEl.textContent = msg.toLowerCase().indexOf('human') !== -1
          ? 'Please complete the human verification below and try again.'
          : 'Could not send — please email bamfieldcentennialpark@gmail.com directly.';
        statusEl.style.color = '#f87171';
      }
      /* reset Turnstile so user can retry */
      if (window.turnstile) {
        var ts = form.querySelector('.cf-turnstile');
        if (ts) turnstile.reset(ts);
      }
      submitBtn.disabled    = false;
      submitBtn.textContent = 'Send message';
    });
  });
})();
