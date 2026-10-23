const express = require("express");
const { requireAdmin } = require("../middleware/adminAuth");
const settingsService = require("../services/settings.service");

const router = express.Router();

// Public — the frontend needs this to display the current price
// before a student even logs in.
router.get("/", (req, res) => {
  res.json(settingsService.getPublicSettings());
});

// Admin-only — changes the price platform-wide, effective immediately
// (checkout reads this value fresh on every request, nothing cached).
router.put("/subscription-price", requireAdmin, (req, res) => {
  const { priceGmd } = req.body || {};
  try {
    const updated = settingsService.setSubscriptionPriceGmd(priceGmd);
    res.json({ subscriptionPriceGmd: updated });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

module.exports = router;
