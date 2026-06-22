-- Live-booking tables. Run after schema.sql:
--   wrangler d1 execute centennialpark --file=./schema-v2.sql --remote

CREATE TABLE IF NOT EXISTS sites (
  id          TEXT    PRIMARY KEY,
  name        TEXT    NOT NULL,
  type        TEXT    NOT NULL CHECK(type IN ('campsite','moorage','reserved')),
  description TEXT,
  max_people  INTEGER,
  max_length  INTEGER,   -- boat feet (moorage only)
  notes       TEXT,
  active      INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS reservations (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  site_id     TEXT    NOT NULL REFERENCES sites(id),
  check_in    TEXT    NOT NULL,   -- YYYY-MM-DD
  check_out   TEXT    NOT NULL,   -- YYYY-MM-DD (departure day)
  guest_name  TEXT    NOT NULL,
  guest_email TEXT    NOT NULL,
  guest_phone TEXT,
  party_size  INTEGER,
  boat_length INTEGER,
  notes       TEXT,
  status      TEXT    NOT NULL DEFAULT 'confirmed' CHECK(status IN ('confirmed','cancelled','pending')),
  source      TEXT    NOT NULL DEFAULT 'online'    CHECK(source IN ('online','phone','walkin','admin')),
  created_at  TEXT    NOT NULL DEFAULT (datetime('now')),
  emailed     INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS park_settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

-- Defaults
INSERT OR IGNORE INTO park_settings (key,value) VALUES ('booking_mode','form');

-- ── Campsites ──────────────────────────────────────────────────────────────
INSERT OR IGNORE INTO sites (id,name,type,max_people,notes) VALUES
  ('C1', 'Site C1',  'campsite',6,NULL),
  ('C2', 'Site C2',  'campsite',6,NULL),
  ('C3', 'Site C3',  'campsite',6,NULL),
  ('C4', 'Site C4',  'campsite',6,NULL),
  ('C5', 'Site C5',  'campsite',6,NULL),
  ('C6', 'Site C6',  'campsite',6,NULL),
  ('C7', 'Site C7',  'campsite',6,NULL),
  ('C8', 'Site C8',  'campsite',6,'L-shaped — gazebo nearby'),
  ('C9', 'Site C9',  'campsite',6,NULL),
  ('C10','Site C10', 'campsite',6,NULL),
  ('C11','Site C11', 'campsite',6,NULL);

-- ── Moorage slips ─────────────────────────────────────────────────────────
INSERT OR IGNORE INTO sites (id,name,type,active) VALUES
  ('M1', 'Slip M1',  'moorage',1),
  ('M2', 'Slip M2',  'moorage',1),
  ('M3', 'Slip M3',  'moorage',1),
  ('M4', 'Slip M4',  'moorage',1),
  ('M5', 'Slip M5',  'moorage',1),
  ('M6', 'Slip M6',  'moorage',1),
  ('M7', 'Slip M7',  'moorage',1),
  ('M8', 'Slip M8',  'moorage',1),
  ('M9', 'Slip M9',  'moorage',1),
  ('M10','Slip M10', 'moorage',1),
  ('BVFD','BVFD Float Garage','reserved',0);
