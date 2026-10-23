const express = require("express");
const db = require("../db");
const { requireAuth } = require("../middleware/auth");
const subscriptionService = require("../services/subscription.service");

const router = express.Router();

/**
 * Simulates Modem Pay's webhook call succeeding, WITHOUT verifying
 * any signature — this bypasses modempay.service entirely. It exists
 * so you can develop and demo the full checkout -> activation flow
 * before you have a live Modem Pay merchant account or a public
 * webhook URL for them to call. It is only mounted when
 * NODE_ENV !== 'production' (see src/index.js) — make sure that
 * stays true in your deployment config.
 */
router.post("/simulate-webhook", requireAuth, (req, res) => {
  const { paymentId, outcome } = req.body || {};
  const payment = db
    .prepare("SELECT * FROM payments WHERE id = ? AND user_id = ?")
    .get(paymentId, req.userId);

  if (!payment) return res.status(404).json({ error: "Payment not found for this user" });

  if (outcome === "fail") {
    subscriptionService.markPaymentFailed(payment.id);
    return res.json({ ok: true, outcome: "failed" });
  }

  const subscription = subscriptionService.activateFromPayment(payment.id);
  res.json({ ok: true, outcome: "succeeded", subscription });
});

module.exports = router;
