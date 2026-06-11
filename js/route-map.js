/* route-map.js — immersive animated travel maps
   Routes draw themselves in; a little vehicle travels the line. */

(function () {
  'use strict';
  if (typeof L === 'undefined') return;

  var prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  var BAMFIELD  = [48.833, -125.133];
  var TILE_URL  = 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager_nolabels/{z}/{x}/{y}{r}.png';
  var LABEL_URL = 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager_only_labels/{z}/{x}/{y}{r}.png';
  var TILE_ATTR = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/">CARTO</a>';

  function baseMap(id, center, zoom) {
    var map = L.map(id, { zoomControl: true, scrollWheelZoom: false }).setView(center, zoom);
    L.tileLayer(TILE_URL,  { attribution: TILE_ATTR, maxZoom: 15 }).addTo(map);
    L.tileLayer(LABEL_URL, { maxZoom: 15, pane: 'shadowPane' }).addTo(map);
    return map;
  }

  function parkMarker(map) {
    var icon = L.divIcon({
      html: '<div class="pulse-marker vehicle-marker">🏕️</div>',
      iconSize: [28, 28], iconAnchor: [14, 22], className: ''
    });
    return L.marker(BAMFIELD, { icon: icon }).addTo(map)
      .bindPopup('<strong>Centennial Park</strong><br>You made it. Welcome to Bamfield.');
  }

  /* densify a polyline so animation is smooth */
  function densify(latlngs, perSeg) {
    var out = [];
    for (var i = 0; i < latlngs.length - 1; i++) {
      var a = latlngs[i], b = latlngs[i + 1];
      for (var t = 0; t < perSeg; t++) {
        var f = t / perSeg;
        out.push([a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f]);
      }
    }
    out.push(latlngs[latlngs.length - 1]);
    return out;
  }

  /* animate a route drawing in + vehicle traveling along it */
  function animateRoute(map, line, vehicleEmoji, durMs, state) {
    var pts = densify(line.fullPts, 14);
    if (prefersReduced) {
      line.poly.setLatLngs(pts);
      return null;
    }
    line.poly.setLatLngs([pts[0]]);
    var vIcon = L.divIcon({
      html: '<div class="vehicle-marker">' + vehicleEmoji + '</div>',
      iconSize: [24, 24], iconAnchor: [12, 12], className: ''
    });
    var vehicle = L.marker(pts[0], { icon: vIcon, interactive: false }).addTo(map);
    var start = null, raf;
    function frame(ts) {
      if (state.cancelled) { map.removeLayer(vehicle); return; }
      if (!start) start = ts;
      var p = Math.min((ts - start) / durMs, 1);
      var eased = p < .5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2;
      var idx = Math.max(1, Math.floor(eased * (pts.length - 1)));
      line.poly.setLatLngs(pts.slice(0, idx + 1));
      vehicle.setLatLng(pts[idx]);
      if (p < 1) { raf = requestAnimationFrame(frame); }
      else { setTimeout(function () { if (!state.cancelled) map.removeLayer(vehicle); }, 1200); }
    }
    raf = requestAnimationFrame(frame);
    return vehicle;
  }

  function initWhenVisible(el, cb) {
    if (!el) return;
    if ('IntersectionObserver' in window) {
      var io = new IntersectionObserver(function (entries) {
        entries.forEach(function (e) { if (e.isIntersecting) { cb(); io.disconnect(); } });
      }, { threshold: 0.1 });
      io.observe(el);
    } else { cb(); }
  }

  /* expand buttons */
  document.querySelectorAll('[data-map-expand]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var wrap = btn.closest('.map-wrap');
      var expanded = wrap.classList.toggle('map-expanded');
      btn.setAttribute('aria-pressed', String(expanded));
      window.dispatchEvent(new Event('mapresize'));
    });
  });

  /* ═══ DRIVE ═════════════════════════════════════════════ */
  var driveMapEl = document.getElementById('drive-map-leaflet');
  var driveMap = null;
  var drivePolys = {}, driveAnimState = { cancelled: false };

  var PORT_ALBERNI = [49.234, -124.805];
  var DUNCAN       = [48.778, -123.707];
  var YOUBOU       = [48.850, -124.143];
  var PT_RENFREW   = [48.558, -124.420];
  var NITINAT      = [48.940, -124.660];

  var driveRoutes = {
    alberni: {
      pts: [PORT_ALBERNI, [49.18, -124.92], [49.08, -125.01], [48.98, -125.05], [48.92, -125.10], BAMFIELD],
      color: '#2e5d33', weight: 5
    },
    duncan: {
      pts: [DUNCAN, [48.82, -123.92], YOUBOU, [48.87, -124.35], [48.88, -124.55], [48.87, -124.82], BAMFIELD],
      color: '#d4830a', weight: 4, dash: '7 5'
    },
    renfrew: {
      pts: [PT_RENFREW, [48.62, -124.55], NITINAT, [48.90, -124.88], BAMFIELD],
      color: '#b8402f', weight: 4, dash: '7 5'
    }
  };

  function initDriveMap() {
    if (driveMap || !driveMapEl) return;
    driveMap = baseMap('drive-map-leaflet', [49.0, -124.5], 8);
    parkMarker(driveMap);

    Object.keys(driveRoutes).forEach(function (key) {
      var r = driveRoutes[key];
      drivePolys[key] = {
        fullPts: r.pts,
        poly: L.polyline([r.pts[0]], {
          color: r.color, weight: r.weight, dashArray: r.dash || null, opacity: .85,
          lineCap: 'round', lineJoin: 'round'
        }).addTo(driveMap)
      };
    });

    var dotIcon = L.divIcon({ html: '<div class="vehicle-marker" style="font-size:16px">📍</div>', iconSize: [16,16], iconAnchor: [8,14], className: '' });
    L.marker(PORT_ALBERNI, { icon: dotIcon }).addTo(driveMap).bindPopup('Port Alberni — fuel up here');
    L.marker(DUNCAN,       { icon: dotIcon }).addTo(driveMap).bindPopup('Duncan');
    L.marker(PT_RENFREW,   { icon: dotIcon }).addTo(driveMap).bindPopup('Port Renfrew');

    activateDriveRoute('alberni');
  }

  function activateDriveRoute(id) {
    if (!driveMap) return;
    driveAnimState.cancelled = true;
    driveAnimState = { cancelled: false };

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

    Object.keys(drivePolys).forEach(function (k) {
      var line = drivePolys[k];
      if (k === id) {
        line.poly.setStyle({ opacity: 1 });
        driveMap.fitBounds(L.latLngBounds(line.fullPts), { padding: [44, 44] });
        animateRoute(driveMap, line, '🚗', 2600, driveAnimState);
      } else {
        line.poly.setLatLngs(densify(line.fullPts, 14));
        line.poly.setStyle({ opacity: .22 });
      }
    });
  }

  document.querySelectorAll('[data-route-id]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      activateDriveRoute(btn.getAttribute('data-route-id'));
    });
  });

  initWhenVisible(driveMapEl, initDriveMap);

  /* ═══ FERRY ═════════════════════════════════════════════ */
  var ferryMap = null, ferryAnimState = { cancelled: false };
  function initFerryMap() {
    if (ferryMap) return;
    var el = document.getElementById('ferry-map-leaflet');
    if (!el || el.offsetParent === null) return;
    ferryMap = baseMap('ferry-map-leaflet', [49.0, -124.97], 9);
    parkMarker(ferryMap);

    var stops = [
      { pos: [49.2335, -124.800], label: 'Port Alberni · Harbour Quay', info: 'Departs Tue, Thu, Sat + summer extras.' },
      { pos: [48.973, -124.931],  label: 'Kildonan',                    info: 'Midway stop on the inlet.' },
      { pos: BAMFIELD,            label: 'Bamfield · East dock',        info: 'Your stop for the park.' }
    ];

    var line = {
      fullPts: stops.map(function (s) { return s.pos; }),
      poly: L.polyline([stops[0].pos], { color: '#1a5580', weight: 4, opacity: .9, lineCap: 'round' }).addTo(ferryMap)
    };

    var dotIcon = L.divIcon({ html: '<div class="vehicle-marker" style="font-size:16px">⚓</div>', iconSize: [16,16], iconAnchor: [8,8], className: '' });
    stops.forEach(function (s) {
      L.marker(s.pos, { icon: dotIcon }).addTo(ferryMap)
        .bindPopup('<strong>' + s.label + '</strong><br>' + s.info);
    });

    ferryMap.fitBounds(L.latLngBounds(line.fullPts), { padding: [44, 44] });
    animateRoute(ferryMap, line, '⛴️', 3400, ferryAnimState);
  }

  /* ═══ FLY ═══════════════════════════════════════════════ */
  var flyMap = null;
  function initFlyMap() {
    if (flyMap) return;
    var el = document.getElementById('fly-map-leaflet');
    if (!el || el.offsetParent === null) return;
    flyMap = baseMap('fly-map-leaflet', [49.05, -124.3], 7);
    parkMarker(flyMap);

    var origins = [
      { pos: [49.290, -123.115], label: 'Vancouver Harbour' },
      { pos: [48.423, -123.371], label: 'Victoria Harbour' },
      { pos: [49.166, -123.933], label: 'Nanaimo Harbour' },
      { pos: [49.153, -125.905], label: 'Tofino Harbour' }
    ];

    var dotIcon = L.divIcon({ html: '<div class="vehicle-marker" style="font-size:16px">🛬</div>', iconSize: [16,16], iconAnchor: [8,8], className: '' });
    origins.forEach(function (o, i) {
      L.marker(o.pos, { icon: dotIcon }).addTo(flyMap).bindPopup(o.label);
      var line = {
        fullPts: [o.pos, BAMFIELD],
        poly: L.polyline([o.pos], { color: '#7a4000', weight: 2, dashArray: '6 6', opacity: .55 }).addTo(flyMap)
      };
      /* stagger the flight path animations */
      setTimeout(function () {
        animateRoute(flyMap, line, '🛩️', 2200, { cancelled: false });
      }, i * 500);
    });

    flyMap.fitBounds(L.latLngBounds(origins.map(function (o) { return o.pos; }).concat([BAMFIELD])), { padding: [36, 36] });
  }

  /* init maps when their tab opens */
  window.addEventListener('travelpane', function (e) {
    setTimeout(function () {
      if (e.detail === 'travel-ferry') initFerryMap();
      if (e.detail === 'travel-fly')   initFlyMap();
      [driveMap, ferryMap, flyMap].forEach(function (m) { if (m) m.invalidateSize(); });
    }, 60);
  });
  window.addEventListener('mapresize', function () {
    setTimeout(function () {
      [driveMap, ferryMap, flyMap].forEach(function (m) { if (m) m.invalidateSize(); });
    }, 60);
  });

})();
