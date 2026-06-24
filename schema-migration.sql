-- Migration: add pricing + new service fields.
-- Run after schema.sql + schema-v2.sql:
--   wrangler d1 execute centennialpark --file=./schema-migration.sql --remote

-- booking_submissions new columns
ALTER TABLE booking_submissions ADD COLUMN need_parking      TEXT    DEFAULT 'no';
ALTER TABLE booking_submissions ADD COLUMN parking_type      TEXT;
ALTER TABLE booking_submissions ADD COLUMN need_boat_launch  TEXT    DEFAULT 'no';
ALTER TABLE booking_submissions ADD COLUMN boat_launch_period TEXT;
ALTER TABLE booking_submissions ADD COLUMN boat_launch_days  INTEGER;
ALTER TABLE booking_submissions ADD COLUMN boat_wash_qty     INTEGER DEFAULT 0;
ALTER TABLE booking_submissions ADD COLUMN freezer_days      INTEGER DEFAULT 0;
ALTER TABLE booking_submissions ADD COLUMN payment_method    TEXT;
ALTER TABLE booking_submissions ADD COLUMN estimated_total   REAL    DEFAULT 0;
ALTER TABLE booking_submissions ADD COLUMN gst_amount        REAL    DEFAULT 0;

-- reservations new columns
ALTER TABLE reservations ADD COLUMN parking_type       TEXT;
ALTER TABLE reservations ADD COLUMN boat_launch_period TEXT;
ALTER TABLE reservations ADD COLUMN boat_wash_qty      INTEGER DEFAULT 0;
ALTER TABLE reservations ADD COLUMN freezer_days       INTEGER DEFAULT 0;
ALTER TABLE reservations ADD COLUMN payment_method     TEXT;
ALTER TABLE reservations ADD COLUMN estimated_total    REAL    DEFAULT 0;
ALTER TABLE reservations ADD COLUMN gst_amount         REAL    DEFAULT 0;
