/* map-icons.js — custom Leaflet marker icons */

window.ParkIcons = (function () {
  if (typeof L === 'undefined') return {};

  function makeIcon(color, label) {
    var svg =
      '<svg xmlns="http://www.w3.org/2000/svg" width="28" height="36" viewBox="0 0 28 36">' +
        '<path d="M14 0C6.268 0 0 6.268 0 14c0 9.333 14 22 14 22S28 23.333 28 14C28 6.268 21.732 0 14 0z" fill="' + color + '"/>' +
        '<circle cx="14" cy="14" r="6" fill="rgba(255,255,255,0.9)"/>' +
        '<text x="14" y="18" text-anchor="middle" font-size="8" font-weight="700" font-family="sans-serif" fill="' + color + '">' + (label || '') + '</text>' +
      '</svg>';
    return L.divIcon({
      html: '<div style="width:28px;height:36px">' + svg + '</div>',
      iconSize: [28, 36],
      iconAnchor: [14, 36],
      popupAnchor: [0, -36],
      className: ''
    });
  }

  return {
    park:    makeIcon('#2c5f2e', 'P'),
    ferry:   makeIcon('#1a5580', 'F'),
    airport: makeIcon('#7a4000', 'A'),
    dot:     makeIcon('#666666', '')
  };
})();
