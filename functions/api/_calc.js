/* _calc.js — pure, dependency-free business math shared by the API functions
   AND covered by unit tests (test/calc.test.js). No Cloudflare/DB imports here
   so it can be imported directly by `node --test`. Files prefixed "_" are not
   routed by Pages, so this is import-only.

   TWO canonical rules live here so they can never drift between code paths:
     1. GST model — all amounts are ALL-IN (GST included); the GST portion is
        extracted as amount × 5/105. (Matches CLAUDE.md.)
     2. Date overlap — half-open intervals [check_in, check_out): a guest may
        check in on the same day another checks out (same-day turnover allowed).
*/

export const GST_RATE = 0.05;

/* GST portion already contained inside a tax-inclusive amount (amount × 5/105). */
export function gstIncluded(amount) {
  const a = Number(amount) || 0;
  return Math.round((a * GST_RATE / (1 + GST_RATE)) * 100) / 100;
}

/* Do bookings [aIn,aOut) and [bIn,bOut) overlap? Dates are 'YYYY-MM-DD' strings
   compared lexically (safe for ISO dates). Touching endpoints do NOT overlap,
   so same-day turnover is allowed. */
export function datesOverlap(aIn, aOut, bIn, bOut) {
  return aIn < bOut && aOut > bIn;
}

/* SQL fragment for the overlap test against an existing reservation row.
   Bind order: (requestedCheckOut, requestedCheckIn).
   To switch to a one-day cleaning buffer after checkout, change to:
     "check_in < ? AND date(check_out,'+1 day') > ?"  */
export const OVERLAP_WHERE = 'check_in < ? AND check_out > ?';

/* Whole nights between two 'YYYY-MM-DD' dates. Dates parse as UTC midnight, so
   this is DST-safe. Returns 0 for equal/invalid/reversed inputs. */
export function nightsBetween(checkIn, checkOut) {
  const a = new Date(checkIn), b = new Date(checkOut);
  if (isNaN(a) || isNaN(b)) return 0;
  return Math.max(0, Math.round((b - a) / 86400000));
}

/* Coerce a money input to a non-negative number, or null for blank/invalid.
   Prevents negative amounts corrupting income/GST totals. */
export function clampMoney(v) {
  if (v == null || v === '') return null;
  const n = parseFloat(v);
  if (isNaN(n)) return null;
  return n < 0 ? 0 : n;
}
