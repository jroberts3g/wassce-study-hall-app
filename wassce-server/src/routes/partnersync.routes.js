// Server-to-server link from the Franchise Partner Portal.
//
// Not for browsers. Every request must carry
//   X-Partner-Timestamp: <unix ms>
//   X-Partner-Signature: hex HMAC-SHA256(PARTNER_SYNC_SECRET, timestamp + "." + rawBody)
// Requests older than 5 minutes are refused (replay protection). If
// PARTNER_SYNC_SECRET is not set, the whole endpoint is switched off.
const crypto = require("crypto");
const express = require("express");
const { v4: uuid } = require("uuid");
const db = require("../db");
const subjectsData = require("../data/subjects");

const router = express.Router();
const MAX_SUBJECTS = 10;
const WINDOW_MS = 5 * 60 * 1000;

function allSubjects() {
  if (typeof subjectsData.listSubjects === "function") return subjectsData.listSubjects();
  return subjectsData.SUBJECTS || [];
}
function subjectExists(id) {
  return allSubjects().some((s) => s.id === id);
}

function requireSigned(req, res, next) {
  const secret = process.env.PARTNER_SYNC_SECRET;
  if (!secret || secret.length < 32) return res.status(503).json({ error: "Partner sync is not configured" });
  const ts = String(req.headers["x-partner-timestamp"] || "");
  const sig = String(req.headers["x-partner-signature"] || "");
  const age = Math.abs(Date.now() - Number(ts));
  if (!/^\d{10,15}$/.test(ts) || !(age <= WINDOW_MS)) return res.status(401).json({ error: "Stale or missing timestamp" });
  const raw = Buffer.isBuffer(req.body) ? req.body.toString("utf8") : "";
  const expected = crypto.createHmac("sha256", secret).update(ts + "." + raw).digest("hex");
  const a = Buffer.from(expected), b = Buffer.from(sig);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return res.status(401).json({ error: "Bad signature" });
  try { req.json = raw ? JSON.parse(raw) : {}; } catch { return res.status(400).json({ error: "Malformed JSON" }); }
  next();
}
router.use(requireSigned);

// The subject catalogue, so the portal offers exactly what exists here.
router.get("/subjects", (req, res) => {
  res.json({
    subjects: allSubjects().map((s) => ({ id: s.id, name: s.name, category: s.category, bands: s.bands })),
    max: MAX_SUBJECTS,
  });
});

// Replace one partner's whole set of free subjects.
router.put("/grants", async (req, res, next) => {
  try {
    const { partnerKey, email, subjectIds, expiresAt } = req.json;
    if (!partnerKey || typeof partnerKey !== "string") return res.status(400).json({ error: "partnerKey is required" });
    if (!/^\S+@\S+\.\S+$/.test(String(email || ""))) return res.status(400).json({ error: "A valid email is required" });
    if (!Array.isArray(subjectIds)) return res.status(400).json({ error: "subjectIds must be a list" });
    const ids = [...new Set(subjectIds.map(String))];
    if (ids.length > MAX_SUBJECTS) return res.status(400).json({ error: `At most ${MAX_SUBJECTS} subjects` });
    const unknown = ids.filter((id) => !subjectExists(id));
    if (unknown.length) return res.status(400).json({ error: "Unknown subject: " + unknown[0] });
    const exp = Number(expiresAt);
    if (!Number.isFinite(exp) || exp <= Date.now()) return res.status(400).json({ error: "expiresAt must be a future time" });

    const mail = String(email).toLowerCase();
    const now = Date.now();
    const client = await db.pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("DELETE FROM partner_grants WHERE partner_key = $1", [partnerKey]);
      for (const sid of ids) {
        await client.query(
          "INSERT INTO partner_grants (id, partner_key, email, subject_id, expires_at, created_at) VALUES ($1,$2,$3,$4,$5,$6)",
          [uuid(), partnerKey, mail, sid, exp, now]
        );
      }
      await client.query("COMMIT");
    } catch (e) {
      await client.query("ROLLBACK");
      throw e;
    } finally {
      client.release();
    }
    const acct = await db.get("SELECT 1 AS x FROM users WHERE lower(email) = $1", [mail]);
    res.json({ ok: true, granted: ids.length, accountExists: !!acct });
  } catch (e) { next(e); }
});

// Remove everything for a partner (contract ended, or partner restricted).
router.post("/revoke", async (req, res, next) => {
  try {
    const { partnerKey } = req.json;
    if (!partnerKey || typeof partnerKey !== "string") return res.status(400).json({ error: "partnerKey is required" });
    const r = await db.run("DELETE FROM partner_grants WHERE partner_key = $1", [partnerKey]);
    res.json({ ok: true, removed: r.rowCount });
  } catch (e) { next(e); }
});

module.exports = router;
