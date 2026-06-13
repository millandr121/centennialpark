/* route-map.js — drive routes via OSRM, ferry via JSON + fallback, fly arcs */

(function () {
  'use strict';
  if (typeof L === 'undefined') return;

  var prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* densify a polyline so short segments animate smoothly */
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

  /* animate a polyline drawing itself in */
  function animateLine(poly, pts, durMs, state) {
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

  /* ── Constants ──────────────────────────────────────────── */
  var PARK            = [48.8276, -125.1308];
  var BAMFIELD_INLET  = [48.826,  -125.135];
  var PORT_ALBERNI_PT = [49.234,  -124.805];

  var FERRY_STOPS = {
    alberni: { pos: [49.23538, -124.81485], label: 'Port Alberni · Lady Rose Marine — departs Tue, Thu, Sat' },
    west:    { pos: [48.8355,  -125.1392],  label: 'West Bamfield — first stop' },
    east:    { pos: [48.8259,  -125.1367],  label: 'East Bamfield (Park Exit) — your stop' }
  };

  /*
   * Alberni Inlet GPS trace — corrected N→S fjord path.
   * Upper section (Port Alberni → Kildonan): mostly south, gentle west lean.
   * Lower section (Kildonan → Bamfield): swings more SW as inlet opens to Barkley Sound.
   */
  var FERRY_INLINE = [
    [49.235, -124.815],
    [49.205, -124.822],
    [49.175, -124.829],
    [49.145, -124.838],
    [49.115, -124.849],
    [49.085, -124.862],
    [49.055, -124.876],
    [49.025, -124.891],
    [48.997, -124.907],
    [48.973, -124.921],  /* Kildonan */
    [48.950, -124.937],
    [48.927, -124.956],
    [48.905, -124.978],
    [48.883, -125.006],
    [48.864, -125.040],
    [48.848, -125.077],
    [48.836, -125.114],
    [48.8355,-125.1392], /* West dock */
    [48.831, -125.138],
    [48.8285,-125.1372],
    [48.8259,-125.1367]  /* East dock */
  ];

  var FLY_DEPARTURES = [
    { pos: [48.4222, -123.3693], label: 'Victoria Harbour' },
    { pos: [49.1645, -123.936],  label: 'Nanaimo Harbour' },
    { pos: [49.1939, -123.184],  label: 'Vancouver (YVR) Harbour' },
    { pos: [49.2896, -123.1162], label: 'Vancouver Downtown Harbour' }
  ];

  /*
   * OSRM waypoints [lng, lat].
   *
   * alberni  — direct Port Alberni → Bamfield chip-seal.
   * duncan   — Lake Cowichan town → Youbou area → Bamfield via logging road
   *            (OSRM may not have the logging road; result shown is indicative).
   * renfrew  — SAFE route: Port Renfrew → Lake Cowichan → Port Alberni → Bamfield.
   *            Chip-seal / highway all the way; avoids Youbou logging road entirely.
   */
  var DRIVE_OSRM = {
    alberni: [[-124.8149, 49.2354], [-125.1308, 48.8276]],
    duncan:  [[-124.048,  48.822],  [-124.143,  48.850],  [-125.1308, 48.8276]],
    renfrew: [[-124.421,  48.554],  [-124.048,  48.822],  [-124.805, 49.234], [-125.1308, 48.8276]]
  };

  var ROUTE_STYLE = {
    alberni: { color: '#2e5d33', weight: 5, opacity: 0.95 },
    duncan:  { color: '#d4830a', weight: 4, opacity: 0.9, dashArray: '7 5' },
    renfrew: { color: '#7b5ea7', weight: 4, opacity: 0.9 }
  };

  /* gas bars on the routes */
  var GAS_BARS = [
    {
      pos:   PORT_ALBERNI_PT,
      label: '<strong>Port Alberni</strong> — fill up here. This is truly the last gas stop before Bamfield.'
    },
    {
      pos:   [48.827, -125.130],
      label: "<strong>Ostrom's Gas Bar, Bamfield</strong><br>Open 8 am–8 pm daily in summer. Hours and days reduce significantly in fall, winter, and spring."
    },
    {
      pos:   [48.822, -124.048],
      label: '<strong>Lake Cowichan</strong> — fuel available in town.'
    },
    {
      pos:   [48.850, -124.143],
      label: '<strong>Youbou</strong> — small gas bar, limited hours. Do not rely on it.'
    }
  ];

  /* ── Tile layer with OSM → CARTO fallback ─────────────── */
  function addTiles(map) {
    var osm = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a>'
    });
    var carto = L.tileLayer(
      'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png',
      { subdomains: 'abcd', maxZoom: 19, attribution: '&copy; OSM &copy; CARTO' }
    );
    var errors = 0;
    var layer = osm.addTo(map);
    layer.on('tileerror', function () {
      errors++;
      if (errors > 5 && map.hasLayer(layer)) { map.removeLayer(layer); carto.addTo(map); }
    });
  }

  /* ── Markers ────────────────────────────────────────────── */
  function parkMarker(map) {
    var icon = L.divIcon({
      html: '<div style="width:22px;height:22px;background:var(--clr-primary,#2e5d33);border:3px solid #fff;border-radius:50%;box-shadow:0 2px 8px rgba(0,0,0,.4)"></div>',
      iconSize: [22, 22], iconAnchor: [11, 11], className: ''
    });
    return L.marker(PARK, { icon: icon }).addTo(map)
      .bindPopup('<strong>Centennial Park</strong><br>Bamfield, BC');
  }

  function dotMarker(map, pos, label, color) {
    var icon = L.divIcon({
      html: '<div style="width:12px;height:12px;background:' + (color || '#888') + ';border:2px solid #fff;border-radius:50%;box-shadow:0 1px 4px rgba(0,0,0,.3)"></div>',
      iconSize: [12, 12], iconAnchor: [6, 6], className: ''
    });
    return L.marker(pos, { icon: icon }).addTo(map).bindPopup(label);
  }

  function gasMarker(map, pos, label) {
    var icon = L.divIcon({
      html: '<div style="width:20px;height:20px;background:#f5a623;border:2px solid #fff;border-radius:4px;display:flex;align-items:center;justify-content:center;font-size:11px;box-shadow:0 1px 5px rgba(0,0,0,.35);font-weight:700;color:#fff;line-height:1">G</div>',
      iconSize: [20, 20], iconAnchor: [10, 10], className: ''
    });
    return L.marker(pos, { icon: icon, zIndexOffset: 300 }).addTo(map).bindPopup(label);
  }

  function warningMarker(map, pos, label) {
    var icon = L.divIcon({
      html: '<div style="width:22px;height:22px;background:#c0392b;border:2px solid #fff;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:900;color:#fff;box-shadow:0 1px 5px rgba(0,0,0,.4);line-height:1">!</div>',
      iconSize: [22, 22], iconAnchor: [11, 11], className: ''
    });
    return L.marker(pos, { icon: icon, zIndexOffset: 400 }).addTo(map).bindPopup(label);
  }

  function chipSealMarker(map, pos) {
    var icon = L.divIcon({
      html: '<div style="width:22px;height:22px;background:#fff;border:2.5px solid #d4830a;border-radius:4px;display:flex;align-items:center;justify-content:center;font-size:9px;font-weight:900;color:#d4830a;box-shadow:0 1px 5px rgba(0,0,0,.35);line-height:1;letter-spacing:-.5px">CS</div>',
      iconSize: [22, 22], iconAnchor: [11, 11], className: ''
    });
    return L.marker(pos, { icon: icon, zIndexOffset: 350 }).addTo(map)
      .bindPopup('<strong>Chip-seal ends here</strong><br>Bamfield Main intersection (N Shore Rd).<br>Active logging road begins — rough surface, industrial traffic.');
  }

  /* ── Arc curve for fly routes ───────────────────────────── */
  function arcPoints(from, to, steps) {
    var mid = [(from[0] + to[0]) / 2, (from[1] + to[1]) / 2];
    var dx = to[1] - from[1], dy = to[0] - from[0];
    var len = Math.hypot(dx, dy) || 1;
    mid[0] += (dx / len) * 0.12;
    mid[1] -= (dy / len) * 0.12;
    var pts = [];
    for (var i = 0; i <= steps; i++) {
      var t = i / steps, u = 1 - t;
      pts.push([
        u * u * from[0] + 2 * u * t * mid[0] + t * t * to[0],
        u * u * from[1] + 2 * u * t * mid[1] + t * t * to[1]
      ]);
    }
    return pts;
  }

  /* ── OSRM fetch (real road geometry) ────────────────────── */
  function fetchOsrmRoute(wps, cb) {
    var url = 'https://router.project-osrm.org/route/v1/driving/' +
      wps.map(function (w) { return w[0] + ',' + w[1]; }).join(';') +
      '?overview=full&geometries=geojson';
    fetch(url)
      .then(function (r) { return r.json(); })
      .then(function (d) {
        if (d.code !== 'Ok' || !d.routes || !d.routes[0]) { cb(null); return; }
        cb(d.routes[0].geometry.coordinates.map(function (c) { return [c[1], c[0]]; }));
      })
      .catch(function () { cb(null); });
  }

  /* ── Expand buttons ─────────────────────────────────────── */
  document.querySelectorAll('[data-map-expand]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var wrap = btn.closest('.map-wrap');
      var expanded = wrap.classList.toggle('map-expanded');
      btn.setAttribute('aria-pressed', String(expanded));
      setTimeout(function () {
        [driveMap, ferryMap, flyMap].forEach(function (m) { if (m) m.invalidateSize(); });
      }, 60);
    });
  });

  /* ═══ DRIVE MAP ══════════════════════════════════════════ */
  var driveMap = null, driveLayers = {}, drivePoints = {};
  var driveAnimState = { cancelled: false };
  var chipSealMark = null;

  function updateDrivePanels(id) {
    document.querySelectorAll('[data-route-id]').forEach(function (b) {
      var on = b.getAttribute('data-route-id') === id;
      b.classList.toggle('is-active', on);
      b.setAttribute('aria-pressed', String(on));
    });
    document.querySelectorAll('[data-route-panel]').forEach(function (p) {
      var on = p.getAttribute('data-route-panel') === id;
      p.classList.toggle('is-active', on);
      p.hidden = !on;
    });
  }

  function selectRoute(id) {
    driveAnimState.cancelled = true;
    driveAnimState = { cancelled: false };

    Object.keys(driveLayers).forEach(function (k) {
      var line = driveLayers[k], pts = drivePoints[k];
      if (!line || !driveMap || !pts) return;
      var on = k === id;
      if (on) {
        line.setStyle({ opacity: 1, weight: ROUTE_STYLE[k].weight || 4 });
        line.bringToFront();
        driveMap.fitBounds(line.getBounds(), { padding: [44, 44], maxZoom: 11 });
        animateLine(line, pts, 2600, driveAnimState);
      } else {
        line.setLatLngs(pts);
        line.setStyle({ opacity: 0.18, weight: 3 });
      }
    });

    /* chip-seal marker only visible on logging road route */
    if (chipSealMark) {
      if (id === 'duncan') chipSealMark.addTo(driveMap);
      else if (driveMap.hasLayer(chipSealMark)) driveMap.removeLayer(chipSealMark);
    }

    updateDrivePanels(id);
  }

  function initDriveMap() {
    if (driveMap) { driveMap.invalidateSize(); return; }
    var el = document.getElementById('drive-map-leaflet');
    if (!el) return;

    driveMap = L.map(el, { scrollWheelZoom: false, dragging: true, zoomControl: true });
    addTiles(driveMap);
    parkMarker(driveMap);
    driveMap.setView([49.0, -124.3], 8);

    /* gas bar markers — always visible */
    GAS_BARS.forEach(function (g) { gasMarker(driveMap, g.pos, g.label); });

    /* logging road danger marker at Youbou */
    warningMarker(driveMap, [48.850, -124.143],
      '<strong>Logging road begins at Youbou</strong><br>' +
      'Active industrial road — very rough, not maintained on a schedule.<br>' +
      'Speeds as low as 10–20 km/h. <strong>Not recommended</strong> for RVs, campers, trailers, or first-timers.');

    /* chip-seal intersection marker — only shown on logging road route */
    chipSealMark = chipSealMarker(driveMap, [48.843, -124.876]);
    driveMap.removeLayer(chipSealMark);

    /* loading chip */
    var chip = document.createElement('div');
    chip.style.cssText = 'position:absolute;top:8px;right:8px;background:rgba(255,255,255,.92);' +
      'padding:4px 10px;border-radius:4px;font-size:.8rem;z-index:1000;pointer-events:none;' +
      'box-shadow:0 1px 4px rgba(0,0,0,.15)';
    chip.textContent = 'Loading routes…';
    el.appendChild(chip);

    var pending = Object.keys(DRIVE_OSRM).length;
    function onRouteLoad(id, latlngs) {
      pending--;
      if (latlngs && latlngs.length > 1 && driveMap) {
        drivePoints[id] = latlngs;
        driveLayers[id] = L.polyline([latlngs[0]], ROUTE_STYLE[id]).addTo(driveMap);
        driveLayers[id].on('click', function () { selectRoute(id); });
      }
      if (pending === 0) {
        if (chip.parentNode) chip.parentNode.removeChild(chip);
        var ids = Object.keys(driveLayers);
        if (ids.length) {
          var group = L.featureGroup(ids.map(function (k) {
            driveLayers[k].setLatLngs(drivePoints[k]);
            return driveLayers[k];
          }));
          driveMap.fitBounds(group.getBounds(), { padding: [40, 40], maxZoom: 9 });
          selectRoute('alberni');
        }
        driveMap.invalidateSize();
      }
    }

    Object.keys(DRIVE_OSRM).forEach(function (id) {
      fetchOsrmRoute(DRIVE_OSRM[id], function (ll) { onRouteLoad(id, ll); });
    });

    /* route button clicks */
    document.querySelectorAll('[data-route-id]').forEach(function (btn) {
      btn.removeEventListener('click', btn._routeHandler);
      btn._routeHandler = function () { selectRoute(btn.getAttribute('data-route-id')); };
      btn.addEventListener('click', btn._routeHandler);
    });

    driveMap.invalidateSize();
  }

  /* ═══ FERRY MAP ══════════════════════════════════════════ */
  var ferryMap = null;

  function initFerryMap() {
    if (ferryMap) { ferryMap.invalidateSize(); return; }
    var el = document.getElementById('ferry-map-leaflet');
    if (!el) return;

    ferryMap = L.map(el, { scrollWheelZoom: false, dragging: true, zoomControl: true });
    addTiles(ferryMap);
    parkMarker(ferryMap);

    Object.keys(FERRY_STOPS).forEach(function (k) {
      var s = FERRY_STOPS[k];
      dotMarker(ferryMap, s.pos, s.label, k === 'east' ? '#2e5d33' : '#1a5580');
    });

    function drawFerryLine(pts) {
      if (!ferryMap) return;
      var dense = densify(pts, 8);
      var poly = L.polyline([dense[0]], {
        color: '#1e6aad', weight: 5, opacity: 0.92,
        dashArray: '10 8', lineCap: 'round', lineJoin: 'round'
      }).addTo(ferryMap);
      ferryMap.fitBounds(L.latLngBounds(pts), { padding: [48, 48], maxZoom: 11 });
      animateLine(poly, dense, 3200, { cancelled: false });
      ferryMap.invalidateSize();
    }

    fetch('/js/ferry-route.json')
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (data) {
        drawFerryLine((Array.isArray(data) && data.length > 4) ? data : FERRY_INLINE);
      })
      .catch(function () { drawFerryLine(FERRY_INLINE); });

    ferryMap.fitBounds(
      L.latLngBounds([FERRY_STOPS.alberni.pos, FERRY_STOPS.west.pos, FERRY_STOPS.east.pos, PARK]),
      { padding: [48, 48], maxZoom: 11 }
    );
    ferryMap.invalidateSize();
  }

  /* ═══ FLY MAP ════════════════════════════════════════════ */
  var flyMap = null;

  function initFlyMap() {
    if (flyMap) { flyMap.invalidateSize(); return; }
    var el = document.getElementById('fly-map-leaflet');
    if (!el) return;

    flyMap = L.map(el, { scrollWheelZoom: false, dragging: true, zoomControl: true });
    addTiles(flyMap);

    var dotIcon = L.divIcon({
      html: '<div style="width:14px;height:14px;background:#7a4000;border:2px solid #fff;border-radius:50%;box-shadow:0 1px 4px rgba(0,0,0,.3)"></div>',
      iconSize: [14, 14], iconAnchor: [7, 7], className: ''
    });
    L.marker(BAMFIELD_INLET, { icon: dotIcon }).addTo(flyMap)
      .bindPopup('Bamfield Inlet — floatplane landing');

    FLY_DEPARTURES.forEach(function (dep, i) {
      L.marker(dep.pos, { icon: dotIcon }).addTo(flyMap).bindPopup(dep.label);
      var pts = arcPoints(dep.pos, BAMFIELD_INLET, 24);
      var poly = L.polyline([pts[0]], {
        color: '#7b9e8a', weight: 4, opacity: 0.85, dashArray: '9 7', lineCap: 'round'
      }).addTo(flyMap);
      setTimeout(function () {
        animateLine(poly, pts, 1800, { cancelled: false });
      }, i * 350);
    });

    var bounds = L.latLngBounds([BAMFIELD_INLET]);
    FLY_DEPARTURES.forEach(function (d) { bounds.extend(d.pos); });
    flyMap.fitBounds(bounds, { padding: [52, 52], maxZoom: 9 });
    flyMap.invalidateSize();
  }

  /* ── Tab switch ─────────────────────────────────────────── */
  window.addEventListener('travelpane', function (e) {
    setTimeout(function () {
      if (e.detail === 'travel-drive') initDriveMap();
      if (e.detail === 'travel-ferry') initFerryMap();
      if (e.detail === 'travel-fly')   initFlyMap();
    }, 80);
  });

  /* ── Init drive map when section scrolls into view ──────── */
  (function () {
    var el = document.getElementById('drive-map-leaflet');
    if (!el) return;
    var done = false;
    function tryInit() { if (done) return; done = true; initDriveMap(); }
    /* use IntersectionObserver so animation fires as user scrolls to the section */
    if ('IntersectionObserver' in window) {
      var io = new IntersectionObserver(function (entries) {
        entries.forEach(function (e) { if (e.isIntersecting) { tryInit(); io.disconnect(); } });
      }, { threshold: 0.1 });
      io.observe(el);
    }
    /* fallback: window load */
    window.addEventListener('load', function () { setTimeout(tryInit, 400); }, { once: true });
  })();

})();
