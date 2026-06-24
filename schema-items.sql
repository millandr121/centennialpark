-- Migration: misc income items (ledger) + GST/payment refinements.
-- Run in the Cloudflare D1 console (or wrangler). Safe to re-run — if a column
-- already exists SQLite errors with "duplicate column name"; just skip that line.
--   wrangler d1 execute centennialpark --file=./schema-items.sql --remote

-- ── Misc income items ─────────────────────────────────────────────────────
-- Non-booking revenue the park wants to track for taxes/income: ad-hoc boat
-- launches, shower donations, parking drop-ins, freezer rentals, general
-- donations, etc. Each row carries its own GST so reports can total it per item.
CREATE TABLE IF NOT EXISTS misc_items (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  item_date      TEXT    NOT NULL,                       -- date money was taken in (YYYY-MM-DD)
  category       TEXT    NOT NULL,                       -- camping/moorage/launch/parking/shower/freezer/donation/other
  description    TEXT,
  amount         REAL    NOT NULL DEFAULT 0,             -- all-in amount collected (GST inclusive)
  gst_amount     REAL    NOT NULL DEFAULT 0,             -- GST portion inside `amount` (0 when exempt)
  gst_exempt     INTEGER NOT NULL DEFAULT 0,
  payment_method TEXT,
  notes          TEXT,
  created_at     TEXT    NOT NULL DEFAULT (datetime('now'))
);

-- ── Payment refinements on reservations ───────────────────────────────────
-- gst_exempt: this booking's amount carries no GST (e.g. a pure donation/refund).
-- paid_at:    when the booking was marked paid — income is reported by this date.
ALTER TABLE reservations ADD COLUMN gst_exempt INTEGER NOT NULL DEFAULT 0;
ALTER TABLE reservations ADD COLUMN paid_at    TEXT;
