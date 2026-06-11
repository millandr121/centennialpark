/* layout.js — inject shared header and footer */

(function () {
  var header = document.getElementById('site-header');
  if (header) {
    header.innerHTML =
      '<div class="site-header-bar">' +
        '<a href="#home" class="site-header-brand">' +
          '<img src="https://bamfieldparks.com/wp-content/uploads/2017/03/bear_logo4-150x150.png" alt="Park bear logo" width="34" height="34">' +
          '<span>Centennial Park</span>' +
        '</a>' +
        '<a href="#book" class="btn btn-primary site-header-cta"><span>Book now</span></a>' +
      '</div>';
  }

  var footer = document.getElementById('site-footer');
  if (footer) {
    footer.innerHTML =
      '<div class="site-footer-inner">' +
        '<div>' +
          '<strong style="font-family:var(--font-display);color:#fff">Eileen Scott Centennial Park</strong>' +
          '<p style="margin-top:.4rem;font-size:.85rem">Bamfield, BC · PO Box 931</p>' +
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
