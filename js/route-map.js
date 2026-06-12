/* route-map.js — drive routes via OSRM, ferry via JSON + fallback, fly arcs */

(function () {
  'use strict';
  if (typeof L === 'undefined') return;

  /* ── Constants ──────────────────────────────────────────── */
  var PARK           = [48.8276, -125.1308];
  var BAMFIELD_INLET = [48.826,  -125.135];

  var FERRY_STOPS = {
    alberni: { pos: [49.23538, -124.81485], label: 'Port Alberni · Lady Rose Marine — departs Tue, Thu, Sat' },
    west:    { pos: [48.8355,  -125.1392],  label: 'West Bamfield — first stop' },
    east:    { pos: [48.8259,  -125.1367],  label: 'East Bamfield (Park Exit) — your stop' }
  };

  /* Alberni Inlet GPS trace — tight N→S fjord path */
  var FERRY_INLINE = [
    [49.23538,-124.81485],
    [49.208,  -124.8225],
    [49.180,  -124.8305],
    [49.152,  -124.8373],
    [49.123,  -124.8436],
    [49.093,  -124.8497],
    [49.062,  -124.8556],
    [49.030,  -124.8615],
    [48.998,  -124.8676],
    [48.966,  -124.8738],
    [48.973,  -124.931],   /* Kildonan */
    [48.950,  -124.9395],
    [48.924,  -124.9487],
    [48.898,  -124.9588],
    [48.871,  -124.9703],
    [48.854,  -124.9845],
    [48.842,  -125.0012],
    [48.834,  -125.0195],
    [48.831,  -125.0394],
    [48.831,  -125.0598],
    [48.833,  -125.0802],
    [48.836,  -125.1005],
    [48.836,  -125.120],
    [48.8355, -125.1392],  /* West dock */
    [48.831,  -125.138],
    [48.8285, -125.1372],
    [48.8259, -125.1367]   /* East dock */
  ];

  var FLY_DEPARTURES = [
    { pos: [48.4222, -123.3693], label: 'Victoria Harbour' },
    { pos: [49.1645, -123.936],  label: 'Nanaimo Harbour' },
    { pos: [49.1939, -123.184],  label: 'Vancouver (YVR) Harbour' },
    { pos: [49.2896, -123.1162], label: 'Vancouver Downtown Harbour' }
  ];

  /* OSRM waypoints [lng, lat] — engine returns real road geometry */
  var DRIVE_OSRM = {
    alberni: [[-124.8149, 49.2354], [-125.1308, 48.8276]],
    duncan:  [[-123.707, 48.779], [-124.178, 48.868], [-125.1308, 48.8276]],
    renfrew: [[-124.421, 48.554], [-125.1308, 48.8276]]
  };

  var ROUTE_STYLE = {
    alberni: { color: '#2e5d33', weight: 5, opacity: 0.95 },
    duncan:  { color: '#d4830a', weight: 4, opacity: 0.9, dashArray: '7 5' },
    renfrew: { color: '#b8402f', weight: 4, opacity: 0.9, dashArray: '7 5' }
  };

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
  var driveMap = null, driveLayers = {};

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
    Object.keys(driveLayers).forEach(function (k) {
      var line = driveLayers[k];
      if (!line || !driveMap) return;
      var on = k === id;
      line.setStyle({ opacity: on ? 1 : 0.25, weight: on ? (k === 'alberni' ? 5 : 4) : 3 });
      if (on) {
        line.bringToFront();
        driveMap.fitBounds(line.getBounds(), { padding: [44, 44], maxZoom: 11 });
      }
    });
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
        driveLayers[id] = L.polyline(latlngs, ROUTE_STYLE[id]).addTo(driveMap);
        driveLayers[id].on('click', function () { selectRoute(id); });
      }
      if (pending === 0) {
        if (chip.parentNode) chip.parentNode.removeChild(chip);
        var ids = Object.keys(driveLayers);
        if (ids.length) {
          var group = L.featureGroup(ids.map(function (k) { return driveLayers[k]; }));
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

    /* try JSON first, fall back to inline */
    function drawFerryLine(pts) {
      if (!ferryMap) return;
      L.polyline(pts, {
        color: '#1e6aad', weight: 5, opacity: 0.92,
        dashArray: '10 8', lineCap: 'round', lineJoin: 'round'
      }).addTo(ferryMap);
      ferryMap.fitBounds(L.latLngBounds(pts), { padding: [48, 48], maxZoom: 11 });
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

    FLY_DEPARTURES.forEach(function (dep) {
      L.marker(dep.pos, { icon: dotIcon }).addTo(flyMap).bindPopup(dep.label);
      L.polyline(arcPoints(dep.pos, BAMFIELD_INLET, 24), {
        color: '#7b9e8a', weight: 4, opacity: 0.85, dashArray: '9 7', lineCap: 'round'
      }).addTo(flyMap);
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

  /* ── Init drive map on page load (it's the default tab) ── */
  (function () {
    var el = document.getElementById('drive-map-leaflet');
    if (!el) return;
    var done = false;
    function tryInit() { if (done) return; done = true; initDriveMap(); }
    if (el.offsetHeight > 0) { tryInit(); return; }
    if ('IntersectionObserver' in window) {
      var io = new IntersectionObserver(function (entries) {
        entries.forEach(function (e) { if (e.isIntersecting) { tryInit(); io.disconnect(); } });
      }, { threshold: 0.01 });
      io.observe(el);
    }
    window.addEventListener('load', function () { setTimeout(tryInit, 200); }, { once: true });
  })();

})();
