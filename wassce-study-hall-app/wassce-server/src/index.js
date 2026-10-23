require("dotenv").config();
const express = require("express");
const cors = require("cors");

require("./db"); // creates tables on first run
const modempay = require("./services/modempay.service");
const anthropic = require("./services/anthropic.service");

const authRoutes = require("./routes/auth.routes");
const subjectsRoutes = require("./routes/subjects.routes");
const subscriptionsRoutes = require("./routes/subscriptions.routes");
const assessmentsRoutes = require("./routes/assessments.routes");
const webhooksRoutes = require("./routes/webhooks.routes");
const aiRoutes = require("./routes/ai.routes");
const settingsRoutes = require("./routes/settings.routes");

const app = express();

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

// Signed server-to-server calls from the Franchise Partner Portal (raw body needed to check the signature).
app.use("/partner-sync", express.raw({ type: "*/*", limit: "100kb" }), require("./routes/partnersync.routes"));

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
app.use("/ai", aiRoutes);
app.use("/settings", settingsRoutes);

if (process.env.NODE_ENV !== "production") {
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
app.listen(PORT, () => {
  console.log("WASSCE Study Hall API listening on port " + PORT);
  console.log("Modem Pay mode: " + (modempay.isMockMode() ? "MOCK (no API key set)" : "LIVE"));
  console.log("Anthropic mode: " + (anthropic.isMockMode() ? "MOCK (no API key set)" : "LIVE"));
  if (process.env.NODE_ENV !== "production") {
    console.log("Dev routes enabled at /dev — disable by setting NODE_ENV=production");
  }
});
