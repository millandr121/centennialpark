-- Migration: add performance indexes to the EXISTING production database.
-- Safe to re-run (IF NOT EXISTS). Run in the Cloudflare D1 console or:
--   wrangler d1 execute centennialpark --file=./schema-indexes.sql --remote
--
-- idx_res_conflict covers the overlap/availability query that runs on every
-- booking and every availability check (site_id, status, check_in, check_out).

CREATE INDEX IF NOT EXISTS idx_res_conflict ON reservations (site_id, status, check_in, check_out);
CREATE INDEX IF NOT EXISTS idx_res_checkin  ON reservations (check_in);

-- Record the schema version so future migrations have a baseline to check.
INSERT OR IGNORE INTO park_settings (key,value) VALUES ('schema_version','2');
