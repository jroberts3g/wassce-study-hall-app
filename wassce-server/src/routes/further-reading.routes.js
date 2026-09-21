const express = require("express");
const { v4: uuid } = require("uuid");
const db = require("../db");
const { requireAuth } = require("../middleware/auth");
const { requireAdmin } = require("../middleware/adminAuth");
const { getSubject } = require("../data/subjects");

const router = express.Router();

// Read access requires login but NOT an active subscription — a
// student should be able to see what further reading exists for a
// subject even before subscribing, as part of deciding whether to.
router.get("/:subjectId", requireAuth, async (req, res) => {
  const subject = getSubject(req.params.subjectId);
  if (!subject) return res.status(404).json({ error: "Unknown subject" });

  const rows = await db.all(
    "SELECT id, title, url, note FROM further_reading WHERE subject_id = $1 ORDER BY sort_order ASC, created_at ASC",
    [req.params.subjectId]
  );
  res.json({ items: rows });
});

router.post("/:subjectId", requireAdmin, async (req, res) => {
  const subject = getSubject(req.params.subjectId);
  if (!subject) return res.status(404).json({ error: "Unknown subject" });

  const { title, url, note, sortOrder } = req.body || {};
  if (!title || !url) return res.status(400).json({ error: "title and url are required" });
  try {
    new URL(url); // throws if not a real absolute URL
  } catch {
    return res.status(400).json({ error: "url must be a valid absolute URL (include https://)" });
  }

  const row = {
    id: uuid(),
    subject_id: req.params.subjectId,
    title,
    url,
    note: note || null,
    sort_order: Number.isFinite(Number(sortOrder)) ? Number(sortOrder) : 0,
    created_at: Date.now(),
  };
  await db.run(
    `INSERT INTO further_reading (id, subject_id, title, url, note, sort_order, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [row.id, row.subject_id, row.title, row.url, row.note, row.sort_order, row.created_at]
  );
  res.status(201).json({ item: row });
});

router.put("/:subjectId/:itemId", requireAdmin, async (req, res) => {
  const { title, url, note, sortOrder } = req.body || {};
  if (url) {
    try {
      new URL(url);
    } catch {
      return res.status(400).json({ error: "url must be a valid absolute URL (include https://)" });
    }
  }

  const existing = await db.get(
    "SELECT * FROM further_reading WHERE id = $1 AND subject_id = $2",
    [req.params.itemId, req.params.subjectId]
  );
  if (!existing) return res.status(404).json({ error: "Not found" });

  await db.run(
    `UPDATE further_reading SET title = $1, url = $2, note = $3, sort_order = $4 WHERE id = $5`,
    [
      title ?? existing.title,
      url ?? existing.url,
      note !== undefined ? note : existing.note,
      Number.isFinite(Number(sortOrder)) ? Number(sortOrder) : existing.sort_order,
      existing.id,
    ]
  );
  res.json({ ok: true });
});

router.delete("/:subjectId/:itemId", requireAdmin, async (req, res) => {
  await db.run("DELETE FROM further_reading WHERE id = $1 AND subject_id = $2", [req.params.itemId, req.params.subjectId]);
  res.json({ ok: true });
});

module.exports = router;
