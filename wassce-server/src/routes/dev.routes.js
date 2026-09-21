const express = require("express");
const db = require("../db");
const { requireAuth } = require("../middleware/auth");
const subscriptionService = require("../services/subscription.service");
const bookOrderService = require("../services/bookOrder.service");
const modempay = require("../services/modempay.service");

const router = express.Router();

// Defense in depth: even though index.js only mounts this router when
// NODE_ENV !== "production" AND Modem Pay is in mock mode, this
// middleware refuses every request here a second time, independently,
// in case this file is ever required/mounted some other way in the
// future (a refactor, a different entrypoint, etc.). This route lets
// a logged-in user activate their OWN subscription without paying —
// it must never be reachable while real payment credentials are
// configured, no matter how it got mounted.
router.use((req, res, next) => {
  if (!modempay.isMockMode()) {
    return res.status(404).json({ error: "Not found" });
  }
  next();
});

/**
 * Simulates Modem Pay's webhook call succeeding, WITHOUT verifying
 * any signature — this bypasses modempay.service entirely. It exists
 * so you can develop and demo the full checkout -> activation flow
 * before you have a live Modem Pay merchant account or a public
 * webhook URL for them to call. It is only mounted when
 * NODE_ENV !== 'production' AND Modem Pay is in mock mode (see
 * src/index.js) — the second, independent check above enforces the
 * same rule again at request time.
 */
router.post("/simulate-webhook", requireAuth, async (req, res) => {
  const { paymentId, outcome } = req.body || {};
  const payment = await db.get(
    "SELECT * FROM payments WHERE id = $1 AND user_id = $2",
    [paymentId, req.userId]
  );

  if (!payment) return res.status(404).json({ error: "Payment not found for this user" });

  const isBookOrder = payment.purchase_type === "book_order";

  if (outcome === "fail") {
    if (isBookOrder) await bookOrderService.markFailed(payment.id);
    else await subscriptionService.markPaymentFailed(payment.id);
    return res.json({ ok: true, outcome: "failed" });
  }

  if (isBookOrder) {
    await bookOrderService.fulfillFromPayment(payment.id);
    return res.json({ ok: true, outcome: "succeeded" });
  }

  const subscription = await subscriptionService.activateFromPayment(payment.id);
  res.json({ ok: true, outcome: "succeeded", subscription });
});

module.exports = router;
