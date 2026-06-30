-- ============================================================================
-- CANONICAL SCHEMA — Eileen Scott Centennial Park
-- ----------------------------------------------------------------------------
-- This is the SINGLE SOURCE OF TRUTH for a FRESH database. It merges every
-- historical migration (schema.sql, schema-v2.sql, schema-payments.sql,
-- schema-migration.sql, schema-items.sql) into one idempotent file.
--
-- Apply to a NEW database:
--   wrangler d1 execute centennialpark --file=./schema-full.sql --remote
--
-- For the EXISTING production database, keep applying the numbered migration
-- files instead (a fresh full apply is only for new/staging databases).
--
-- IMPORTANT — verify reality before trusting this file: the live DB was
-- hand-edited in the past and some code paths defend against an alternate
-- column naming (sites.label/status, reservations.people). Dump the live
-- schema and reconcile any differences:
--   wrangler d1 execute centennialpark --remote \
--     --command "SELECT sql FROM sqlite_master WHERE type IN ('table','index')"
-- This file uses the repository's intended shape: sites(name, active) and
-- reservations(party_size).
-- ============================================================================

-- ── Form submissions (the public enquiry inbox) ────────────────────────────
CREATE TABLE IF NOT EXISTS contact_submissions (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  created_at  TEXT    NOT NULL DEFAULT (datetime('now')),
  name        TEXT,
  email       TEXT,
  subject     TEXT,
  message     TEXT,
  emailed     INTEGER NOT NULL DEFAULT 0,
  ip          TEXT,
  user_agent  TEXT
);

CREATE TABLE IF NOT EXISTS booking_submissions (
  id                   INTEGER PRIMARY KEY AUTOINCREMENT,
  created_at           TEXT    NOT NULL DEFAULT (datetime('now')),
  first_name           TEXT,
  last_name            TEXT,
  email                TEXT,
  need_campsite        TEXT    DEFAULT 'no',
  need_moorage         TEXT    DEFAULT 'no',
  need_parking         TEXT    DEFAULT 'no',
  parking_type         TEXT,
  need_boat_launch     TEXT    DEFAULT 'no',
  boat_launch_period   TEXT,
  boat_launch_days     INTEGER,
  site_count           TEXT,
  group_size           TEXT,
  boat_length          TEXT,
  boat_wash_qty        INTEGER DEFAULT 0,
  freezer_days         INTEGER DEFAULT 0,
  check_in             TEXT,
  check_out            TEXT,
  additional_requests  TEXT,
  payment_method       TEXT,
  estimated_total      REAL    DEFAULT 0,
  gst_amount           REAL    DEFAULT 0,
  status               TEXT    DEFAULT 'new',     -- new | accepted | declined
  reservation_id       INTEGER,                   -- set when accepted → reservation
  emailed              INTEGER NOT NULL DEFAULT 0,
  ip                   TEXT,
  user_agent           TEXT
);

-- ── Bookable sites (campsites, moorage slips, generic service lots) ─────────
CREATE TABLE IF NOT EXISTS sites (
  id          TEXT    PRIMARY KEY,
  name        TEXT    NOT NULL,
  type        TEXT    NOT NULL CHECK(type IN ('campsite','moorage','reserved')),
  description TEXT,
  max_people  INTEGER,
  max_length  INTEGER,
  notes       TEXT,
  active      INTEGER NOT NULL DEFAULT 1
);

-- ── Reservations (the unified booking backend for all 3 booking modes) ──────
CREATE TABLE IF NOT EXISTS reservations (
  id                 INTEGER PRIMARY KEY AUTOINCREMENT,
  site_id            TEXT    NOT NULL REFERENCES sites(id),
  check_in           TEXT    NOT NULL,
  check_out          TEXT    NOT NULL,
  guest_name         TEXT    NOT NULL,
  guest_email        TEXT    NOT NULL,
  guest_phone        TEXT,
  party_size         INTEGER,
  boat_length        INTEGER,
  parking_type       TEXT,
  boat_launch_period TEXT,
  boat_wash_qty      INTEGER DEFAULT 0,
  freezer_days       INTEGER DEFAULT 0,
  payment_method     TEXT,
  payment_status     TEXT    DEFAULT 'unpaid',     -- unpaid | deposit | paid
  amount_due         REAL,
  amount_paid        REAL,                         -- AUTHORITATIVE receipt figure
  estimated_total    REAL    DEFAULT 0,
  gst_amount         REAL    DEFAULT 0,
  gst_exempt         INTEGER NOT NULL DEFAULT 0,
  paid_at            TEXT,                          -- stamped when marked paid
  notes              TEXT,
  submission_id      INTEGER,                       -- link back to the enquiry
  status             TEXT    NOT NULL DEFAULT 'confirmed' CHECK(status IN ('confirmed','cancelled','pending')),
  source             TEXT    NOT NULL DEFAULT 'online' CHECK(source IN ('online','phone','walkin','admin','form')),
  created_at         TEXT    NOT NULL DEFAULT (datetime('now')),
  emailed            INTEGER NOT NULL DEFAULT 0
);

-- ── Misc income ledger (non-booking revenue: launches, showers, donations) ──
CREATE TABLE IF NOT EXISTS misc_items (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  item_date      TEXT    NOT NULL,
  category       TEXT    NOT NULL,
  description    TEXT,
  amount         REAL    NOT NULL DEFAULT 0,        -- all-in (GST-inclusive)
  gst_amount     REAL    NOT NULL DEFAULT 0,        -- portion within amount (5/105)
  gst_exempt     INTEGER NOT NULL DEFAULT 0,
  payment_method TEXT,
  notes          TEXT,
  created_at     TEXT    NOT NULL DEFAULT (datetime('now'))
);

-- ── Settings ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS park_settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
INSERT OR IGNORE INTO park_settings (key,value) VALUES ('booking_mode','basic');
INSERT OR IGNORE INTO park_settings (key,value) VALUES ('schema_version','2');

-- ── Indexes (cover the hot paths: enquiry lists + the overlap/conflict query) ─
CREATE INDEX IF NOT EXISTS idx_contact_created  ON contact_submissions (created_at);
CREATE INDEX IF NOT EXISTS idx_booking_created  ON booking_submissions (created_at);
CREATE INDEX IF NOT EXISTS idx_res_conflict     ON reservations (site_id, status, check_in, check_out);
CREATE INDEX IF NOT EXISTS idx_res_checkin      ON reservations (check_in);
CREATE INDEX IF NOT EXISTS idx_misc_date        ON misc_items (item_date);

-- ── Seed sites ──────────────────────────────────────────────────────────────
INSERT OR IGNORE INTO sites (id,name,type,max_people,notes) VALUES
  ('C1','Site C1','campsite',6,NULL), ('C2','Site C2','campsite',6,NULL),
  ('C3','Site C3','campsite',6,NULL), ('C4','Site C4','campsite',6,NULL),
  ('C5','Site C5','campsite',6,NULL), ('C6','Site C6','campsite',6,NULL),
  ('C7','Site C7','campsite',6,NULL), ('C8','Site C8','campsite',6,'L-shaped — gazebo nearby'),
  ('C9','Site C9','campsite',6,NULL), ('C10','Site C10','campsite',6,NULL),
  ('C11','Site C11','campsite',6,NULL);
INSERT OR IGNORE INTO sites (id,name,type,active) VALUES
  ('M1','Slip M1','moorage',1), ('M2','Slip M2','moorage',1), ('M3','Slip M3','moorage',1),
  ('M4','Slip M4','moorage',1), ('M5','Slip M5','moorage',1), ('M6','Slip M6','moorage',1),
  ('M7','Slip M7','moorage',1), ('M8','Slip M8','moorage',1), ('M9','Slip M9','moorage',1),
  ('M10','Slip M10','moorage',1), ('BVFD','BVFD Float Garage','reserved',0);
INSERT OR IGNORE INTO sites (id,name,type,active) VALUES
  ('PARKING','Parking Lot','reserved',1),
  ('TRAILER','Trailer Lot','reserved',1),
  ('LAUNCH', 'Boat Launch','reserved',1);
