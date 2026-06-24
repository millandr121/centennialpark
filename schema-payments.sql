-- Migration: payment tracking + generic service "sites" for parking / launch.
-- Run in the Cloudflare D1 console (or wrangler). Safe to re-run — if a column
-- already exists SQLite errors with "duplicate column name"; just skip that line.
--   wrangler d1 execute centennialpark --file=./schema-payments.sql --remote

-- ── Payment tracking on reservations ──────────────────────────────────────
ALTER TABLE reservations ADD COLUMN payment_status TEXT    DEFAULT 'unpaid';
ALTER TABLE reservations ADD COLUMN amount_due     REAL;
ALTER TABLE reservations ADD COLUMN amount_paid    REAL;

-- ── Generic service "lots" — no numbered slot, used for parking / launch ──
-- type='reserved' satisfies the sites CHECK constraint and keeps them off the
-- public campsite/moorage maps (those render fixed CAMP_SITES / MOOR_SITES).
INSERT OR IGNORE INTO sites (id,name,type,active) VALUES
  ('PARKING','Parking Lot','reserved',1),
  ('TRAILER','Trailer Lot','reserved',1),
  ('LAUNCH', 'Boat Launch','reserved',1);
