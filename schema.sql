-- D1 schema for Centennial Park form submissions.
-- Apply with:  wrangler d1 execute centennialpark --file=./schema.sql --remote

CREATE TABLE IF NOT EXISTS contact_submissions (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  created_at  TEXT    NOT NULL DEFAULT (datetime('now')),
  name        TEXT,
  email       TEXT,
  subject     TEXT,
  message     TEXT,
  emailed     INTEGER NOT NULL DEFAULT 0,   -- 1 once the notification email was sent
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
  emailed              INTEGER NOT NULL DEFAULT 0,
  ip                   TEXT,
  user_agent           TEXT
);

CREATE INDEX IF NOT EXISTS idx_contact_created ON contact_submissions (created_at);
CREATE INDEX IF NOT EXISTS idx_booking_created ON booking_submissions (created_at);
