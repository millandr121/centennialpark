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
    .then(function (r) { return r.ok ? r.json() : Promise.reject(r.status); })
    .then(function () {
      if (statusEl) statusEl.textContent = '✓ Message sent — we\'ll be in touch soon!';
      form.reset();
      submitBtn.disabled    = false;
      submitBtn.textContent = 'Send message';
    })
    .catch(function () {
      if (statusEl) statusEl.textContent = 'Could not send — please email bamfieldcentennialpark@gmail.com directly.';
      submitBtn.disabled    = false;
      submitBtn.textContent = 'Send message';
    });
  });
})();
