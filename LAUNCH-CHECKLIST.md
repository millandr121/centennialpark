# Production Launch Checklist — Eileen Scott Centennial Park

Sign-off document for taking `bamfieldparks.com` live. **Nothing below is assumed
verified** — each item must be checked and initialled. Legend:

- ✅ **In repo** — implemented in code; still verify it behaves on the live URL.
- ☐ **Action** — you must do/verify this (mostly Cloudflare/Resend dashboard).
- ⚠️ **Gap/risk** — known limitation; accept or fix before sign-off.
- ➖ **N/A** — not applicable to this site, with reason.

---

## 🔴 BLOCKERS — do not launch until these are green

1. ☐ **Email sender is a VERIFIED domain, not the sandbox.** Both the Pages env
   `RESEND_FROM` and `workers/digest/wrangler.toml` currently default to
   `onboarding@resend.dev`. That sandbox address **only delivers to the Resend
   account owner** — guest confirmation emails will silently NOT reach guests.
   → Verify a sending domain in Resend, set `RESEND_FROM` to e.g.
   `Eileen Scott Centennial Park <noreply@bamfieldparks.com>` in **both** the
   Pages project env (Production) **and** the digest worker, then send a real
   test booking and confirm the guest copy arrives.
2. ☐ **`TURNSTILE_SECRET` is set** (Pages → Settings → Variables, Production).
   Without it the bot check fails *open* and forms can be scripted.
3. ☐ **Rate-limiting rules exist** (Cloudflare → Security → WAF → Rate limiting):
   `/api/*` ≈ 5 req/min/IP, `/admin/*` ≈ 15 req/min/IP. Not in code — dashboard only.
4. ☐ **Strong `ADMIN_PASSWORD` set** (code fails closed 503 if unset, but a weak
   value is brute-forceable). Ideally also put **Cloudflare Access** in front of `/admin`.
5. ☐ **Digest worker deployed** (`cd workers/digest && wrangler deploy`) with
   `RESEND_API_KEY` set as a secret (`wrangler secret put RESEND_API_KEY`). The
   daily heartbeat + monthly backup do NOT run until this is deployed.

---

## Environment variables
- ☐ Pages (Production): `ADMIN_PASSWORD`, `RESEND_API_KEY`, `NOTIFY_TO`,
  `RESEND_FROM` (verified domain — see blocker #1), `TURNSTILE_SECRET`.
- ☐ `DB` D1 binding present on the Pages project.
- ☐ Digest worker: `RESEND_API_KEY` (secret), `NOTIFY_TO`, `RESEND_FROM`, `DB` binding.
- ⚠️ `NOTIFY_TO` mismatch: worker config uses `andrewglennmiller@gmail.com`;
  CLAUDE.md expects `bamfieldcentennialpark@gmail.com`. Confirm which inbox should
  receive notifications and align Pages + worker.

## DNS
- ☐ `bamfieldparks.com` (and `www`) resolve to the Pages project (custom domain attached, active).
- ☐ Resend domain records (SPF / DKIM / DMARC TXT) present and "Verified" in Resend.
- ☐ Apex/`www` redirect behaves (pick canonical — site canonical is `https://bamfieldparks.com/`).

## Cloudflare
- ☐ Pages project `bamfieldparks` builds from `main` (auto-deploy on push).
- ☐ D1 database bound and **schema applied** (tables exist on the prod DB — run
  `wrangler d1 execute centennialpark --remote --command "SELECT name FROM sqlite_master WHERE type='table'"`).
- ☐ Digest worker shows its cron trigger `0 15 * * *` (≈ 8 AM Pacific) as active.

## SSL / TLS
- ☐ Universal SSL active; site loads over HTTPS with a valid cert.
- ☐ "Always Use HTTPS" on; Minimum TLS ≥ 1.2.

## HSTS
- ✅ Header in `_headers`: `max-age=31536000; includeSubDomains`.
- ☐ Confirm it appears on a live response (`curl -sI https://bamfieldparks.com | grep -i strict`).
- ⚠️ No `preload` directive — fine; only add + submit to hstspreload.org if you want preload.

## Security headers
- ✅ In `_headers`: `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`,
  `Referrer-Policy: strict-origin-when-cross-origin`,
  `Permissions-Policy: camera=(), microphone=(), geolocation=()`, HSTS, and a CSP.
- ✅ CSP allowlists exactly: self, Turnstile, Google Fonts, OSM tiles, OSRM,
  Overpass, current image hosts, Cloudflare Insights. (Fixed in PR #9 after the
  initial CSP blocked the map route APIs.)
- ☐ Verify on live with [securityheaders.com](https://securityheaders.com) — target A/A+.
- ☐ Spot-check the maps + a form submit on the LIVE site (CSP regressions only show in a browser).

## robots.txt
- ✅ Present: allows all, disallows `/admin/`, links the sitemap.
- ☐ Reachable at `https://bamfieldparks.com/robots.txt`.

## Sitemap
- ✅ `sitemap.xml` present and referenced by robots.txt.
- ☐ Reachable on live; submit in Google Search Console.
- ⚠️ `<lastmod>` is hardcoded (`2026-06-30`) — update on significant content changes.

## Backups
- ✅ Monthly D1 CSV backup emailed by the digest worker (1st of month, or `?backup=1`).
- ☐ After deploying the worker, trigger `?backup=1` once and confirm the CSV
  attachments arrive. Save them somewhere durable (Drive).
- ☐ Decide who keeps the backups (tax records — keep ~6 years).

## Logging
- ✅ Functions/worker log on failures (`console.error/warn`); forms degrade gracefully.
- ☐ Know where to read them: Pages → deployment → Functions (real-time), or
  `wrangler tail`. ⚠️ Logs are ephemeral (not retained) — no external log store.

## Error monitoring
- ✅ `/api/health` (200/503); digest flags un-emailed rows with ⚠️; daily heartbeat
  means a *missing* digest signals a broken cron.
- ⚠️ No external error tracker (Sentry etc.). Acceptable at this scale; revisit if needed.
- ☐ Set an uptime monitor (below) so an outage actually pages someone.

## Analytics
- ⚠️ Not enabled. Recommend **Cloudflare Web Analytics** (free, cookieless, already
  allowed by the CSP). ☐ Enable in dashboard; no code change needed.

## Performance
- ✅ Lazy-loaded maps/images, preconnect/preload for the LCP image, self-hosted
  Leaflet, edge-cache headers, conditional script loading.
- ☐ Run PageSpeed/Lighthouse on the live URL; confirm LCP/CLS are healthy.
- ⚠️ See image optimization.

## Image optimization
- ⚠️ **Deferred (intentional).** Hero + slideshow images are still hotlinked from
  `bamfieldparks.com` (metered, third-party) and Unsplash. Not resized/WebP/AVIF.
  Hero has `width/height` + `fetchpriority`; others lazy-load. Migrate to local/R2
  when photos are ready (perf + cost + longevity win). Known issue, not a blocker.

## Video optimization
- ➖ N/A — the site uses no `<video>`/`<audio>`; the "slideshow" is CSS background images.

## Email
- ☐ Blocker #1 (verified sender). Then send: a booking inquiry, a contact message,
  and (if used) a live reservation — confirm BOTH the park copy and the guest copy
  arrive and are not in spam.
- ☐ Confirm Resend monthly quota headroom (3,000/mo; ~2 emails per submission).

## Uploads
- ➖ N/A — there are no file-upload inputs anywhere on the site.

## Storage
- ✅ D1 only (no R2/KV). Tiny dataset, well within 5 GB free.
- ☐ Confirm D1 schema/migrations applied on prod (see Cloudflare section).

## API monitoring / Health checks
- ✅ `GET /api/health` → 200 when app + DB healthy, 503 otherwise (leaks nothing).
- ☐ Point an uptime monitor (UptimeRobot/Better Stack, free) at
  `https://bamfieldparks.com/api/health`, alert on non-200, 5-min interval.

## Disaster recovery
- ✅ Code recoverable from git; D1 is managed/durable; monthly CSV backups.
- ☐ Write down the recovery steps: restore from the latest backup CSVs, redeploy
  from `main`, re-run schema if needed. Informal RPO ≈ 1 month (backups) / RTO ≈ minutes (redeploy).
- ☐ **Domain auto-renew ON** at the registrar (a lapse takes down site + email).

## Rate limiting
- ☐ Blocker #3 — WAF rate-limiting rules on `/api/*` and `/admin/*`.

## Bot protection
- ✅ Cloudflare Turnstile on all public forms (site key in HTML).
- ☐ Blocker #2 — `TURNSTILE_SECRET` set so verification actually enforces.

## Feature flags
- ✅ `booking_mode` in `park_settings` switches the public booking UI
  (`form` | `basic` | `live`); defaults to `form` if unset.
- ☐ Confirm it's set to the intended launch mode (likely `form` or `basic` —
  inquiry-style, since bookings are handled manually at launch).

## Maintenance mode
- ⚠️ None implemented. A custom **404** exists, but there's no 503 "we'll be right
  back" toggle. Low need at this scale; note as an accepted gap or add later.

## CI/CD
- ✅ GitHub Actions (`.github/workflows/ci.yml`) runs `node --test` on push to
  `main` and on PRs. Cloudflare Pages auto-deploys `main`.
- ⚠️ The **digest worker deploys manually** (not in CI) — remember to redeploy it
  when `workers/digest` changes.
- ☐ Confirm the latest `main` CI run is green.

## Deployment rollback
- ✅ Cloudflare Pages keeps deployment history → "Rollback to this deployment".
- ☐ Confirm you can find the Rollback button; alternatively `git revert` + push.

## Dependencies
- ✅ **No runtime npm dependencies** (vanilla JS). Only third-party runtime code is
  Leaflet **1.9.4**, self-hosted and pinned (`js/vendor/leaflet`).
- ☐ Note a reminder to check for Leaflet security advisories at upgrade time.
- ✅ `package.json` has no production deps; build is a no-op (static + Functions).

## Licenses
- ✅ Leaflet — BSD-2-Clause; copyright header retained in `leaflet.js`. OSM/CARTO
  attribution shown on the maps.
- ✅ Google Fonts (Inter/Syne/Bricolage/Caveat) — open licenses (OFL/Apache).
- ⚠️ Unsplash images — free license, attribution appreciated; removed once images
  are migrated to local park photos.

## Known issues (accepted at launch)
- Images hotlinked from `bamfieldparks.com`/Unsplash (migration deferred).
- Digest worker deploys manually; no external error tracker; no maintenance-mode page.
- Admin uses HTTP Basic Auth (no MFA unless Cloudflare Access is added).
- No automated pruning of old raw submissions yet (admin list has a recent-window default).
- Defensive schema-fallback code remains until the live D1 schema is reconciled.

---

## Sign-off

| Area | Verified by | Date |
|------|-------------|------|
| Blockers (1–5) all green | | |
| Env vars / DNS / Cloudflare / SSL | | |
| Security (headers, CSP, rate limit, bot, admin) | | |
| Email send + receive (real test) | | |
| Backups + monitoring + health check | | |
| Maps + forms spot-checked on LIVE URL | | |

**Approved for production:** ____________________  **Date:** __________
