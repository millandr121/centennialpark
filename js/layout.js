/* layout.js — inject shared footer only */

(function () {
  var footer = document.getElementById('site-footer');
  if (footer) {
    footer.innerHTML =
      '<div class="site-footer-inner">' +
        '<div class="site-footer-biz">' +
          '<strong>Eileen Scott Centennial Park</strong>' +
          '<p>Bamfield, BC &middot; PO Box 931</p>' +
          '<a href="tel:+12507283006">250-728-3006</a>' +
          '<a href="mailto:bamfieldcentennialpark@gmail.com">bamfieldcentennialpark@gmail.com</a>' +
        '</div>' +
        '<div class="site-footer-tag">' +
          '<span class="site-footer-hand">see you at the end of the road</span>' +
          '<span class="site-footer-copy">&copy; ' + new Date().getFullYear() + ' Eileen Scott Centennial Park</span>' +
          '<a href="/privacy.html" class="site-footer-link">Privacy</a>' +
          '<a href="/admin" class="site-footer-admin">&#9679;</a>' +
        '</div>' +
      '</div>';
  }
})();
