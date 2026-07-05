/* home.js — animations, tabs, rate cards, contact toggle, photo modal */

(function () {
  'use strict';

  var prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ── Hero video: honour reduced-motion (WCAG) — pause to the poster frame
        for visitors who ask for less motion. Otherwise autoplay handles it. ── */
  (function () {
    var hv = document.querySelector('.hero-video');
    if (hv && prefersReduced) { hv.removeAttribute('autoplay'); hv.pause(); }
  })();

  /* ── Split hero titles into word-reveal spans ─────────── */
  document.querySelectorAll('[data-words]').forEach(function (el) {
    var words = el.textContent.trim().split(/\s+/);
    el.textContent = '';
    words.forEach(function (word, i) {
      var w = document.createElement('span'); w.className = 'w';
      var inner = document.createElement('i');
      inner.textContent = word; inner.style.setProperty('--wi', i);
      w.appendChild(inner);
      el.appendChild(w);
      if (i < words.length - 1) el.appendChild(document.createTextNode(' '));
    });
    el.classList.add('word-reveal');
  });

  /* ── Reveal on scroll ─────────────────────────────────── */
  var revealEls = document.querySelectorAll('[data-reveal], .word-reveal, .hand');
  if ('IntersectionObserver' in window && !prefersReduced) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (e.isIntersecting) { e.target.classList.add('is-visible'); io.unobserve(e.target); }
      });
    }, { threshold: 0.13, rootMargin: '0px 0px -4% 0px' });
    revealEls.forEach(function (el) { io.observe(el); });
  } else {
    revealEls.forEach(function (el) { el.classList.add('is-visible'); });
  }

  /* ── Scroll progress bar ──────────────────────────────── */
  var progressBar = document.getElementById('scroll-progress-bar');
  var ticking = false;
  function onScroll() {
    var y = window.scrollY;
    var max = document.documentElement.scrollHeight - window.innerHeight;
    if (progressBar && max > 0) progressBar.style.width = (y / max * 100) + '%';
    /* hero parallax */
    var heroMedia = document.querySelector('[data-parallax]');
    if (heroMedia && !prefersReduced && y < window.innerHeight) {
      heroMedia.style.transform = 'translateY(' + (y * 0.35) + 'px)';
    }
    ticking = false;
  }
  window.addEventListener('scroll', function () {
    if (!ticking) { requestAnimationFrame(onScroll); ticking = true; }
  }, { passive: true });
  onScroll();

  /* ── Section dots ─────────────────────────────────────── */
  var panels   = document.querySelectorAll('.panel[id]');
  var dotLinks = document.querySelectorAll('.section-dots a');
  if ('IntersectionObserver' in window && panels.length) {
    var dotIO = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (e.isIntersecting) {
          dotLinks.forEach(function (a) {
            a.classList.toggle('is-active', a.getAttribute('data-section') === e.target.id);
          });
        }
      });
    }, { threshold: 0.4 });
    panels.forEach(function (p) { dotIO.observe(p); });
  }

  /* ── Count-up rate prices ─────────────────────────────── */
  var counters = document.querySelectorAll('[data-count]');
  if ('IntersectionObserver' in window && !prefersReduced) {
    var cIO = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (!e.isIntersecting) return;
        cIO.unobserve(e.target);
        var el = e.target, target = parseFloat(el.getAttribute('data-count'));
        var prefix = el.getAttribute('data-prefix') || '', start = null, dur = 900;
        function tick(ts) {
          if (!start) start = ts;
          var p = Math.min((ts - start) / dur, 1);
          var eased = 1 - Math.pow(1 - p, 3);
          el.textContent = prefix + Math.round(target * eased);
          if (p < 1) requestAnimationFrame(tick);
        }
        requestAnimationFrame(tick);
      });
    }, { threshold: 0.6 });
    counters.forEach(function (el) { cIO.observe(el); });
  }

  /* ── Travel tabs ──────────────────────────────────────── */
  var tabs  = document.querySelectorAll('.travel-tab');
  var panes = document.querySelectorAll('.travel-pane');
  tabs.forEach(function (tab) {
    tab.addEventListener('click', function () {
      tabs.forEach(function (t) {
        var active = t === tab;
        t.classList.toggle('is-active', active);
        t.setAttribute('aria-selected', String(active));
      });
      panes.forEach(function (p) {
        var active = p.id === tab.getAttribute('aria-controls');
        p.classList.toggle('is-active', active);
        p.hidden = !active;
      });
      window.dispatchEvent(new CustomEvent('travelpane', { detail: tab.getAttribute('aria-controls') }));
    });
  });

  /* ── Rate card expand (exclusive — only one open at a time) ── */
  document.querySelectorAll('[data-rate-cards]').forEach(function (list) {
    list.addEventListener('click', function (e) {
      var btn = e.target.closest('.rate-card-btn');
      if (!btn) return;
      var expanded = btn.getAttribute('aria-expanded') === 'true';
      /* close all cards first */
      list.querySelectorAll('.rate-card-btn').forEach(function (b) {
        b.setAttribute('aria-expanded', 'false');
        var d = document.getElementById(b.getAttribute('aria-controls'));
        if (d) d.hidden = true;
      });
      /* then open the clicked one (unless it was already open) */
      if (!expanded) {
        var detail = document.getElementById(btn.getAttribute('aria-controls'));
        btn.setAttribute('aria-expanded', 'true');
        if (detail) detail.hidden = false;
      }
    });
  });

  /* ── Contact panel toggle ─────────────────────────────── */
  var contactBtn   = document.getElementById('contact-action-btn');
  var inquirePanel = document.getElementById('inquire-panel');
  if (contactBtn && inquirePanel) {
    contactBtn.addEventListener('click', function () {
      var open = contactBtn.getAttribute('aria-expanded') === 'true';
      contactBtn.setAttribute('aria-expanded', String(!open));
      inquirePanel.hidden = open;
      contactBtn.textContent = open ? 'Send a message' : 'Close';
      if (!open) {
        var first = inquirePanel.querySelector('input:not([tabindex="-1"]),textarea');
        if (first) first.focus();
      }
    });
  }

  /* ── Offer card slideshows (cross-dissolve) ───────────── */
  if (!prefersReduced) {
    document.querySelectorAll('[data-slideshow]').forEach(function (show, ci) {
      var slides = show.querySelectorAll('.offer-slide');
      if (slides.length < 2) return;
      var idx = 0;
      /* stagger each card so they don't all flip in unison */
      setTimeout(function () {
        setInterval(function () {
          slides[idx].classList.remove('is-active');
          idx = (idx + 1) % slides.length;
          slides[idx].classList.add('is-active');
        }, 5200);
      }, ci * 1500);
    });
  }

  /* ── Photo lightbox ───────────────────────────────────── */
  var modal    = document.getElementById('photo-modal');
  var modalImg = document.getElementById('photo-modal-img');
  var modalCap = document.getElementById('photo-modal-cap');

  function openModal(src, alt) {
    if (!modal) return;
    modalImg.src = src; modalImg.alt = alt;
    if (modalCap) modalCap.textContent = alt;
    modal.hidden = false;
    document.body.style.overflow = 'hidden';
    modal.querySelector('.photo-modal-close').focus();
  }
  function closeModal() {
    if (!modal) return;
    modal.hidden = true;
    document.body.style.overflow = '';
  }

  document.querySelectorAll('.offer-photo-btn').forEach(function (btn) {
    if (btn.hasAttribute('data-park-info')) return;   // opens the info drawer, not the lightbox
    btn.addEventListener('click', function () {
      openModal(btn.getAttribute('data-photo-src'), btn.getAttribute('data-photo-alt'));
    });
  });

  if (modal) {
    modal.querySelector('.photo-modal-close').addEventListener('click', closeModal);
    modal.querySelector('.photo-modal-backdrop').addEventListener('click', closeModal);
    modal.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') closeModal();
    });
  }

  /* ── Park info slide-out drawer ───────────────────────── */
  var drawer = document.getElementById('park-info');
  var infoTrigger = null;

  function openDrawer(trigger) {
    if (!drawer) return;
    infoTrigger = trigger || null;
    drawer.hidden = false;
    document.body.style.overflow = 'hidden';
    var firstTab = drawer.querySelector('.info-tab');
    if (firstTab) firstTab.focus();
  }
  function closeDrawer() {
    if (!drawer || drawer.hidden) return;
    drawer.hidden = true;
    document.body.style.overflow = '';
    if (infoTrigger) { infoTrigger.focus(); infoTrigger = null; }
  }

  document.querySelectorAll('[data-park-info]').forEach(function (btn) {
    btn.addEventListener('click', function () { openDrawer(btn); });
  });

  if (drawer) {
    drawer.querySelectorAll('[data-info-close]').forEach(function (el) {
      el.addEventListener('click', closeDrawer);
    });
    drawer.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') closeDrawer();
    });

    /* tab switching */
    var tabs = Array.prototype.slice.call(drawer.querySelectorAll('.info-tab'));
    tabs.forEach(function (tab) {
      tab.addEventListener('click', function () {
        tabs.forEach(function (t) {
          var on = t === tab;
          t.classList.toggle('is-active', on);
          t.setAttribute('aria-selected', on ? 'true' : 'false');
          var pane = document.getElementById(t.getAttribute('aria-controls'));
          if (pane) { pane.hidden = !on; pane.classList.toggle('is-active', on); }
        });
      });
    });
  }

})();
