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

```bash
wrangler d1 execute centennialpark --file=./schema.sql --remote
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
