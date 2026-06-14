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
  need_campsite        TEXT,
  need_moorage         TEXT,
  site_count           TEXT,
  group_size           TEXT,
  boat_length          TEXT,
  check_in             TEXT,
  check_out            TEXT,
  additional_requests  TEXT,
  emailed              INTEGER NOT NULL DEFAULT 0,
  ip                   TEXT,
  user_agent           TEXT
);

CREATE INDEX IF NOT EXISTS idx_contact_created ON contact_submissions (created_at);
CREATE INDEX IF NOT EXISTS idx_booking_created ON booking_submissions (created_at);
