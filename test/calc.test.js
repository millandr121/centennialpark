/* Unit tests for the canonical business math (functions/api/_calc.js).
   Run with:  npm test   (node --test) */

import test from 'node:test';
import assert from 'node:assert/strict';
import { gstIncluded, datesOverlap, GST_RATE, OVERLAP_WHERE, nightsBetween, clampMoney } from '../functions/api/_calc.js';

test('GST is extracted as the 5/105 portion of an all-in amount', () => {
  assert.equal(GST_RATE, 0.05);
  // $105 all-in contains exactly $5.00 of GST.
  assert.equal(gstIncluded(105), 5);
  // $30 campsite (all-in) → 30 * 5/105 = 1.4285… → rounds to 1.43.
  assert.equal(gstIncluded(30), 1.43);
  assert.equal(gstIncluded(0), 0);
  // Non-numeric / junk input must not produce NaN.
  assert.equal(gstIncluded(null), 0);
  assert.equal(gstIncluded('abc'), 0);
});

test('extracted GST never exceeds the amount and is self-consistent', () => {
  for (const amt of [12.5, 47, 142, 216, 735]) {
    const gst = gstIncluded(amt);
    assert.ok(gst > 0 && gst < amt, `gst in range for ${amt}`);
    // pre-tax * 1.05 ≈ amount (within a cent of rounding)
    const preTax = amt - gst;
    assert.ok(Math.abs(preTax * (1 + GST_RATE) - amt) < 0.011, `inclusive math holds for ${amt}`);
  }
});

test('overlapping date ranges are detected', () => {
  // B starts inside A
  assert.equal(datesOverlap('2026-07-01', '2026-07-05', '2026-07-03', '2026-07-08'), true);
  // identical ranges
  assert.equal(datesOverlap('2026-07-01', '2026-07-05', '2026-07-01', '2026-07-05'), true);
  // A fully contains B
  assert.equal(datesOverlap('2026-07-01', '2026-07-10', '2026-07-03', '2026-07-04'), true);
});

test('same-day turnover is ALLOWED (touching endpoints do not overlap)', () => {
  // One guest checks out 07-05, next checks in 07-05 → no overlap.
  assert.equal(datesOverlap('2026-07-01', '2026-07-05', '2026-07-05', '2026-07-08'), false);
  // Adjacent the other way.
  assert.equal(datesOverlap('2026-07-05', '2026-07-08', '2026-07-01', '2026-07-05'), false);
  // Completely separate.
  assert.equal(datesOverlap('2026-07-01', '2026-07-03', '2026-07-10', '2026-07-12'), false);
});

test('OVERLAP_WHERE binds as (requestedCheckOut, requestedCheckIn)', () => {
  // The SQL fragment must compare existing.check_in < ? and existing.check_out > ?.
  assert.equal(OVERLAP_WHERE, 'check_in < ? AND check_out > ?');
});

test('nightsBetween counts whole nights and is DST-safe', () => {
  assert.equal(nightsBetween('2026-07-01', '2026-07-05'), 4);
  assert.equal(nightsBetween('2026-07-05', '2026-07-05'), 0);   // same day
  assert.equal(nightsBetween('2026-07-05', '2026-07-04'), 0);   // reversed → clamped
  assert.equal(nightsBetween('2026-03-07', '2026-03-09'), 2);   // spans US DST change
  assert.equal(nightsBetween('bad', '2026-07-05'), 0);          // invalid
});

test('clampMoney rejects negatives and blanks, keeps 0 and positives', () => {
  assert.equal(clampMoney(''), null);
  assert.equal(clampMoney(null), null);
  assert.equal(clampMoney('abc'), null);
  assert.equal(clampMoney(-5), 0);      // negative floored to 0
  assert.equal(clampMoney(0), 0);       // legitimate $0 preserved
  assert.equal(clampMoney('42.50'), 42.5);
});
