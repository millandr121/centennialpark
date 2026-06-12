/* layout.js — inject shared footer only */

(function () {
  var footer = document.getElementById('site-footer');
  if (footer) {
    footer.innerHTML =
      '<div class="site-footer-inner">' +
        '<div>' +
          '<strong style="font-family:var(--font-display);color:#fff">Eileen Scott Centennial Park</strong>' +
          '<p style="margin-top:.4rem;font-size:.85rem">Bamfield, BC &middot; PO Box 931</p>' +
        '</div>' +
        '<div>' +
          '<a href="tel:+12507283006" style="color:rgba(255,255,255,.8);display:block;margin-bottom:.3rem">250-728-3006</a>' +
          '<a href="mailto:bamfieldcentennialpark@gmail.com" style="color:rgba(255,255,255,.6);font-size:.85rem">bamfieldcentennialpark@gmail.com</a>' +
        '</div>' +
      '</div>' +
      '<p class="site-footer-copy">' +
        '<span class="site-footer-hand">see you at the end of the road</span><br>' +
        '&copy; ' + new Date().getFullYear() + ' Eileen Scott Centennial Park' +
      '</p>';
  }
})();
