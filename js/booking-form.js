/* booking-form.js — additional booking form helpers (date min, etc.) */

(function () {
  'use strict';

  var checkIn  = document.getElementById('checkIn');
  var checkOut = document.getElementById('checkOut');
  if (!checkIn || !checkOut) return;

  var today = new Date().toISOString().split('T')[0];
  checkIn.min  = today;
  checkOut.min = today;

  checkIn.addEventListener('change', function () {
    checkOut.min = checkIn.value || today;
    if (checkOut.value && checkOut.value < checkIn.value) {
      checkOut.value = checkIn.value;
    }
  });
})();
