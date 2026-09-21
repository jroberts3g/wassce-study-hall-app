const express = require("express");
const { requireAdmin } = require("../middleware/adminAuth");
const settingsService = require("../services/settings.service");

const router = express.Router();

// Public — the frontend needs this to display the current price
// before a student even logs in. ?country= defaults to Gambia (the
// only country with a live app today); the other four will use this
// same endpoint once their apps go live.
router.get("/", async (req, res) => {
  const country = req.query.country || "gm";
  res.json(await settingsService.getPublicSettings(country));
});

// Admin-only — changes the price for one country, effective
// immediately (checkout reads this value fresh on every request,
// nothing cached). `country` defaults to 'gm' so existing admin
// tooling that only knows about Gambia keeps working unchanged.
router.put("/subscription-price", requireAdmin, async (req, res) => {
  const { price, currency, country } = req.body || {};
  try {
    const updated = await settingsService.setSubscriptionPrice(country || "gm", price, currency || "GMD");
    res.json(updated);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

module.exports = router;
