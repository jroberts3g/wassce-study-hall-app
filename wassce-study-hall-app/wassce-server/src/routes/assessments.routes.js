const express = require("express");
const { v4: uuid } = require("uuid");
const db = require("../db");
const { requireAuth } = require("../middleware/auth");
const { getSubject, getTopicsForBand } = require("../data/subjects");
const subscriptionService = require("../services/subscription.service");

const router = express.Router();

function hasActiveSubscription(userId, subjectId) {
  return subscriptionService.hasAccess(userId, subjectId);
}

// Record a completed self-assessment. Requires an active subscription
// for the subject — this is the actual access-control enforcement
// point for study activity, not just a UI-level check.
router.post("/", requireAuth, (req, res) => {
  const { subjectId, topicId, band, score, maxScore } = req.body || {};
  const subject = getSubject(subjectId);
  if (!subject) return res.status(404).json({ error: "Unknown subject" });

  const resolvedBand = band || "senior-secondary";
  const topics = getTopicsForBand(subjectId, resolvedBand);
  if (!topics) return res.status(404).json({ error: "Unknown band for this subject" });
  if (!topics.some((t) => t.id === topicId)) {
    return res.status(404).json({ error: "Unknown topic for this subject and band" });
  }
  if (!hasActiveSubscription(req.userId, subjectId)) {
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
    subject_id: subjectId,
    topic_id: topicId,
    band: resolvedBand,
    score,
    max_score: maxScore,
    taken_at: Date.now(),
  };
  db.prepare(
    `INSERT INTO assessments (id, user_id, subject_id, topic_id, band, score, max_score, taken_at)
     VALUES (@id, @user_id, @subject_id, @topic_id, @band, @score, @max_score, @taken_at)`
  ).run(row);

  res.status(201).json({ assessment: row });
});

// Past scores for a subject — read access does NOT require an active
// subscription, so a student can still review history after expiry.
// Optional ?band= filter, since the same subject can span bands with
// entirely different topics (e.g. Mathematics at Grade 2 vs Grade 11).
router.get("/:subjectId", requireAuth, (req, res) => {
  const { band } = req.query;
  const rows = band
    ? db
        .prepare(
          "SELECT * FROM assessments WHERE user_id = ? AND subject_id = ? AND band = ? ORDER BY taken_at ASC"
        )
        .all(req.userId, req.params.subjectId, band)
    : db
        .prepare(
          "SELECT * FROM assessments WHERE user_id = ? AND subject_id = ? ORDER BY taken_at ASC"
        )
        .all(req.userId, req.params.subjectId);
  res.json({
    assessments: rows.map((r) => ({
      id: r.id,
      topicId: r.topic_id,
      band: r.band,
      score: r.score,
      maxScore: r.max_score,
      takenAt: r.taken_at,
    })),
  });
});

module.exports = router;

