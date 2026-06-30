# Form delivery setup (D1 + email + daily digest)

The booking and contact forms POST to Cloudflare Pages Functions in
`functions/api/`. Each submission is **saved to a D1 database** (durable
backup) **and emailed** to the park Gmail via [Resend](https://resend.com).
A separate cron Worker emails a **daily digest** as a safety net.

Until the steps below are done the forms stay in fallback mode ("please email
us directly") — nothing breaks, they just don't deliver yet.

---

## 1. Create the D1 database

```bash
npm install -g wrangler        # if needed
wrangler login
wrangler d1 create centennialpark
```

Copy the `database_id` it prints.

## 2. Create the tables

For a **fresh database**, apply the canonical consolidated schema (it merges
every migration into one idempotent file and adds the performance indexes):

```bash
wrangler d1 execute centennialpark --file=./schema-full.sql --remote
```

For the **existing production database**, keep using the numbered migrations.
If you haven't yet added the conflict/performance indexes, run:

```bash
wrangler d1 execute centennialpark --file=./schema-indexes.sql --remote
```

## 3. Set up Resend (email sending)

1. Sign up at https://resend.com (free tier = 3,000 emails/month).
2. **Add & verify a sending domain** (e.g. `centennialpark.ca`) — follow their
   DNS steps. Until a domain is verified you can only send test emails from
   `onboarding@resend.dev` to the address that owns the Resend account.
3. Create an **API key** (Resend dashboard → API Keys).

## 4. Bind everything to the Pages project

In the Cloudflare dashboard → **Workers & Pages → centennialpark → Settings**:

- **Functions → D1 database bindings**: add
  - Variable name: `DB`
  - D1 database: `centennialpark`
- **Environment variables / Secrets** (Production *and* Preview):
  - `RESEND_API_KEY` = *your Resend key* (mark as **secret / encrypt**)
  - `NOTIFY_TO` = `bamfieldcentennialpark@gmail.com`
  - `RESEND_FROM` = `Centennial Park <noreply@your-verified-domain>`

Redeploy (or push a commit) so the bindings take effect. The forms now store
to D1 and email instantly.

## 5. Deploy the daily digest Worker (safety net)

```bash
cd workers/digest
# edit wrangler.toml: paste the database_id from step 1
wrangler secret put RESEND_API_KEY      # paste the same Resend key
wrangler deploy
```

The cron runs once a day (15:00 UTC ≈ 8 AM Pacific) and emails a recap of the
last 24h. Visit the Worker's URL in a browser to trigger it manually for a test.

---

## Reading submissions any time

```bash
wrangler d1 execute centennialpark --remote \
  --command "SELECT created_at, first_name, last_name, email FROM booking_submissions ORDER BY created_at DESC LIMIT 50"

wrangler d1 execute centennialpark --remote \
  --command "SELECT created_at, name, email, subject FROM contact_submissions ORDER BY created_at DESC LIMIT 50"
```

## How resilient is it?

- **Email + DB both succeed** → you get the email, and it's logged.
- **Email fails, DB ok** → form still reports success, data is safe in D1, and
  the daily digest surfaces it.
- **DB unbound, email ok** → you still get the live email.
- **Both fail** → the form shows "please email/call us directly" so the visitor
  isn't left thinking it went through.

---

## Security checklist (do before going public)

These two are **infrastructure** (Cloudflare dashboard), not code — the code
fixes are already in the repo. They gate launch:

1. **Set `TURNSTILE_SECRET`** (Cloudflare → Pages → Settings → Variables, both
   Production and Preview). Without it the bot check fails *open* and the public
   forms can be scripted (spam, fake bookings that block availability, and
   exhaustion of the 3,000/month Resend quota). Pair it with the public
   `data-sitekey` already in the HTML.

2. **Add Rate Limiting rules** (Cloudflare → Security → WAF → Rate limiting).
   Suggested:
   - `POST /api/reserve`, `/api/booking`, `/api/contact` → **5 requests / minute / IP**, action: Managed Challenge or Block.
   - `/admin/*` → **15 requests / minute / IP**, action: Block (slows password brute-force; Basic Auth has no lockout).

3. **Set a strong `ADMIN_PASSWORD`.** The admin middleware now fails *closed*
   (503) if it's unset — but a weak value is still brute-forceable without (2).
   Best option: put Cloudflare Access in front of `/admin` for real MFA.

Already handled in code: admin fails closed, CSRF Origin check on admin
mutations, internal files & server source are 404'd, HSTS header, no DB error
text leaked to anonymous callers, GST/overlap single-sourced, atomic
double-booking guard, e-mail subjects CR/LF-stripped, admin-panel link removed
from notification emails, `/api/settings` key-allowlisted.
