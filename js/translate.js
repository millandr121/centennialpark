/* translate.js — prevent Google Translate from mangling currency values */
(function () {
  document.querySelectorAll('.notranslate').forEach(function (el) {
    el.setAttribute('translate', 'no');
  });
})();
