/* booking-live.js — interactive live booking UI */
(function () {
'use strict';

var root = document.getElementById('live-booking-root');
if (!root) return;

/* ── SVG layout definitions ─────────────────────────────────────────────── */

/*
 * Campsite map (schematic, top-down view).
 * Back row C1-C8 runs along the upper treeline.
 * Front row C9-C11 sits closer to Grappler Road.
 */
var CAMP_SITES = [
  /* Back row — left group */
  { id:'C1',  x:60,  y:60,  w:80, h:55 },
  { id:'C2',  x:155, y:60,  w:80, h:55 },
  { id:'C3',  x:250, y:60,  w:80, h:55 },
  { id:'C4',  x:345, y:60,  w:80, h:55 },
  /* Back row — right group */
  { id:'C5',  x:445, y:60,  w:80, h:55 },
  { id:'C6',  x:540, y:60,  w:80, h:55 },
  { id:'C7',  x:635, y:60,  w:80, h:55 },
  /* C8 is L-shaped — represents gazebo-adjacent site */
  { id:'C8',  x:730, y:60,  w:110, h:55 },
  /* Front row */
  { id:'C9',  x:155, y:155, w:80,  h:55 },
  { id:'C10', x:270, y:155, w:80,  h:55 },
  { id:'C11', x:385, y:155, w:80,  h:55 },
];

/*
 * Moorage map.  Two parallel rows of slips off a central dock.
 * BVFD float garage is shown but not bookable.
 */
var MOOR_SITES = [
  /* Left row (west side of dock) */
  { id:'M1',  x:95,  y:65,  w:55, h:38 },
  { id:'M2',  x:95,  y:115, w:55, h:38 },
  { id:'M3',  x:95,  y:165, w:55, h:38 },
  { id:'M4',  x:95,  y:215, w:55, h:38 },
  { id:'M5',  x:95,  y:265, w:55, h:38 },
  /* Right row (east side of dock) */
  { id:'M6',  x:250, y:65,  w:55, h:38 },
  { id:'M7',  x:250, y:115, w:55, h:38 },
  { id:'M8',  x:250, y:165, w:55, h:38 },
  { id:'M9',  x:250, y:215, w:55, h:38 },
  { id:'M10', x:250, y:265, w:55, h:38 },
];

/* ── Colour helpers ─────────────────────────────────────────────────────── */
var CLR = {
  available: '#4a8a52', availableHover: '#2e5d33',
  booked:    '#dc2626', bookedHover:    '#b91c1c',
  selected:  '#d4830a',
  inactive:  '#9ca3af',
  bvfd:      '#6b7280',
  text:      '#ffffff'
};

/* ── State ─────────────────────────────────────────────────────────────── */
var state = {
  checkin:    '',
  checkout:   '',
  available:  [],   // site ids
  booked:     [],   // site ids
  selected:   null, // site id
  tab:        'campsite',  // 'campsite' | 'moorage'
};

/* ── Render ─────────────────────────────────────────────────────────────── */
function render() {
  root.innerHTML = tpl();
  bind();
}

function tpl() {
  return [
    '<div class="lb-wrap">',
      datePicker(),
      state.checkin && state.checkout ? mapSection() : '',
      state.selected ? bookingForm() : '',
    '</div>'
  ].join('');
}

function datePicker() {
  var today = new Date().toISOString().slice(0,10);
  return '<div class="lb-dates">' +
    '<div class="lb-dates-inner">' +
      '<div class="lb-field">' +
        '<label for="lb-checkin">Check-in</label>' +
        '<input type="date" id="lb-checkin" min="' + today + '" value="' + esc(state.checkin) + '">' +
      '</div>' +
      '<div class="lb-field">' +
        '<label for="lb-checkout">Check-out</label>' +
        '<input type="date" id="lb-checkout" min="' + today + '" value="' + esc(state.checkout) + '">' +
      '</div>' +
      '<button class="lb-check-btn" id="lb-check">Check availability</button>' +
    '</div>' +
  '</div>';
}

function mapSection() {
  return '<div class="lb-map-section">' +
    '<div class="lb-tabs" role="tablist">' +
      tab('campsite', '⛺ Campsites') +
      tab('moorage',  '⚓ Moorage') +
    '</div>' +
    '<div class="lb-map-wrap">' +
      (state.tab === 'campsite' ? campMap() : moorMap()) +
    '</div>' +
    legend() +
  '</div>';
}

function tab(id, label) {
  var active = state.tab === id ? ' lb-tab-active' : '';
  return '<button class="lb-tab' + active + '" data-tab="' + id + '">' + label + '</button>';
}

function legend() {
  return '<div class="lb-legend">' +
    '<span class="lb-leg-dot" style="background:' + CLR.available + '"></span> Available &nbsp;&nbsp;' +
    '<span class="lb-leg-dot" style="background:' + CLR.booked + '"></span> Booked &nbsp;&nbsp;' +
    '<span class="lb-leg-dot" style="background:' + CLR.selected + '"></span> Selected' +
  '</div>';
}

/* ── Campsite SVG ─────────────────────────────────────────────────────── */
function campMap() {
  var W = 880, H = 270;
  var lines = [
    '<svg class="lb-svg" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="Campsite map">',
    /* forest background */
    '<rect width="' + W + '" height="' + H + '" fill="#c8dfc8" rx="8"/>',
    /* tree symbols (decorative) */
    treeDots(W, H),
    /* road at bottom */
    '<path d="M0,' + (H-35) + ' Q' + (W/2) + ',' + (H-20) + ' ' + W + ',' + (H-35) + '" stroke="#d1c9b8" stroke-width="28" fill="none"/>',
    '<text x="' + (W/2) + '" y="' + (H-18) + '" text-anchor="middle" font-size="11" fill="#9e9585" font-family="sans-serif">Grappler Road</text>',
    /* parking area (schematic, left) */
    '<rect x="5" y="' + (H*0.35) + '" width="120" height="' + (H*0.35) + '" rx="4" fill="#e8e0d0" opacity=".8"/>',
    '<text x="65" y="' + (H*0.55) + '" text-anchor="middle" font-size="10" fill="#6b6055" font-family="sans-serif">Parking</text>',
    /* entrance path */
    '<path d="M65,' + (H*0.70) + ' L65,' + (H-35) + '" stroke="#d1c9b8" stroke-width="18" fill="none"/>',
  ];

  CAMP_SITES.forEach(function(s) {
    lines.push(siteRect(s, 'campsite'));
  });

  lines.push('</svg>');
  return lines.join('');
}

function moorMap() {
  var W = 420, H = 380;
  var lines = [
    '<svg class="lb-svg" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="Moorage map">',
    /* water */
    '<rect width="' + W + '" height="' + H + '" fill="#bfd9f0" rx="8"/>',
    /* shore */
    '<rect width="' + W + '" height="60" y="' + (H-60) + '" fill="#c8dfc8"/>',
    '<text x="' + (W/2) + '" y="' + (H-18) + '" text-anchor="middle" font-size="11" fill="#4a7a4a" font-family="sans-serif">Rocky Lane / Tower Road</text>',
    /* main dock arm */
    '<line x1="190" y1="' + (H-60) + '" x2="190" y2="50" stroke="#1f2937" stroke-width="8" stroke-linecap="round"/>',
    /* crossbeam top */
    '<line x1="90" y1="50" x2="310" y2="50" stroke="#1f2937" stroke-width="8" stroke-linecap="round"/>',
    /* finger docks — left */
    '<line x1="90" y1="65"  x2="90" y2="310" stroke="#374151" stroke-width="4"/>',
    /* finger docks — right */
    '<line x1="310" y1="65" x2="310" y2="310" stroke="#374151" stroke-width="4"/>',
    /* BVFD float */
    '<rect x="20" y="80" width="58" height="38" rx="4" fill="' + CLR.bvfd + '" opacity=".9"/>',
    '<text x="49" y="99"  text-anchor="middle" font-size="9"  fill="#fff" font-family="sans-serif" font-weight="600">BVFD</text>',
    '<text x="49" y="112" text-anchor="middle" font-size="8"  fill="#fff" font-family="sans-serif">Float</text>',
    /* water ripple labels */
    '<text x="190" y="330" text-anchor="middle" font-size="10" fill="#7fb3d3" font-family="sans-serif">Bamfield Inlet</text>',
  ];

  MOOR_SITES.forEach(function(s) {
    lines.push(siteRect(s, 'moorage'));
  });

  lines.push('</svg>');
  return lines.join('');
}

function siteRect(s, type) {
  var isAvail   = state.available.indexOf(s.id) >= 0;
  var isBooked  = state.booked.indexOf(s.id)    >= 0;
  var isSel     = state.selected === s.id;
  var noData    = state.available.length === 0 && state.booked.length === 0;

  var fill    = noData ? '#9ca3af' : isBooked ? CLR.booked : CLR.available;
  if (isSel) fill = CLR.selected;
  var cursor  = isBooked ? 'not-allowed' : 'pointer';
  var opacity = noData   ? '0.6' : '1';

  var cx = s.x + s.w / 2;
  var cy = s.y + s.h / 2;
  var num = s.id.replace(/[A-Z]+/g,'');

  return [
    '<g class="lb-site" data-id="' + s.id + '" data-booked="' + (isBooked?'1':'0') + '" style="cursor:' + cursor + ';opacity:' + opacity + '">',
    '  <rect x="' + s.x + '" y="' + s.y + '" width="' + s.w + '" height="' + s.h + '" rx="6"',
    '    fill="' + fill + '" stroke="' + (isSel ? '#fff' : 'rgba(0,0,0,.15)') + '" stroke-width="' + (isSel ? 2 : 1) + '"/>',
    '  <text x="' + cx + '" y="' + (cy - 5) + '" text-anchor="middle" font-size="11" fill="' + CLR.text + '" font-family="sans-serif" font-weight="700">' + esc(s.id) + '</text>',
    isBooked
      ? '  <text x="' + cx + '" y="' + (cy + 10) + '" text-anchor="middle" font-size="9" fill="rgba(255,255,255,.8)" font-family="sans-serif">Booked</text>'
      : '  <text x="' + cx + '" y="' + (cy + 10) + '" text-anchor="middle" font-size="9" fill="rgba(255,255,255,.8)" font-family="sans-serif">Available</text>',
    '</g>'
  ].join('\n');
}

function treeDots(W, H) {
  var dots = [];
  var positions = [
    [30,20],[120,15],[220,20],[370,15],[480,20],[580,15],[700,20],[810,15],[850,20],
    [30,230],[500,230],[600,230],[750,230],[820,230]
  ];
  positions.forEach(function(p) {
    if (p[0] < W - 20 && p[1] < H - 50) {
      dots.push('<circle cx="' + p[0] + '" cy="' + p[1] + '" r="8" fill="#a8c8a8" opacity=".6"/>');
    }
  });
  return dots.join('');
}

/* ── Booking form ─────────────────────────────────────────────────────── */
function bookingForm() {
  var site = findSite(state.selected);
  var nights = state.checkin && state.checkout
    ? Math.round((new Date(state.checkout) - new Date(state.checkin)) / 86400000) : 0;

  return '<div class="lb-booking-form" id="lb-form-wrap">' +
    '<div class="lb-form-header">' +
      '<div>' +
        '<div class="lb-form-site">' + esc(state.selected) + '</div>' +
        '<div class="lb-form-dates">' + esc(state.checkin) + ' → ' + esc(state.checkout) + ' · ' + nights + ' night' + (nights!==1?'s':'') + '</div>' +
      '</div>' +
      '<button class="lb-form-close" id="lb-deselect">✕</button>' +
    '</div>' +
    '<form id="lb-guest-form">' +
      '<div class="lb-hp" aria-hidden="true"><label>Website</label><input type="text" name="website" tabindex="-1" autocomplete="off"></div>' +
      '<div class="lb-two">' +
        '<div class="lb-field"><label for="lb-fname">Name *</label><input type="text" id="lb-fname" required autocomplete="name" placeholder="Your name"></div>' +
        '<div class="lb-field"><label for="lb-femail">Email *</label><input type="email" id="lb-femail" required autocomplete="email" placeholder="you@email.com"></div>' +
      '</div>' +
      '<div class="lb-two">' +
        '<div class="lb-field"><label for="lb-fphone">Phone</label><input type="tel" id="lb-fphone" autocomplete="tel" placeholder="250-555-0000"></div>' +
        '<div class="lb-field"><label for="lb-fparty">Party size</label><input type="number" id="lb-fparty" min="1" max="20" placeholder="2"></div>' +
      '</div>' +
      (site && site.type === 'moorage'
        ? '<div class="lb-field"><label for="lb-fboat">Boat length (ft) *</label><input type="number" id="lb-fboat" min="8" max="100" required placeholder="e.g. 24"></div>'
        : '') +
      '<div class="lb-field"><label for="lb-fnotes">Notes (optional)</label><textarea id="lb-fnotes" rows="2" placeholder="Anything we should know…"></textarea></div>' +
      '<div id="lb-turnstile-wrap"></div>' +
      '<div class="lb-status" id="lb-fstatus" role="status" aria-live="polite"></div>' +
      '<button type="submit" class="lb-submit-btn" id="lb-fsubmit"><span>Confirm booking</span></button>' +
    '</form>' +
  '</div>';
}

function findSite(id) {
  return CAMP_SITES.concat(MOOR_SITES).filter(function(s){ return s.id === id; })[0] || null;
}

/* ── Bind events ─────────────────────────────────────────────────────── */
function bind() {
  var ciEl  = document.getElementById('lb-checkin');
  var coEl  = document.getElementById('lb-checkout');
  var chkEl = document.getElementById('lb-check');

  if (ciEl) {
    ciEl.addEventListener('change', function() {
      state.checkin  = this.value;
      if (coEl && (!state.checkout || state.checkout <= state.checkin)) {
        var d = new Date(state.checkin); d.setDate(d.getDate()+1);
        state.checkout = d.toISOString().slice(0,10);
      }
    });
  }
  if (coEl) coEl.addEventListener('change', function() { state.checkout = this.value; });

  if (chkEl) {
    chkEl.addEventListener('click', function() {
      if (!state.checkin || !state.checkout || state.checkin >= state.checkout) {
        alert('Please select valid check-in and check-out dates.');
        return;
      }
      state.selected = null;
      checkAvailability();
    });
  }

  /* Tabs */
  root.querySelectorAll('.lb-tab').forEach(function(btn) {
    btn.addEventListener('click', function() {
      state.tab      = this.dataset.tab;
      state.selected = null;
      render();
    });
  });

  /* Site click */
  root.querySelectorAll('.lb-site').forEach(function(g) {
    g.addEventListener('click', function() {
      if (this.dataset.booked === '1') return;
      var id = this.dataset.id;
      state.selected = state.selected === id ? null : id;
      render();
    });
  });

  /* Deselect */
  var desel = document.getElementById('lb-deselect');
  if (desel) desel.addEventListener('click', function() { state.selected = null; render(); });

  /* Booking form submit */
  var form = document.getElementById('lb-guest-form');
  if (form) form.addEventListener('submit', submitBooking);

  /* Explicitly render Turnstile — auto-render won't fire for dynamically injected elements */
  var tsWrap = document.getElementById('lb-turnstile-wrap');
  if (tsWrap) {
    if (window.turnstile) {
      turnstile.render(tsWrap, { sitekey: '0x4AAAAAADkrvFsmB0Re_CbD', theme: 'dark' });
    } else {
      /* Turnstile script still loading — wait for it */
      window.onloadTurnstileCallback = function() {
        turnstile.render(tsWrap, { sitekey: '0x4AAAAAADkrvFsmB0Re_CbD', theme: 'dark' });
      };
    }
  }
}

async function checkAvailability() {
  var btn = document.getElementById('lb-check');
  if (btn) { btn.disabled = true; btn.textContent = 'Checking…'; }

  try {
    var r   = await fetch('/api/availability?checkin=' + encodeURIComponent(state.checkin) + '&checkout=' + encodeURIComponent(state.checkout) + '&type=all');
    var d   = await r.json();
    state.available = (d.available||[]).map(function(s){ return s.id; });
    state.booked    = (d.booked||[]).map(function(s){ return s.id; });
  } catch(e) {
    state.available = [];
    state.booked    = [];
  }
  render();
}

async function submitBooking(e) {
  e.preventDefault();
  var btn = document.getElementById('lb-fsubmit');
  var st  = document.getElementById('lb-fstatus');
  btn.disabled = true;
  btn.innerHTML = '<span>Booking…</span>';

  var hp = this.querySelector('[name="website"]');
  if (hp && hp.value) { render(); return; }

  var site = findSite(state.selected);

  var payload = {
    siteId:     state.selected,
    checkIn:    state.checkin,
    checkOut:   state.checkout,
    guestName:  (document.getElementById('lb-fname')  ||{}).value || '',
    guestEmail: (document.getElementById('lb-femail') ||{}).value || '',
    guestPhone: (document.getElementById('lb-fphone') ||{}).value || '',
    partySize:  (document.getElementById('lb-fparty') ||{}).value || '',
    boatLength: (document.getElementById('lb-fboat')  ||{}).value || '',
    notes:      (document.getElementById('lb-fnotes') ||{}).value || '',
    'cf-turnstile-response': ''
  };

  /* grab Turnstile token if present */
  var ts = this.querySelector('[name="cf-turnstile-response"]');
  if (ts) payload['cf-turnstile-response'] = ts.value;

  try {
    var r   = await fetch('/api/reserve', {
      method: 'POST',
      headers: {'Content-Type':'application/json'},
      body: JSON.stringify(payload)
    });
    var res = await r.json();

    if (res.ok) {
      /* Success — show confirmation */
      var wrap = document.getElementById('lb-form-wrap');
      if (wrap) wrap.innerHTML =
        '<div class="lb-success">' +
          '<div class="lb-success-icon">✓</div>' +
          '<h3>Booking confirmed!</h3>' +
          '<p>Check your email for confirmation. A confirmation email has been sent to the address you provided.</p>' +
          '<p class="lb-success-details">' + esc(state.selected) + ' · ' + esc(state.checkin) + ' → ' + esc(state.checkout) + '</p>' +
          '<p style="color:#6b7280;font-size:.85rem">Payment is collected on arrival. Questions? Call 250-728-3006.</p>' +
        '</div>';
      /* Mark site booked on map */
      state.booked.push(state.selected);
      state.available = state.available.filter(function(id){ return id !== state.selected; });
      state.selected  = null;
    } else {
      st.textContent = res.error || 'Something went wrong. Please try again.';
      st.className   = 'lb-status lb-status-error';
      btn.disabled   = false;
      btn.innerHTML  = '<span>Confirm booking</span>';
      /* Reset Turnstile so user can retry */
      var tsWrap = document.getElementById('lb-turnstile-wrap');
      if (tsWrap && window.turnstile) turnstile.render(tsWrap, { sitekey: '0x4AAAAAADkrvFsmB0Re_CbD', theme: 'dark' });
    }
  } catch(ex) {
    st.textContent = 'Network error. Please try again.';
    st.className   = 'lb-status lb-status-error';
    btn.disabled   = false;
    btn.innerHTML  = '<span>Confirm booking</span>';
    var tsWrap2 = document.getElementById('lb-turnstile-wrap');
    if (tsWrap2 && window.turnstile) turnstile.render(tsWrap2, { sitekey: '0x4AAAAAADkrvFsmB0Re_CbD', theme: 'dark' });
  }
}

function esc(v) {
  return String(v==null?'':v).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

/* ── Init ─────────────────────────────────────────────────────────────── */
render();

})();
