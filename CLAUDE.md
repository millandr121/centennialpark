# Eileen Scott Centennial Park — System Reference

This file is read automatically by Claude Code at the start of every session.
It is publicly accessible by URL (wrangler.toml serves directory = ".") but contains
no secrets — all credentials live in Cloudflare environment variables.

---

## Objective

Build and maintain a fully operational park management system for Eileen Scott
Centennial Park in Bamfield, BC. Priorities in order:

1. **Reservation system** — online booking form (public), admin management panel (password-gated)
2. **Email notifications** — instant emails to park and guest on booking/contact; daily digest as backup
3. **Financial tracking** — all-in amounts, GST extracted at 5/105, misc income ledger, income reports
4. **Usability** — simple for the park manager; automated where possible; 100% editable/readable
5. **Reliability** — D1 database as durable backup; graceful degradation when services unavailable

The system must remain **simple to operate** even as features grow. Automation is
good; complexity visible to the manager is bad.

---

## Architecture

### Hosting
- **Cloudflare Pages** — auto-deploys from `main` branch on GitHub push
- **Project name**: `bamfieldparks` (wrangler.toml)
- **Repo**: `millandr121/centennialpark` (GitHub)
- **Live URL**: the Pages URL (check Cloudflare dashboard)

### File serving
- `wrangler.toml` sets `directory = "."` → entire repo root is publicly served
- Files at root (README, SETUP.md, schema files, CLAUDE.md) ARE accessible by URL — no secrets in them
- `/admin/` is password-gated via HTTP Basic Auth middleware (`functions/admin/_middleware.js`)
  - Password stored in Cloudflare env var `ADMIN_PASSWORD`

### Database
- **Cloudflare D1** (SQLite) — binding name `DB`
- Tables: `reservations`, `booking_submissions`, `contact_submissions`, `misc_items`
- `sqlite_sequence` — AUTOINCREMENT counters; must be cleared alongside rows on full wipe
- Pre-migration safety: all new columns guarded with `rCols.has(col)` before reads/writes
- Run `schema.sql` first (original), then `schema-items.sql` for the new columns + misc_items table

### Email (Resend)
- **Free tier**: 3,000 emails/month (shared across all API keys on the account)
- **Rate limit**: 5 requests/second (irrelevant at campground scale)
- **No daily limit** — just the monthly cap
- **Over-quota behaviour**: API returns error → D1 still saves the submission → daily digest surfaces it
- **Sending domain**: must be verified in Resend dashboard; until then only `onboarding@resend.dev` → account owner
- Env vars: `RESEND_API_KEY` (secret), `NOTIFY_TO` (park Gmail), `RESEND_FROM` (verified domain address)
- Log retention: visible in Resend dashboard; no auto-purge; logs don't block sending when full

### Cron / daily digest
- Separate Worker in `workers/digest/`
- Runs 15:00 UTC (≈ 8 AM Pacific)
- Emails recap of last 24h submissions to `NOTIFY_TO`
- Can be triggered manually by visiting the Worker URL

---

## Key Files

| File | Purpose |
|------|---------|
| `admin/index.html` | Entire admin panel UI (single file, vanilla JS) |
| `functions/admin/api/reservations.js` | Reservations CRUD + mark-paid + GST |
| `functions/admin/api/items.js` | Misc income items CRUD |
| `functions/admin/api/cleanup.js` | Database wipe (with sqlite_sequence reset) |
| `functions/admin/api/sites.js` | Campsite/moorage definitions |
| `functions/admin/api/stats.js` | Dashboard summary stats |
| `functions/api/booking.js` | Public booking form POST handler |
| `functions/api/contact.js` | Public contact form POST handler |
| `schema.sql` | Original DB schema |
| `schema-items.sql` | Migration: adds gst_exempt, paid_at, misc_items table |
| `workers/digest/` | Daily digest cron Worker |
| `SETUP.md` | Step-by-step deployment guide |

---

## Admin Panel Tabs

- **Reservations** — all bookings; mark paid/unpaid; edit; delete; email guest
- **Submissions** — raw form submissions (unprocessed enquiries)
- **Add** — sub-tabs: Booking (manual entry) | Misc Item (non-booking income)
- **Reports** — sub-tabs: Bookings (filter/print) | Income & GST (period report, CSV export)
- **Settings** — site editor; danger zone (wipe DB scopes); admin docs link

---

## GST Rules

- All amounts are **all-in** (GST included, not added on top)
- GST portion = `amount × 5 / 105` (5% GST-inclusive extraction)
- `gst_exempt = 1` → GST amount forced to 0
- Guest pays one number; park remits 5/105 of that to CRA
- `paid_at` timestamp stamped when reservation is marked paid (income counted by receipt date)

---

## Booking Types & Conflict Logic

- **campsite / moorage** → exclusive; date-conflict check enforced
- **reserved** type lots → allow concurrent bookings (e.g. day-use areas)
- `isExclusive(type)` function controls this in reservations.js

---

## Reference Numbers

- IDs are SQLite AUTOINCREMENT — normally keep counting up after deletes
- Database wipe (`cleanup.js`) also clears `sqlite_sequence` so IDs restart from 1
- Partial wipes (single table) also reset that table's sequence counter

---

## Known Limits & Watchpoints

| Service | Limit | Current risk |
|---------|-------|-------------|
| Resend emails | 3,000/month free | Low — campground volume ~200-400/season |
| D1 reads | 5M/day free | None — tiny dataset |
| D1 writes | 100K/day free | None |
| Cloudflare Pages builds | 500/month free | None |
| GitHub Actions (if used) | 2,000 min/month free | N/A |

---

## Environment Variables (Cloudflare)

Set in: Cloudflare dashboard → Workers & Pages → centennialpark → Settings → Environment variables

| Variable | Type | Value |
|----------|------|-------|
| `ADMIN_PASSWORD` | Secret | Park admin login password |
| `RESEND_API_KEY` | Secret | From Resend dashboard |
| `NOTIFY_TO` | Plain | `bamfieldcentennialpark@gmail.com` |
| `RESEND_FROM` | Plain | `Centennial Park <noreply@your-verified-domain>` |
| `DB` | D1 Binding | `centennialpark` database |

---

## Troubleshooting

**Forms show "please email us directly"**
→ Both Resend AND D1 failed simultaneously. Check: DB binding set? RESEND_API_KEY set? Redeployed after adding env vars?

**Emails not arriving**
→ Check Resend dashboard for send logs. Verify domain setup. Check monthly quota. Daily digest still runs as backup.

**Admin panel login fails**
→ ADMIN_PASSWORD env var missing or wrong. Set it in Cloudflare dashboard and redeploy.

**Reference numbers not resetting after wipe**
→ Old wipe code didn't clear sqlite_sequence. Ensure cleanup.js version post-PR#6 is deployed.

**New columns (gst_exempt, paid_at, misc_items) not working**
→ Run `schema-items.sql` in D1 console: Cloudflare dashboard → D1 → centennialpark → Console → paste file contents.

**Booking conflict check not firing**
→ Check `isExclusive(type)` in reservations.js. Only campsite/moorage types block overlaps.

---

## Park Information

### Location
Eileen Scott Centennial Park, Bamfield, BC

### Contact
Email: bamfieldcentennialpark@gmail.com

### Campsites
*(Fill in site details here — number, size, power/water hookups, max RV length, etc.)*

### Moorage
*(Fill in number of slips, size limits, tidal considerations, etc.)*

### Parking
*(Fill in day-use parking spots, overnight rules, etc.)*

### Launch
*(Fill in boat launch details, fees, hours, etc.)*

### Pricing
*(Fill in current rate schedule — nightly camping, moorage per night, launch fee, etc.)*

### Season
*(Fill in open/close dates, shoulder season rules, etc.)*

---

## Development Notes

- All API changes must maintain backward compatibility via `rCols.has(col)` guards
- Never commit secrets or API keys — use Cloudflare env vars only
- Schema changes go in numbered migration files; document the manual D1 console step in SETUP.md
- Test admin panel locally with `wrangler pages dev` if needed
- Branch convention: `claude/description-XXXXX` for AI-driven feature branches
