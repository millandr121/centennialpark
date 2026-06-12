/* route-map.js — animated travel maps for Drive / Ferry / Fly tabs */

(function () {
  'use strict';
  if (typeof L === 'undefined') return;

  var prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  var BAMFIELD  = [48.833, -125.133];
  var TILE_URL  = 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager_nolabels/{z}/{x}/{y}{r}.png';
  var LABEL_URL = 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager_only_labels/{z}/{x}/{y}{r}.png';
  var TILE_ATTR = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/">CARTO</a>';

  /* ── Helpers ──────────────────────────────────────────── */
  function baseMap(id, center, zoom) {
    var el = document.getElementById(id);
    if (!el) return null;
    var map = L.map(el, { zoomControl: true, scrollWheelZoom: false }).setView(center, zoom);
    L.tileLayer(TILE_URL,  { attribution: TILE_ATTR, maxZoom: 15 }).addTo(map);
    L.tileLayer(LABEL_URL, { maxZoom: 15, pane: 'shadowPane' }).addTo(map);
    return map;
  }

  function parkMarker(map) {
    var icon = L.divIcon({
      html: '<div style="width:22px;height:22px;background:var(--clr-primary,#2e5d33);border:3px solid #fff;border-radius:50%;box-shadow:0 2px 8px rgba(0,0,0,.4)"></div>',
      iconSize: [22, 22], iconAnchor: [11, 11], className: ''
    });
    return L.marker(BAMFIELD, { icon: icon }).addTo(map)
      .bindPopup('<strong>Centennial Park</strong><br>Bamfield, BC');
  }

  function dotMarker(map, pos, label, color) {
    color = color || '#888';
    var icon = L.divIcon({
      html: '<div style="width:12px;height:12px;background:' + color + ';border:2px solid #fff;border-radius:50%;box-shadow:0 1px 4px rgba(0,0,0,.3)"></div>',
      iconSize: [12, 12], iconAnchor: [6, 6], className: ''
    });
    return L.marker(pos, { icon: icon }).addTo(map).bindPopup(label);
  }

  /* densify a polyline for smooth animation */
  function densify(pts, n) {
    var out = [];
    for (var i = 0; i < pts.length - 1; i++) {
      var a = pts[i], b = pts[i + 1];
      for (var t = 0; t < n; t++) {
        var f = t / n;
        out.push([a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f]);
      }
    }
    out.push(pts[pts.length - 1]);
    return out;
  }

  /* animate a polyline drawing in */
  function animateLine(map, poly, fullPts, durMs, state) {
    var pts = densify(fullPts, 14);
    if (prefersReduced) { poly.setLatLngs(pts); return; }
    poly.setLatLngs([pts[0]]);
    var start = null;
    function frame(ts) {
      if (state.cancelled) return;
      if (!start) start = ts;
      var p = Math.min((ts - start) / durMs, 1);
      var eased = p < .5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2;
      var idx = Math.max(1, Math.floor(eased * (pts.length - 1)));
      poly.setLatLngs(pts.slice(0, idx + 1));
      if (p < 1) requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
  }

  /* expand buttons */
  document.querySelectorAll('[data-map-expand]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var wrap = btn.closest('.map-wrap');
      var expanded = wrap.classList.toggle('map-expanded');
      btn.setAttribute('aria-pressed', String(expanded));
      setTimeout(function () {
        window.dispatchEvent(new Event('mapresize'));
      }, 60);
    });
  });
  window.addEventListener('mapresize', function () {
    [driveMap, ferryMap, flyMap].forEach(function (m) { if (m) m.invalidateSize(); });
  });

  /* ═══ DRIVE MAP ══════════════════════════════════════════ */
  var driveMap = null, driveLines = {}, driveState = { cancelled: false };

  var PORT_ALBERNI = [49.234, -124.805];
  var DUNCAN       = [48.778, -123.707];
  var PT_RENFREW   = [48.558, -124.420];

  var routeDefs = {
    /* Franklin Camp / Bamfield Main — goes nearly due south through interior,
       stays well east of the inlet, only curves west in the final stretch */
    alberni: {
      pts: [
        [49.234, -124.805],
        [49.197, -124.802],
        [49.158, -124.808],
        [49.118, -124.828],
        [49.077, -124.860],
        [49.035, -124.895],
        [48.995, -124.930],
        [48.957, -124.965],
        [48.920, -125.000],
        [48.882, -125.040],
        [48.854, -125.078],
        [48.837, -125.108],
        [48.833, -125.133]
      ],
      color: '#2e5d33', weight: 5
    },
    /* Hwy 18 west → Cowichan Lake south shore → logging roads northwest */
    duncan: {
      pts: [
        [48.778, -123.707],
        [48.793, -123.832],
        [48.812, -123.968],
        [48.822, -124.048],
        [48.837, -124.133],
        [48.850, -124.143],
        [48.858, -124.232],
        [48.867, -124.352],
        [48.874, -124.472],
        [48.875, -124.592],
        [48.869, -124.702],
        [48.858, -124.802],
        [48.849, -124.898],
        [48.843, -124.988],
        [48.837, -125.068],
        [48.833, -125.133]
      ],
      color: '#d4830a', weight: 4, dash: '7 5'
    },
    /* Harris Creek / San Juan River logging road north → Nitinat → Bamfield */
    renfrew: {
      pts: [
        [48.558, -124.420],
        [48.590, -124.443],
        [48.625, -124.465],
        [48.660, -124.500],
        [48.698, -124.545],
        [48.737, -124.595],
        [48.773, -124.648],
        [48.808, -124.705],
        [48.833, -124.768],
        [48.845, -124.855],
        [48.846, -124.948],
        [48.841, -125.032],
        [48.835, -125.092],
        [48.833, -125.133]
      ],
      color: '#b8402f', weight: 4, dash: '7 5'
    }
  };

  function initDriveMap() {
    if (driveMap) { driveMap.invalidateSize(); return; }
    driveMap = baseMap('drive-map-leaflet', [49.0, -124.5], 8);
    if (!driveMap) return;

    parkMarker(driveMap);
    dotMarker(driveMap, PORT_ALBERNI, 'Port Alberni — fuel up here', '#555');
    dotMarker(driveMap, DUNCAN,       'Duncan', '#555');
    dotMarker(driveMap, PT_RENFREW,   'Port Renfrew', '#555');

    Object.keys(routeDefs).forEach(function (key) {
      var r = routeDefs[key];
      driveLines[key] = L.polyline([r.pts[0]], {
        color: r.color, weight: r.weight, dashArray: r.dash || null,
        opacity: .9, lineCap: 'round', lineJoin: 'round'
      }).addTo(driveMap);
    });

    activateDriveRoute('alberni');
  }

  function activateDriveRoute(id) {
    if (!driveMap) return;
    driveState.cancelled = true;
    driveState = { cancelled: false };

    document.querySelectorAll('[data-route-id]').forEach(function (b) {
      var active = b.getAttribute('data-route-id') === id;
      b.classList.toggle('is-active', active);
      b.setAttribute('aria-pressed', String(active));
    });
    document.querySelectorAll('[data-route-panel]').forEach(function (p) {
      var active = p.getAttribute('data-route-panel') === id;
      p.classList.toggle('is-active', active);
      p.hidden = !active;
    });

    Object.keys(driveLines).forEach(function (k) {
      var line = driveLines[k], def = routeDefs[k];
      if (k === id) {
        line.setStyle({ opacity: 1, weight: def.weight });
        driveMap.fitBounds(L.latLngBounds(def.pts), { padding: [44, 44] });
        animateLine(driveMap, line, def.pts, 2600, driveState);
      } else {
        line.setLatLngs(densify(def.pts, 14));
        line.setStyle({ opacity: .2 });
      }
    });
  }

  /* route button clicks */
  document.querySelectorAll('[data-route-id]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      activateDriveRoute(btn.getAttribute('data-route-id'));
    });
  });

  /* init drive map on DOMContentLoaded OR IntersectionObserver, whichever fires first */
  (function () {
    var el = document.getElementById('drive-map-leaflet');
    if (!el) return;
    var initialized = false;
    function tryInit() {
      if (initialized) return;
      initialized = true;
      initDriveMap();
    }
    /* try immediately if element already has layout */
    if (el.offsetHeight > 0) { tryInit(); return; }
    /* fall back to IntersectionObserver */
    if ('IntersectionObserver' in window) {
      var io = new IntersectionObserver(function (entries) {
        entries.forEach(function (e) { if (e.isIntersecting) { tryInit(); io.disconnect(); } });
      }, { threshold: 0.01 });
      io.observe(el);
    }
    /* also fire after full page load as a safety net */
    window.addEventListener('load', function () { setTimeout(tryInit, 200); }, { once: true });
  })();

  /* ═══ FERRY MAP ══════════════════════════════════════════ */
  var ferryMap = null;

  function initFerryMap() {
    if (ferryMap) { ferryMap.invalidateSize(); return; }
    ferryMap = baseMap('ferry-map-leaflet', [49.0, -124.97], 9);
    if (!ferryMap) return;

    var stops = [
      { pos: [49.2335,-124.800], label: 'Port Alberni · Harbour Quay — Tue, Thu, Sat departs' },
      { pos: [48.973, -124.931], label: 'Kildonan — midway stop' },
      { pos: BAMFIELD,           label: 'Bamfield · East dock — your stop for the park' }
    ];

    /* Alberni Inlet — traced along the actual fjord channel */
    var linePts = [
      [49.2335,-124.800],
      [49.208, -124.808],
      [49.188, -124.815],
      [49.168, -124.823],
      [49.148, -124.834],
      [49.128, -124.847],
      [49.105, -124.862],
      [49.082, -124.875],
      [49.058, -124.889],
      [49.032, -124.902],
      [49.005, -124.914],
      [48.982, -124.922],
      [48.973, -124.931],
      [48.958, -124.940],
      [48.940, -124.952],
      [48.918, -124.970],
      [48.898, -124.993],
      [48.878, -125.022],
      [48.862, -125.058],
      [48.850, -125.092],
      [48.840, -125.113],
      [48.833, -125.133]
    ];
    var poly = L.polyline([linePts[0]], { color: '#1a5580', weight: 4, opacity: .9, lineCap: 'round' }).addTo(ferryMap);
    stops.forEach(function (s, i) {
      dotMarker(ferryMap, s.pos, s.label, i === stops.length - 1 ? '#2e5d33' : '#1a5580');
    });
    ferryMap.fitBounds(L.latLngBounds(linePts), { padding: [44, 44] });
    animateLine(ferryMap, poly, linePts, 3000, { cancelled: false });
  }

  /* ═══ FLY MAP ════════════════════════════════════════════ */
  var flyMap = null;

  function initFlyMap() {
    if (flyMap) { flyMap.invalidateSize(); return; }
    flyMap = baseMap('fly-map-leaflet', [49.05, -124.3], 7);
    if (!flyMap) return;

    var origins = [
      { pos: [49.290,-123.115], label: 'Vancouver Harbour' },
      { pos: [48.423,-123.371], label: 'Victoria Harbour' },
      { pos: [49.166,-123.933], label: 'Nanaimo Harbour' },
      { pos: [49.153,-125.905], label: 'Tofino Harbour' }
    ];

    parkMarker(flyMap);
    origins.forEach(function (o, i) {
      dotMarker(flyMap, o.pos, o.label, '#7a4000');
      var poly = L.polyline([o.pos], { color: '#a06030', weight: 2, dashArray: '6 6', opacity: .6 }).addTo(flyMap);
      setTimeout(function () {
        animateLine(flyMap, poly, [o.pos, BAMFIELD], 2000, { cancelled: false });
      }, i * 400);
    });
    flyMap.fitBounds(L.latLngBounds(origins.map(function (o) { return o.pos; }).concat([BAMFIELD])), { padding: [36, 36] });
  }

  /* init ferry/fly on tab switch */
  window.addEventListener('travelpane', function (e) {
    setTimeout(function () {
      if (e.detail === 'travel-ferry') initFerryMap();
      if (e.detail === 'travel-fly')   initFlyMap();
      if (e.detail === 'travel-drive') initDriveMap();
    }, 80);
  });

})();
