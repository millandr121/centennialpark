/* pricing.js — shared rate calculator for booking forms */
(function () {
'use strict';

var PARK_RATES = {
  campsite: { day: 30, week: 187.50, month: 735 },
  moorage:  { day: 1.00, week: 5.60, month: 9.10, annual: 66.00 },
  parking: {
    car:     { day: 6.50, week: 40, month: 136.50 },
    trailer: { day: 6.50, week: 40, month: 136.50 },
    both:    { day: 11,   week: 55, month: 236.50 }
  },
  launch:   { day: 20, seasonal: 142, annual: 216 },
  boatWash: 5.00,
  freezer:  5.00
};
var GST_RATE = 0.05;

function bestRateSplit(r, nights) {
  if (!nights || nights <= 0) return 0;
  var rem = nights, total = 0;
  if (r.month) { var m = Math.floor(rem / 30); total += m * r.month; rem -= m * 30; }
  if (r.week)  { var w = Math.floor(rem / 7);  total += w * r.week;  rem -= w * 7;  }
  total += rem * r.day;
  return Math.round(total * 100) / 100;
}

function calcPricing(opts) {
  var lines = [], subtotal = 0;
  var nights = parseInt(opts.nights) || 0;

  if (opts.needCampsite && nights > 0) {
    var sites = parseInt(opts.siteCount) || 1;
    var amt = bestRateSplit(PARK_RATES.campsite, nights) * sites;
    lines.push({ label: 'Campsite' + (sites > 1 ? ' \xd7 ' + sites : '') + ' · ' + nights + ' night' + (nights !== 1 ? 's' : ''), amount: Math.round(amt * 100) / 100 });
    subtotal += amt;
  }

  if (opts.needMoorage) {
    var ft = parseFloat(opts.boatLength) || 0;
    if (ft > 0 && nights > 0) {
      var moorAmt = bestRateSplit(PARK_RATES.moorage, nights) * ft;
      lines.push({ label: 'Moorage · ' + ft + ' ft · ' + nights + ' night' + (nights !== 1 ? 's' : ''), amount: Math.round(moorAmt * 100) / 100 });
      subtotal += moorAmt;
    }
  }

  if (opts.needParking && nights > 0) {
    var ptype = opts.parkingType || 'car';
    var pr = PARK_RATES.parking[ptype] || PARK_RATES.parking.car;
    var plabel = ptype === 'both' ? 'Car + Trailer parking' : (ptype === 'trailer' ? 'Trailer parking' : 'Car parking');
    var parkAmt = bestRateSplit(pr, nights);
    lines.push({ label: plabel + ' · ' + nights + ' day' + (nights !== 1 ? 's' : ''), amount: parkAmt });
    subtotal += parkAmt;
  }

  if (opts.needLaunch) {
    var period = opts.launchPeriod || 'day';
    if (period === 'seasonal') {
      lines.push({ label: 'Boat launch — seasonal pass (GST incl.)', amount: 142, gstIncl: true });
      subtotal += 142;
    } else if (period === 'annual') {
      lines.push({ label: 'Boat launch — annual pass (GST incl.)', amount: 216, gstIncl: true });
      subtotal += 216;
    } else {
      var ldays = parseInt(opts.launchDays) || (nights > 0 ? nights : 1);
      var lamt = 20 * ldays;
      lines.push({ label: 'Boat launch · ' + ldays + ' day' + (ldays !== 1 ? 's' : '') + ' (GST incl.)', amount: lamt, gstIncl: true });
      subtotal += lamt;
    }
  }

  var bwQty = parseInt(opts.boatWashQty) || 0;
  if (bwQty > 0) {
    var bwAmt = PARK_RATES.boatWash * bwQty;
    lines.push({ label: 'Boat wash \xd7 ' + bwQty, amount: bwAmt });
    subtotal += bwAmt;
  }

  var frDays = parseInt(opts.freezerDays) || 0;
  if (frDays > 0) {
    var frAmt = PARK_RATES.freezer * frDays;
    lines.push({ label: 'Freezer space · ' + frDays + ' day' + (frDays !== 1 ? 's' : ''), amount: frAmt });
    subtotal += frAmt;
  }

  /* All advertised rates are GST-INCLUSIVE (all-in) per CLAUDE.md: the guest
     pays exactly the listed number and the GST is the 5/105 portion already
     inside it — never added on top. `total` is what the guest pays; `gst` is
     the portion within it; `subtotal` is the pre-GST remainder (total − gst).
     (To switch to GST-on-top, set total = subtotal + subtotal*GST_RATE and
     gst = subtotal*GST_RATE.) */
  var total = Math.round(subtotal * 100) / 100;
  var gst   = Math.round(total * GST_RATE / (1 + GST_RATE) * 100) / 100;
  return { lines: lines, subtotal: Math.round((total - gst) * 100) / 100, gst: gst, total: total };
}

function fmtCAD(n) { return '$' + (+n).toFixed(2); }

window.ParkPricing = { calcPricing: calcPricing, fmtCAD: fmtCAD, PARK_RATES: PARK_RATES };
})();
