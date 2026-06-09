/* route-map.js — Leaflet maps for driving, ferry, and floatplane sections */

(function () {
  'use strict';
  if (typeof L === 'undefined') return;

  var BAMFIELD = [48.833, -125.133];
  var TILE_URL = 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png';
  var TILE_ATTR = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/">CARTO</a>';

  /* ── Helpers ──────────────────────────────────────────── */
  function baseMap(id, center, zoom) {
    var map = L.map(id, { zoomControl: true, scrollWheelZoom: false }).setView(center, zoom);
    L.tileLayer(TILE_URL, { attribution: TILE_ATTR, maxZoom: 15 }).addTo(map);
    return map;
  }

  function initWhenVisible(el, cb) {
    if (!el) return;
    if ('IntersectionObserver' in window) {
      var io = new IntersectionObserver(function (entries) {
        entries.forEach(function (e) {
          if (e.isIntersecting) { cb(); io.disconnect(); }
        });
      }, { threshold: 0.1 });
      io.observe(el);
    } else {
      cb();
    }
  }

  /* ═══ DRIVING MAP ═══════════════════════════════════════ */
  var driveWrap = document.querySelector('[data-driving-map]');
  if (driveWrap) {
    var driveMapEl = document.getElementById('drive-map-leaflet');
    initWhenVisible(driveMapEl, function () {
      var map = baseMap('drive-map-leaflet', [49.0, -124.5], 8);
      if (window.ParkIcons && window.ParkIcons.park) {
        L.marker(BAMFIELD, { icon: window.ParkIcons.park }).addTo(map)
          .bindPopup('<strong>Centennial Park</strong><br>Bamfield, BC');
      }

      /* ── Route polylines (approximate corridors) ──── */
      var PORT_ALBERNI = [49.234, -124.805];
      var DUNCAN       = [48.778, -123.707];
      var YOUBOU       = [48.850, -124.143];
      var PT_RENFREW   = [48.558, -124.420];
      var NITINAT      = [48.940, -124.660];

      var routes = {
        alberni: {
          latlngs: [PORT_ALBERNI, [49.18,-124.92], [49.08,-125.01], [48.98,-125.05], [48.92,-125.10], BAMFIELD],
          color: '#2c5f2e', weight: 4
        },
        duncan: {
          latlngs: [DUNCAN, [48.82,-123.92], YOUBOU, [48.87,-124.35], [48.88,-124.55], [48.87,-124.82], BAMFIELD],
          color: '#d4830a', weight: 3, dashArray: '6 4'
        },
        renfrew: {
          latlngs: [PT_RENFREW, [48.62,-124.55], NITINAT, [48.90,-124.88], BAMFIELD],
          color: '#c0392b', weight: 3, dashArray: '6 4'
        }
      };

      var polylines = {};
      Object.keys(routes).forEach(function (key) {
        var r = routes[key];
        polylines[key] = L.polyline(r.latlngs, {
          color: r.color, weight: r.weight || 4,
          dashArray: r.dashArray || null, opacity: .7
        }).addTo(map);
      });

      /* add start markers */
      if (window.ParkIcons && window.ParkIcons.dot) {
        L.marker(PORT_ALBERNI, { icon: window.ParkIcons.dot }).addTo(map).bindPopup('Port Alberni');
        L.marker(DUNCAN,       { icon: window.ParkIcons.dot }).addTo(map).bindPopup('Duncan');
        L.marker(PT_RENFREW,   { icon: window.ParkIcons.dot }).addTo(map).bindPopup('Port Renfrew');
      }

      /* ── Route button switching ───────────────────── */
      var routeBtns   = driveWrap.querySelectorAll('[data-route-id]');
      var routePanels = driveWrap.querySelectorAll('[data-route-panel]');

      function activateRoute(id) {
        routeBtns.forEach(function (b) {
          var active = b.getAttribute('data-route-id') === id;
          b.classList.toggle('is-active', active);
          b.setAttribute('aria-pressed', String(active));
        });
        routePanels.forEach(function (p) {
          p.classList.toggle('is-active', p.getAttribute('data-route-panel') === id);
          p.hidden = p.getAttribute('data-route-panel') !== id;
        });
        /* bold active line */
        Object.keys(polylines).forEach(function (k) {
          polylines[k].setStyle({ opacity: k === id ? 1 : .3, weight: k === id ? 5 : 3 });
        });
        var ply = polylines[id];
        if (ply) map.fitBounds(ply.getBounds(), { padding: [40, 40] });
      }

      routeBtns.forEach(function (btn) {
        btn.addEventListener('click', function () {
          activateRoute(btn.getAttribute('data-route-id'));
        });
      });

      /* default highlight */
      activateRoute('alberni');
    });

    /* expand button */
    var expandBtn = driveWrap.querySelector('[data-map-expand="drive"]');
    if (expandBtn) {
      expandBtn.addEventListener('click', function () {
        var wrap = expandBtn.closest('.map-wrap');
        var expanded = wrap.classList.toggle('map-expanded');
        expandBtn.setAttribute('aria-pressed', String(expanded));
        expandBtn.title = expanded ? 'Collapse map' : 'Full screen';
      });
    }

    /* refresh button */
    var refreshBtn = driveWrap.querySelector('[data-map-refresh="drive"]');
    if (refreshBtn) {
      refreshBtn.addEventListener('click', function () {
        var mapEl = document.getElementById('drive-map-leaflet');
        if (mapEl && mapEl._leaflet_id) {
          var m = mapEl._leaflet_map;
          if (m) m.invalidateSize();
        }
      });
    }
  }

  /* ═══ FERRY MAP ═════════════════════════════════════════ */
  var ferryWrap = document.querySelector('[data-ferry-map]');
  if (ferryWrap) {
    var ferryMapEl = document.getElementById('ferry-map-leaflet');
    initWhenVisible(ferryMapEl, function () {
      var PORT_ALBERNI_QUAY = [49.2335, -124.800];
      var map = baseMap('ferry-map-leaflet', [49.0, -124.97], 9);

      var stops = [
        { pos: PORT_ALBERNI_QUAY,   label: 'Port Alberni (Harbour Quay)',  info: 'Departure: Tue, Thu, Sat + summer extras. Lady Rose Marine, 5425 Argyle St.' },
        { pos: [48.973, -124.931],  label: 'Kildonan / Sarita',            info: 'Midway stop on the inlet.' },
        { pos: [48.880, -125.020],  label: 'Ucluelet Junction (optional)', info: 'Seasonal stop depending on schedule.' },
        { pos: BAMFIELD,            label: 'Bamfield (East dock)',          info: 'Your stop for Centennial Park. East dock only.' }
      ];

      var routeLine = stops.map(function (s) { return s.pos; });
      L.polyline(routeLine, { color: '#1a5580', weight: 4, opacity: .8 }).addTo(map);

      var icon = (window.ParkIcons && window.ParkIcons.ferry) ? window.ParkIcons.ferry : null;
      var parkIcon = (window.ParkIcons && window.ParkIcons.park) ? window.ParkIcons.park : null;
      stops.forEach(function (s, i) {
        var mk = L.marker(s.pos, { icon: i === stops.length - 1 ? parkIcon : icon });
        if (mk) mk.addTo(map).bindPopup('<strong>' + s.label + '</strong><br>' + s.info);
      });

      var detail = ferryWrap.querySelector('[data-ferry-detail]');
      map.on('popupopen', function (e) {
        if (detail) detail.innerHTML = e.popup.getContent();
      });
    });
  }

  /* ═══ FLY MAP ═══════════════════════════════════════════ */
  var flyWrap = document.querySelector('[data-fly-map]');
  if (flyWrap) {
    var flyMapEl = document.getElementById('fly-map-leaflet');
    initWhenVisible(flyMapEl, function () {
      var map = baseMap('fly-map-leaflet', [49.05, -124.3], 8);

      var airports = [
        { pos: [49.053, -122.360], label: 'Abbotsford / Vancouver area' },
        { pos: [49.193, -123.183], label: 'Vancouver Harbour (Coal Harbour)' },
        { pos: [48.650, -123.425], label: 'Victoria Harbour / Swartz Bay' },
        { pos: [49.163, -123.930], label: 'Nanaimo Harbour' },
        { pos: [49.152, -125.906], label: 'Tofino Harbour' }
      ];

      airports.forEach(function (a) {
        var icon = window.ParkIcons && window.ParkIcons.airport ? window.ParkIcons.airport : null;
        var mk = L.marker(a.pos, { icon: icon });
        if (mk) mk.addTo(map).bindPopup(a.label);
        /* dashed flight path */
        L.polyline([a.pos, BAMFIELD], { color: '#7a4000', weight: 2, dashArray: '6 5', opacity: .5 }).addTo(map);
      });

      if (window.ParkIcons && window.ParkIcons.park) {
        L.marker(BAMFIELD, { icon: window.ParkIcons.park }).addTo(map)
          .bindPopup('<strong>Bamfield Inlet</strong><br>Floatplane landing area');
      }
    });
  }

})();
