/* booking-form.js — additional booking form helpers (date min, etc.) */

(function () {
  'use strict';

  var checkIn  = document.getElementById('checkIn');
  var checkOut = document.getElementById('checkOut');
  if (!checkIn || !checkOut) return;

  // Local "today" — toISOString() returns the UTC date, which rolls a day ahead
  // for Pacific-timezone visitors in the evening and mis-sets the date-picker min.
  var _now = new Date();
  var today = _now.getFullYear() + '-' + String(_now.getMonth() + 1).padStart(2, '0') + '-' + String(_now.getDate()).padStart(2, '0');
  checkIn.min  = today;
  checkOut.min = today;

  checkIn.addEventListener('change', function () {
    checkOut.min = checkIn.value || today;
    if (checkOut.value && checkOut.value < checkIn.value) {
      checkOut.value = checkIn.value;
    }
  });
})();
