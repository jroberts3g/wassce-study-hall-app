const express = require("express");
const { requireAuth } = require("../middleware/auth");
const anthropic = require("../services/anthropic.service");

const router = express.Router();

// Generic passthrough: the frontend sends the same {system, messages,
// maxTokens} shape it would have sent directly to api.anthropic.com
// inside a Claude artifact. Requiring login here stops a stranger who
// finds your server's address from running up your Anthropic bill.
router.post("/complete", requireAuth, async (req, res) => {
  const { system, messages, maxTokens } = req.body || {};
  if (!Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json({ error: "messages array is required" });
  }
  try {
    const result = await anthropic.complete({ system, messages, maxTokens });
    res.json(result);
  } catch (e) {
    console.error("Anthropic request failed", e);
    res.status(502).json({ error: e.message });
  }
});

module.exports = router;
