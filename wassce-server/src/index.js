require("dotenv").config();
const express = require("express");
const cors = require("cors");

const db = require("./db"); // creates tables on first run (async — see db.ready below)
const modempay = require("./services/modempay.service");
const anthropic = require("./services/anthropic.service");
const renewalReminders = require("./jobs/renewalReminders.job");

const authRoutes = require("./routes/auth.routes");
const subjectsRoutes = require("./routes/subjects.routes");
const subscriptionsRoutes = require("./routes/subscriptions.routes");
const assessmentsRoutes = require("./routes/assessments.routes");
const diagramsRoutes = require("./routes/diagrams.routes");
const furtherReadingRoutes = require("./routes/further-reading.routes");
const booksRoutes = require("./routes/books.routes");
const webhooksRoutes = require("./routes/webhooks.routes");
const aiRoutes = require("./routes/ai.routes");
const settingsRoutes = require("./routes/settings.routes");

const app = express();

/**
 * trust proxy: express-rate-limit (and req.ip generally) needs this
 * to correctly identify the real client IP when this server sits
 * behind a reverse proxy / load balancer in production (Render,
 * Railway, Nginx, etc. all add an X-Forwarded-For header). Left
 * unset, one of two bad things happens: every request appears to
 * come from the proxy's own IP (all users share one rate-limit
 * bucket — a few real signups could lock everyone out), or newer
 * express-rate-limit versions throw a validation error when they see
 * X-Forwarded-For without trust proxy configured.
 *
 * We deliberately do NOT default this to `true` (trust everything) —
 * that would let any direct attacker spoof X-Forwarded-For and dodge
 * rate limits entirely. Instead, TRUST_PROXY names exactly how many
 * proxy hops are in front of this server (usually 1), set only when
 * actually deployed behind one. Leave it unset for local development
 * and any direct (proxy-less) deployment.
 */
if (process.env.TRUST_PROXY) {
  app.set("trust proxy", Number(process.env.TRUST_PROXY));
}

const corsOrigin = process.env.CORS_ORIGIN || "*";

// Recent Chrome/Edge versions treat 127.0.0.1/localhost as a
// "private network" and require a server to explicitly opt in
// before a page from the public internet (like the chat you're
// running this frontend from) is allowed to call it — otherwise the
// request is silently blocked with no visible error. This header,
// combined with letting cors() answer the OPTIONS preflight below,
// is that opt-in. Safe to leave on for local development; a real
// production deployment wouldn't be sitting on a private IP anyway.
app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Private-Network", "true");
  next();
});

app.use(cors({ origin: corsOrigin === "*" ? true : corsOrigin.split(",") }));

// Webhooks need the raw body for signature verification, so this is
// mounted BEFORE express.json() and given its own raw parser.
app.use("/webhooks", express.raw({ type: "*/*" }), webhooksRoutes);

app.use(express.json());

app.get("/health", (req, res) => {
  res.json({
    ok: true,
    modempayMode: modempay.isMockMode() ? "mock" : "live",
    anthropicMode: anthropic.isMockMode() ? "mock" : "live",
  });
});

app.use("/auth", authRoutes);
app.use("/subjects", subjectsRoutes);
app.use("/subscriptions", subscriptionsRoutes);
app.use("/assessments", assessmentsRoutes);
app.use("/diagrams", diagramsRoutes);
app.use("/further-reading", furtherReadingRoutes);
app.use("/books", booksRoutes);
app.use("/ai", aiRoutes);
app.use("/settings", settingsRoutes);

// /dev routes (including /dev/simulate-webhook, which lets a logged-in
// user activate their OWN subscription without paying — a direct
// revenue-bypass if ever reachable for real) are gated on TWO
// independent signals, not just NODE_ENV. NODE_ENV alone isn't safe
// enough here: it's been observed running in this exact deployment
// with Modem Pay in LIVE mode while NODE_ENV was still unset/dev —
// a single missed env var away from exposing this. Requiring "Modem
// Pay is in mock mode" as a second, independent condition means dev
// routes can never be active at the same time real payment
// credentials are — regardless of what NODE_ENV happens to be.
const devRoutesEnabled = process.env.NODE_ENV !== "production" && modempay.isMockMode();

if (devRoutesEnabled) {
  app.use("/dev", require("./routes/dev.routes"));
}

app.use((req, res) => {
  res.status(404).json({ error: "Not found" });
});

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: "Internal server error" });
});

const PORT = process.env.PORT || 3001;

// Postgres migration is async (unlike the old SQLite version), so we
// wait for it before accepting any request — otherwise the very
// first requests after a cold start could race the CREATE TABLE
// statements and hit "relation does not exist" errors.
db.ready
  .then(() => {
    app.listen(PORT, () => {
      console.log("WASSCE Study Hall API listening on port " + PORT);
      console.log("Modem Pay mode: " + (modempay.isMockMode() ? "MOCK (no API key set)" : "LIVE"));
      console.log("Anthropic mode: " + (anthropic.isMockMode() ? "MOCK (no API key set)" : "LIVE"));
      if (devRoutesEnabled) {
        console.log("Dev routes enabled at /dev — disabled automatically once NODE_ENV=production or a live MODEMPAY_API_KEY is set");
      } else if (process.env.NODE_ENV !== "production" && !modempay.isMockMode()) {
        console.log("Dev routes disabled: Modem Pay is in LIVE mode, so /dev/simulate-webhook is blocked even though NODE_ENV isn't 'production'.");
      }
      console.log("Email mode: " + (require("./services/email.service").isMockMode() ? "MOCK (no SMTP_HOST set)" : "LIVE"));
      renewalReminders.start();
      console.log("Renewal reminder job started (runs hourly).");
    });
  })
  .catch((err) => {
    // db.js already logs and exits on a real migration failure; this
    // catch is just a safety net in case something else throws.
    console.error("Failed to start server:", err);
    process.exit(1);
  });
