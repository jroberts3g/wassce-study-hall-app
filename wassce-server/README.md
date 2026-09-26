# WASSCE Study Hall — Backend

Runs alongside the `wassce-frontend` folder next to this one — see the
top-level SETUP.md one level up for how to start both together.

Real, runnable Express + SQLite backend for the prototype: signup/login,
the WAEC subject catalog, subscriptions, Modem Pay checkout, and the
webhook that activates access after payment.

Tested end to end (signup → login → checkout → simulated webhook →
active subscription → subscription-gated assessment write → history
read) before being handed over — see "Try it in 60 seconds" below.

## Quick start

Requires **Node.js 22.5 or later** (uses Node's built-in `node:sqlite` —
no native compilation, no build tools needed).

```bash
npm install
cp .env.example .env      # Windows Command Prompt: copy .env.example .env
npm run dev
```

You'll see one harmless line on startup: `ExperimentalWarning: SQLite is an experimental feature`. That's expected — the feature works fine,
Node just flags it because the API hasn't been marked fully stable yet.

The server starts on `http://localhost:3001` even with an empty `.env`.
With no `MODEMPAY\\\\\\\\\\\\\\\_API\\\\\\\\\\\\\\\_KEY` set, it runs in **mock mode**: checkout still
returns a payment link and the whole activation flow works, but no real
Modem Pay API calls happen. Add real credentials from your Modem Pay
merchant dashboard whenever you're ready to go live — nothing else in
the code needs to change.

## Try it in 60 seconds

```bash
# 1. Sign up
curl -X POST localhost:3001/auth/signup -H "Content-Type: application/json" \\\\\\\\\\\\\\\\
  -d '{"name":"Fatou Jallow","email":"fatou@example.com","password":"studyhard123"}'
# copy the "token" from the response

TOKEN="<paste token here>"

# 2. Start checkout for a subject
curl -X POST localhost:3001/subscriptions/math/checkout -H "Authorization: Bearer $TOKEN"
# copy the "paymentId"

# 3. In mock mode, simulate Modem Pay's webhook locally (dev-only route)
curl -X POST localhost:3001/dev/simulate-webhook -H "Authorization: Bearer $TOKEN" \\\\\\\\\\\\\\\\
  -H "Content-Type: application/json" -d '{"paymentId":"<paste paymentId>","outcome":"succeed"}'

# 4. Confirm it's active
curl localhost:3001/subscriptions -H "Authorization: Bearer $TOKEN"
```

## What's real vs. what to finish before production

**Real and working:**

* Signup/login with bcrypt-hashed passwords and JWTs
* The full 23-subject WAEC/WASSCE catalog (`src/data/subjects.js`)
* Subscription state machine and 30-day expiry math
* **Configurable subscription price** — stored in the database
(`settings` table), not hardcoded. `GET /settings` is public (the
frontend needs it to display the price); `PUT /settings/subscription-price`
is admin-protected via an `ADMIN\\\\\\\\\\\\\\\_SECRET` you set in `.env`, sent as
an `X-Admin-Secret` header. Checkout reads the price fresh on every
request, so a change takes effect immediately with no restart. The
frontend's Settings panel has a built-in form for this.
* Modem Pay Payment Intent creation, matching their documented
`POST /v1/payments` request/response shape
([docs](https://docs.modempay.com/documentation/payment-intents/create))
* Webhook receiver with raw-body HMAC signature verification
* Access control: `POST /assessments` is rejected with 403 if the
student doesn't have an active subscription for that subject, even
though the frontend also hides the option — never trust the client
alone for this

**Also real:** `/ai/complete` proxies to the real Anthropic API using
your own `ANTHROPIC\\\\\\\\\\\\\\\_API\\\\\\\\\\\\\\\_KEY` (get one at console.anthropic.com), so
the standalone frontend never holds that key itself. Same mock-mode
pattern as Modem Pay: leave it blank and the study guide gives clearly
labelled placeholder responses instead of failing outright.

**Needs your attention before this touches real money:**

1. **Confirm the webhook signature algorithm.** Modem Pay's PHP SDK
exposes a `webhooks()->composeEventDetails(payload, signature, secret)`
helper and sends an `X-Modempay-Signature` header, which points at
the standard "HMAC-SHA256 of the raw body, hex-encoded" pattern
implemented in `src/services/modempay.service.js` — but this wasn't
spelled out in their public docs at the time this was written.
Before going live, either test against their **Webhook Tester CLI**
(`modempay listen --forward-url=...`) or check the official Node SDK
(`modem-pay` on npm) source for the exact algorithm, and adjust
`verifyWebhookSignature` if it differs. Nothing else needs to change.
2. **Swap SQLite for Postgres** for anything beyond a prototype/single
instance — the schema in `src/db.js` is plain SQL and ports over
directly.
3. **Set a real `JWT\\\\\\\\\\\\\\\_SECRET`** and put `.env` in your secrets manager,
never in source control.
4. **Set `NODE\\\\\\\\\\\\\\\_ENV=production`** in your deployment — this disables
the `/dev/simulate-webhook` route, which has no business existing
outside local development.
5. **Rate-limit and CAPTCHA `/auth/signup`** before opening this to
the public internet.
6. Add a scheduled job (or a queue) if you later want to *push*
renewal reminders (SMS/email/push) 5 days before expiry, rather
than only showing the banner when the student opens the app.

## API reference

|Method|Path|Auth|Purpose|
|-|-|-|-|
|POST|`/auth/signup`|—|Create an account, returns a JWT|
|POST|`/auth/login`|—|Returns a JWT|
|GET|`/auth/me`|✓|Current user's profile|
|GET|`/subjects`|—|Full subject/topic catalog|
|GET|`/subscriptions`|✓|My subscriptions with computed active/expired status|
|POST|`/subscriptions/:subjectId/checkout`|✓|Creates a Modem Pay Payment Intent, returns `paymentLink`|
|GET|`/subscriptions/payments/:paymentId`|✓|Polls a payment's status (webhook fallback)|
|POST|`/webhooks/modempay`|signature|Modem Pay calls this on payment events|
|POST|`/assessments`|✓|Record a quiz score (403 without an active subscription)|
|GET|`/assessments/:subjectId`|✓|Score history (available even after expiry)|
|POST|`/dev/simulate-webhook`|✓|**Dev only** — fake a successful/failed payment locally|

All authenticated routes expect `Authorization: Bearer <token>`.

## Project layout

```
src/
  index.js                    Express app + route mounting
  db.js                       SQLite schema (users, subscriptions, payments, assessments)
  data/subjects.js            WAEC/WASSCE subject + topic catalog
  middleware/auth.js          JWT sign/verify
  services/modempay.service.js   Modem Pay API calls + webhook signature check
  services/subscription.service.js  Activation/expiry business logic
  routes/\\\\\\\\\\\\\\\*.routes.js          One file per resource
```

## Lecture Hall (Grades 1–9) alongside WASSCE Study Hall (Grades 10–12)

The subject catalog now spans grade **bands**, not just Senior
Secondary. `BANDS` in `src/data/subjects.js` defines four: Lower
Primary (G1-3), Upper Primary (G4-6), Upper Basic (G7-9), Senior
Secondary (G10-12) — matching Gambia's MoBSE Curriculum Framework for
Basic Education (2011).

Each subject's `topicsByBand` object only has keys for the bands it's
actually taught in. Most WASSCE electives (Biology, Economics, etc.)
only have a `senior-secondary` key, unchanged from before. A few core
subjects (Mathematics, English Language, French) span all four bands
— with a **completely different topic list per band**, not the same
topics made harder, since that's how the real curriculum works.
Four subjects exist only at the Basic Education level and don't
carry into WASSCE (Integrated Studies, Science, Social and
Environmental Studies, Arabic) — these are Lecture Hall-only.

**Subscriptions don't change** — one subscription per subject-id still
unlocks everything for that subject, at whatever band the student is
studying. A Grade 4 and a Grade 11 student subscribed to "Mathematics"
and "English Language" respectively just see different topic lists.

**Assessments now carry a `band`** column, since the same subject/topic
namespace differs by band (`POST /assessments` accepts an optional
`band` field, defaulting to `senior-secondary` for backward
compatibility; `GET /assessments/:subjectId` accepts an optional
`?band=` filter).

**Reading list**: each subject has a `readingList: \\\\\\\\\\\\\\\[]` array, empty by
default. There's no admin UI for this yet — populate it by hand in
`src/data/subjects.js` as you curate recommended textbooks per
subject: `{ title, author, note }`.

## A note on the subject catalog

`src/data/subjects.js` covers the WASSCE core subjects plus a realistic
spread of Science, Arts and Commercial electives (23 subjects total),
each with a representative topic list. This is a strong starting
scaffold, not a certified transcription of any single WAEC country
office's syllabus — core-subject naming in particular varies slightly
between Nigeria, Ghana and Gambia's offices. Validate each subject's
topic tree against the current syllabus PDF from WAEC's Gambia office
before launch, and bump `syllabusVersion` when you do.

