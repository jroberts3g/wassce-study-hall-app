const express = require("express");
const { v4: uuid } = require("uuid");
const db = require("../db");
const { requireAuth } = require("../middleware/auth");
const { getSubject, getTopicsForBand } = require("../data/subjects");
const subscriptionService = require("../services/subscription.service");

const router = express.Router();

async function hasActiveSubscription(userId, countryId, subjectId) {
  const sub = await subscriptionService.getSubscription(userId, countryId, subjectId);
  return !!sub && sub.status === "active" && Number(sub.expires_at) > Date.now();
}

// Record a completed self-assessment. Requires an active subscription
// for the subject — this is the actual access-control enforcement
// point for study activity, not just a UI-level check.
router.post("/", requireAuth, async (req, res) => {
  const { subjectId, topicId, band, score, maxScore } = req.body || {};
  const subject = getSubject(subjectId);
  if (!subject) return res.status(404).json({ error: "Unknown subject" });

  const resolvedBand = band || "senior-secondary";
  const topics = getTopicsForBand(subjectId, resolvedBand);
  if (!topics) return res.status(404).json({ error: "Unknown band for this subject" });
  if (!topics.some((t) => t.id === topicId)) {
    return res.status(404).json({ error: "Unknown topic for this subject and band" });
  }

  const user = await db.get("SELECT country_id FROM users WHERE id = $1", [req.userId]);

  if (!(await hasActiveSubscription(req.userId, user.country_id, subjectId))) {
    return res.status(403).json({ error: "No active subscription for this subject" });
  }
  if (
    typeof score !== "number" ||
    typeof maxScore !== "number" ||
    score < 0 ||
    score > maxScore
  ) {
    return res.status(400).json({ error: "Invalid score" });
  }

  const row = {
    id: uuid(),
    user_id: req.userId,
    country_id: user.country_id,
    subject_id: subjectId,
    topic_id: topicId,
    band: resolvedBand,
    score,
    max_score: maxScore,
    taken_at: Date.now(),
  };
  await db.run(
    `INSERT INTO assessments (id, user_id, country_id, subject_id, topic_id, band, score, max_score, taken_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
    [row.id, row.user_id, row.country_id, row.subject_id, row.topic_id, row.band, row.score, row.max_score, row.taken_at]
  );

  res.status(201).json({ assessment: row });
});

// Past scores for a subject — read access does NOT require an active
// subscription, so a student can still review history after expiry.
// Optional ?band= filter, since the same subject can span bands with
// entirely different topics (e.g. Mathematics at Grade 2 vs Grade 11).
router.get("/:subjectId", requireAuth, async (req, res) => {
  const { band } = req.query;
  const rows = band
    ? await db.all(
        "SELECT * FROM assessments WHERE user_id = $1 AND subject_id = $2 AND band = $3 ORDER BY taken_at ASC",
        [req.userId, req.params.subjectId, band]
      )
    : await db.all(
        "SELECT * FROM assessments WHERE user_id = $1 AND subject_id = $2 ORDER BY taken_at ASC",
        [req.userId, req.params.subjectId]
      );
  res.json({
    assessments: rows.map((r) => ({
      id: r.id,
      topicId: r.topic_id,
      band: r.band,
      score: r.score,
      maxScore: r.max_score,
      takenAt: Number(r.taken_at),
    })),
  });
});

module.exports = router;
