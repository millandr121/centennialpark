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

  /* nearest vertex on a polyline to a target [lat,lng] — keeps markers on the road */
  function nearestOnRoute(pts, target) {
    var best = pts[0], bd = Infinity;
    for (var i = 0; i < pts.length; i++) {
      var d = Math.hypot(pts[i][0] - target[0], pts[i][1] - target[1]);
      if (d < bd) { bd = d; best = pts[i]; }
    }
    return best;
  }

  /* ── Constants ──────────────────────────────────────────── */
  var PARK            = [48.8276, -125.1308];
  var BAMFIELD_INLET  = [48.826,  -125.135];
  var PORT_ALBERNI_PT = [49.246,  -124.798];   /* Co-op, 3820 10th Ave */

  var FERRY_STOPS = {
    alberni: { pos: [49.23538, -124.81485], label: 'Port Alberni · Lady Rose Marine — departs Tue, Thu, Sat' },
    west:    { pos: [48.8355,  -125.1392],  label: 'West Bamfield — first stop' },
    east:    { pos: [48.8259,  -125.1367],  label: 'East Bamfield (Park Exit) — your stop' }
  };

  /*
   * Alberni Inlet GPS trace — N→S down fjord then SW through Barkley Sound.
   * Upper section stays in the narrow inlet channel.
   * Lower section passes east of Tzartus Island before swinging west to Bamfield.
   * Fetched at runtime via Overpass if possible; this is the offline fallback.
   */
  var FERRY_INLINE = [
    [49.235, -124.815],   /* Port Alberni dock */
    [49.208, -124.820],
    [49.181, -124.827],
    [49.155, -124.836],
    [49.128, -124.847],
    [49.101, -124.858],
    [49.073, -124.869],
    [49.045, -124.882],
    [49.016, -124.897],
    [48.988, -124.912],
    [48.973, -124.921],   /* Kildonan stop */
    [48.953, -124.934],
    [48.932, -124.950],
    [48.911, -124.967],
    [48.890, -124.984],   /* inlet mouth / east of Tzartus Island */
    [48.872, -125.005],
    [48.857, -125.030],
    [48.845, -125.063],
    [48.837, -125.100],
    [48.8355,-125.1392],  /* West Bamfield dock */
    [48.831, -125.138],
    [48.8285,-125.1372],
    [48.8259,-125.1367]   /* East Bamfield dock */
  ];

  var FLY_DEPARTURES = [
    { pos: [48.4222, -123.3693], label: 'Victoria Harbour' },
    { pos: [49.1645, -123.936],  label: 'Nanaimo Harbour' },
    { pos: [49.17705, -123.16815], label: 'Vancouver International Seaplane Base' },
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
    /* Port Alberni Co-op (10th Ave) → Bamfield — leaves town via 10th Ave / Anderson */
    alberni: [[-124.798, 49.246], [-125.1308, 48.8276]],
    /* Port Renfrew → Lake Cowichan Co-op → Port Alberni Co-op → Bamfield */
    renfrew: [[-124.421, 48.554], [-124.0482022, 48.8284988], [-124.798, 49.246], [-125.1308, 48.8276]]
  };

  /*
   * Lake Cowichan logging route — hand-traced [lat,lng].
   * OSRM has no data for the Youbou→Bamfield logging road, so routing it produces
   * a wrong detour. This indicative trace follows the real corridor: north shore of
   * Cowichan Lake through Youbou, west on the logging road to the Carmanah Mainline /
   * Bamfield Rd junction, then SW into Bamfield. (Route is "not recommended" anyway.)
   */
  var LOGGING_START = [48.876, -124.240];   /* route waypoint — pavement ends W of Youbou (keeps the line on the road) */
  var LOGGING_MARKER = [48.8895, -124.292]; /* warning-marker position only — NW up the north shore */
  var CARMANAH_JCT  = [48.9722287, -124.748308];
  var DUNCAN_TRACE = [
    [48.8284988, -124.0482022],  /* Lake Cowichan Co-op */
    [48.834, -124.090],
    [48.842, -124.130],
    [48.853, -124.165],
    [48.867, -124.200],          /* Youbou — Daly's Auto Centre */
    LOGGING_START,               /* logging road begins */
    [48.888, -124.290],
    [48.902, -124.345],
    [48.918, -124.410],
    [48.935, -124.490],
    [48.952, -124.575],
    [48.964, -124.660],
    CARMANAH_JCT,                /* chip-seal resumes — 32 km from Bamfield */
    [48.945, -124.830],
    [48.905, -124.915],
    [48.868, -125.000],
    [48.845, -125.075],
    [48.8276, -125.1308]         /* Bamfield */
  ];

  var ROUTE_STYLE = {
    alberni: { color: '#2e5d33', weight: 5, opacity: 0.95 },
    duncan:  { color: '#d4830a', weight: 4, opacity: 0.9, dashArray: '7 5' },
    renfrew: { color: '#7b5ea7', weight: 4, opacity: 0.9 }
  };

  /* gas bars on the routes — `geo` is geocoded live in-browser; `pos` is the fallback */
  var GAS_BARS = [
    {
      pos:   PORT_ALBERNI_PT,
      geo:   'Co-op Gas Bar, 3820 10th Avenue, Port Alberni, BC',
      label: "<strong>Co-op Gas Bar, Port Alberni</strong> (3820 10th Ave) — fill up here. This is truly the last gas stop before Bamfield."
    },
    {
      pos:   [48.834, -125.135],
      geo:   "Ostrom's, Bamfield, BC",
      label: "<strong>Ostrom's Gas Bar, Bamfield</strong> (448 Seaboard Rd)<br>Open 8 am–8 pm daily in summer. Hours and days reduce significantly in fall, winter, and spring."
    },
    {
      pos:   [48.8284988, -124.0482022],
      geo:   'Co-op Gas Bar, Lake Cowichan, BC',
      label: '<strong>Co-op Gas Bar, Lake Cowichan</strong> — fuel available on the main road through town.'
    },
    {
      pos:   [48.8669, -124.2001],
      geo:   "Daly's Auto Centre, 10514 Youbou Road, Youbou, BC",
      label: "<strong>Daly's Auto Center (Gas Bar), Youbou</strong> (10514 Youbou Rd) — limited hours; check with the business. Do not rely on it."
    }
  ];

  /* live forward-geocode (browser can reach Nominatim; sandbox cannot) */
  function geocode(query, cb) {
    var url = 'https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=ca&q=' +
      encodeURIComponent(query);
    fetch(url, { headers: { 'Accept': 'application/json' } })
      .then(function (r) { return r.json(); })
      .then(function (d) {
        if (d && d[0] && d[0].lat) cb([parseFloat(d[0].lat), parseFloat(d[0].lon)]);
        else cb(null);
      })
      .catch(function () { cb(null); });
  }

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
      .bindPopup('<strong>Carmanah Mainline / Bamfield Rd junction</strong><br>About 32 km from Bamfield. Chip-seal resumes here for the run into Bamfield; the mainline back toward Youbou is rough logging road.');
  }

  /* cluster bubble for zoomed-out view */
  function makeClusterMarker(pos, areaName, items) {
    var icon = L.divIcon({
      html: '<div style="width:28px;height:28px;background:rgba(55,55,55,.92);border:2.5px solid #fff;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:700;color:#fff;box-shadow:0 2px 8px rgba(0,0,0,.45);cursor:pointer">' + items.length + '</div>',
      iconSize: [28, 28], iconAnchor: [14, 14], className: ''
    });
    var popup = '<strong>' + areaName + '</strong>' +
      '<ul style="margin:.35em 0 0;padding-left:1.1em;font-size:.83em;line-height:1.5">' +
      items.map(function (i) { return '<li>' + i + '</li>'; }).join('') + '</ul>' +
      '<em style="font-size:.75em;color:#999">Zoom in to see individual markers</em>';
    return L.marker(pos, { icon: icon, zIndexOffset: 600 }).bindPopup(popup);
  }

  /* Google Maps direction links — one per route, with correct waypoints */
  var ROUTE_GMAPS = {
    /* Port Alberni Co-op → Bamfield */
    alberni: 'https://www.google.com/maps/dir/49.246,-124.798/48.8276,-125.1308/',
    /* Lake Cowichan Co-op → Carmanah Main / Bamfield Rd junction → Bamfield */
    duncan:  'https://www.google.com/maps/dir/48.8284988,-124.0482022/48.9722287,-124.748308/48.8276,-125.1308/',
    /* Port Renfrew → Lake Cowichan Co-op → Port Alberni Co-op → Bamfield */
    renfrew: 'https://www.google.com/maps/dir/48.554,-124.421/48.8284988,-124.0482022/49.246,-124.798/48.8276,-125.1308/'
  };

  function injectMapsLinks() {
    var btnStyle = 'display:inline-flex;align-items:center;gap:5px;padding:6px 14px;border-radius:6px;' +
      'font-size:.78rem;font-weight:600;text-decoration:none;background:#1a73e8;color:#fff;' +
      'box-shadow:0 1px 4px rgba(0,0,0,.18);white-space:nowrap';
    var pinSvg = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>';
    Object.keys(ROUTE_GMAPS).forEach(function (id) {
      var panel = document.querySelector('[data-route-panel="' + id + '"]');
      if (!panel || panel.querySelector('.route-map-links')) return;
      var div = document.createElement('div');
      div.className = 'route-map-links';
      div.style.cssText = 'margin-top:12px;padding-top:10px;border-top:1px solid rgba(0,0,0,.08)';
      div.innerHTML = '<a href="' + ROUTE_GMAPS[id] + '" target="_blank" rel="noopener" style="' + btnStyle + '">' + pinSvg + ' Open in Google Maps</a>';
      panel.appendChild(div);
    });
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

    /* place a gas marker at its fallback, then snap it to its real geocoded address */
    function placeGas(i) {
      var g = GAS_BARS[i], m = gasMarker(driveMap, g.pos, g.label);
      geocode(g.geo, function (ll) { if (ll && driveMap) m.setLatLng(ll); });
      return m;
    }

    /* always-visible: Port Alberni gas (standalone, far from others) */
    placeGas(0);

    /* markers in Cowichan Lake area — will cluster at low zoom */
    var lakeGasMark   = placeGas(2);
    var youbouGasMark = placeGas(3);
    var warnMark = warningMarker(driveMap, LOGGING_MARKER,
      '<strong>Logging road begins — 11457 N Shore Rd</strong><br>' +
      'Just west of Youbou the pavement ends and North Shore Rd becomes an active gravel logging road — very rough, no maintenance schedule.<br>' +
      'Speeds as low as 10–20 km/h. <strong>Not recommended</strong> for RVs, campers, trailers, or first-timers.');

    /* Bamfield area gas — only 1 marker, show directly (no cluster) */
    placeGas(1);

    /* chip-seal intersection: Carmanah Mainline / Bamfield Rd junction (~32 km from Bamfield) */
    chipSealMark = chipSealMarker(driveMap, CARMANAH_JCT);
    driveMap.removeLayer(chipSealMark);

    /* cluster bubble for Cowichan Lake area (3 markers) */
    var cowichanCluster = makeClusterMarker(
      [48.85, -124.13],
      'Cowichan Lake Area',
      ['Co-op Gas Bar, Lake Cowichan', "Daly's Auto Center (Gas Bar), Youbou — limited hours", 'Logging road starts west of Youbou (11457 N Shore Rd)']
    );

    var cowichanGroup = [lakeGasMark, youbouGasMark, warnMark];

    function updateClusters() {
      if (!driveMap) return;
      var z = driveMap.getZoom();
      var cowOff = z < 11;
      cowichanGroup.forEach(function (m) {
        if (cowOff) { if (driveMap.hasLayer(m)) driveMap.removeLayer(m); }
        else        { if (!driveMap.hasLayer(m)) m.addTo(driveMap); }
      });
      if (cowOff) { if (!driveMap.hasLayer(cowichanCluster)) cowichanCluster.addTo(driveMap); }
      else        { if (driveMap.hasLayer(cowichanCluster)) driveMap.removeLayer(cowichanCluster); }
    }

    driveMap.on('zoomend', updateClusters);
    updateClusters();

    /* inject "open in maps" links */
    injectMapsLinks();

    /* loading chip */
    var chip = document.createElement('div');
    chip.style.cssText = 'position:absolute;top:8px;right:8px;background:rgba(255,255,255,.92);' +
      'padding:4px 10px;border-radius:4px;font-size:.8rem;z-index:1000;pointer-events:none;' +
      'box-shadow:0 1px 4px rgba(0,0,0,.15)';
    chip.textContent = 'Loading routes…';
    el.appendChild(chip);

    /* alberni + renfrew come from OSRM; duncan is the hand-traced logging route */
    var pending = Object.keys(DRIVE_OSRM).length + 1;
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
    /* duncan: render the hand trace directly (no OSRM detour) */
    onRouteLoad('duncan', DUNCAN_TRACE.slice());

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

    /* OSM Lady Rose route = way 537084871 (Bamfield ↔ Port Alberni).
       Fetched live so the line matches the dashed ferry track on the tiles exactly. */
    var EAST_DOCK_TAIL = [[48.831, -125.138], [48.8285, -125.1372], FERRY_STOPS.east.pos];

    function orientAndExtend(pts) {
      var p = pts.slice();
      if (p[0][0] < p[p.length - 1][0]) p.reverse();   /* run north (Port Alberni) → south (Bamfield) */
      var last = p[p.length - 1], east = FERRY_STOPS.east.pos;
      if (Math.hypot(last[0] - east[0], last[1] - east[1]) > 0.006) p = p.concat(EAST_DOCK_TAIL);
      return p;
    }

    function fetchFerryWay(cb) {
      var q = '[out:json][timeout:25];way(537084871);out geom;';
      fetch('https://overpass-api.de/api/interpreter?data=' + encodeURIComponent(q))
        .then(function (r) { return r.ok ? r.json() : null; })
        .then(function (d) {
          var w = d && d.elements && d.elements[0];
          if (!w || !w.geometry) { cb(null); return; }
          cb(w.geometry.map(function (g) { return [g.lat, g.lon]; }));
        })
        .catch(function () { cb(null); });
    }

    function drawBest(pts) {
      drawFerryLine(orientAndExtend(pts && pts.length > 4 ? pts : FERRY_INLINE));
    }

    /* local JSON first (if ever added), else live OSM way, else inline fallback */
    fetch('/js/ferry-route.json')
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (data) {
        if (Array.isArray(data) && data.length > 4) { drawBest(data); return; }
        fetchFerryWay(drawBest);
      })
      .catch(function () { fetchFerryWay(drawBest); });

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
