/* home.js — accordion, reveal, rates toggle, section dots, rate card expand */

(function () {
  'use strict';

  /* ── Reveal on scroll ─────────────────────────────────── */
  var revealEls = document.querySelectorAll('[data-reveal]');
  if ('IntersectionObserver' in window && revealEls.length) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (e.isIntersecting) {
          e.target.classList.add('is-visible');
          io.unobserve(e.target);
        }
      });
    }, { threshold: 0.12 });
    revealEls.forEach(function (el) { io.observe(el); });
  } else {
    revealEls.forEach(function (el) { el.classList.add('is-visible'); });
  }

  /* ── Section dots active state ────────────────────────── */
  var panels    = document.querySelectorAll('.panel[id]');
  var dotLinks  = document.querySelectorAll('.section-dots a');

  function setActiveDot(id) {
    dotLinks.forEach(function (a) {
      a.classList.toggle('is-active', a.getAttribute('data-section') === id);
    });
  }

  if ('IntersectionObserver' in window && panels.length) {
    var dotIO = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (e.isIntersecting) setActiveDot(e.target.id);
      });
    }, { threshold: 0.45 });
    panels.forEach(function (p) { dotIO.observe(p); });
  }

  /* ── Pick accordion ───────────────────────────────────── */
  document.querySelectorAll('[data-pick-accordion]').forEach(function (list) {
    list.addEventListener('click', function (e) {
      var btn = e.target.closest('.pick-q');
      if (!btn) return;
      var expanded = btn.getAttribute('aria-expanded') === 'true';
      var targetId = btn.getAttribute('aria-controls');
      var panel    = document.getElementById(targetId);
      if (!panel) return;

      /* collapse others in same list */
      list.querySelectorAll('.pick-q').forEach(function (b) {
        if (b !== btn) {
          b.setAttribute('aria-expanded', 'false');
          var pid = b.getAttribute('aria-controls');
          var p   = document.getElementById(pid);
          if (p) p.hidden = true;
        }
      });

      btn.setAttribute('aria-expanded', String(!expanded));
      panel.hidden = expanded;
    });
  });

  /* ── Rates toggle (summary ↔ full) ────────────────────── */
  var ratesToggle  = document.getElementById('rates-toggle');
  var ratesSummary = document.getElementById('rates-summary');
  var ratesFull    = document.getElementById('rates-full');

  if (ratesToggle && ratesSummary && ratesFull) {
    ratesToggle.addEventListener('click', function () {
      var isExpanded = ratesToggle.getAttribute('aria-expanded') === 'true';
      ratesToggle.setAttribute('aria-expanded', String(!isExpanded));
      ratesToggle.textContent = isExpanded ? 'See full rates' : 'Hide full rates';
      ratesFull.hidden    =  isExpanded;
      ratesSummary.hidden = !isExpanded;
    });
  }

  /* ── Rate card expand ─────────────────────────────────── */
  document.querySelectorAll('[data-rate-cards]').forEach(function (list) {
    list.addEventListener('click', function (e) {
      var btn = e.target.closest('.rate-card-btn');
      if (!btn) return;
      var expanded = btn.getAttribute('aria-expanded') === 'true';
      var detail   = document.getElementById(btn.getAttribute('aria-controls'));
      if (!detail) return;
      btn.setAttribute('aria-expanded', String(!expanded));
      detail.hidden = expanded;
    });
  });

  /* ── Contact message panel toggle ────────────────────── */
  var contactBtn   = document.getElementById('contact-action-btn');
  var inquirePanel = document.getElementById('inquire-panel');
  if (contactBtn && inquirePanel) {
    contactBtn.addEventListener('click', function () {
      var open = contactBtn.getAttribute('aria-expanded') === 'true';
      contactBtn.setAttribute('aria-expanded', String(!open));
      inquirePanel.hidden = open;
      contactBtn.textContent = open ? 'Send a message' : 'Close';
      if (!open) inquirePanel.querySelector('input,textarea').focus();
    });
  }

})();
