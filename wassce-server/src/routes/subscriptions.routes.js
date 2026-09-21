const express = require("express");
const { v4: uuid } = require("uuid");
const db = require("../db");
const { requireAuth } = require("../middleware/auth");
const { getSubject } = require("../data/subjects");
const modempay = require("../services/modempay.service");
const subscriptionService = require("../services/subscription.service");
const settingsService = require("../services/settings.service");

const router = express.Router();

router.get("/", requireAuth, async (req, res) => {
  res.json({ subscriptions: await subscriptionService.listSubscriptionsForUser(req.userId) });
});

/**
 * Start (or renew) a subject subscription.
 * Creates a pending payment row + a Modem Pay Payment Intent, and
 * returns the hosted payment link for the frontend to redirect to.
 * The subscription itself is only activated once the webhook (or,
 * in local dev, /dev/simulate-webhook) confirms the payment.
 *
 * Price and currency are looked up per the user's own country_id —
 * previously this was a single hardcoded GMD price for everyone.
 */
router.post("/:subjectId/checkout", requireAuth, async (req, res) => {
  const subject = getSubject(req.params.subjectId);
  if (!subject) return res.status(404).json({ error: "Unknown subject" });

  const user = await db.get("SELECT * FROM users WHERE id = $1", [req.userId]);

  // Read fresh on every checkout — never cached — so a price change
  // via /settings takes effect immediately, with no restart needed.
  const { price, currency } = await settingsService.getSubscriptionPrice(user.country_id);

  const paymentId = uuid();

  try {
    const intent = await modempay.createPaymentIntent({
      amountGmd: price, // param name kept for now — see modempay.service.js note on this
      title: subject.name + " — 30 day access",
      description: "WASSCE Study Hall subscription: " + subject.name,
      customerEmail: user.email,
      metadata: { paymentId, userId: user.id, subjectId: subject.id },
    });

    await db.run(
      `INSERT INTO payments (id, user_id, country_id, purchase_type, subject_id, amount, currency, provider, provider_reference, status, mock, created_at)
       VALUES ($1, $2, $3, 'subscription', $4, $5, $6, 'modempay', $7, 'pending', $8, $9)`,
      [
        paymentId,
        user.id,
        user.country_id,
        subject.id,
        price,
        currency,
        intent.providerReference ?? null,
        intent.mock ? 1 : 0,
        Date.now(),
      ]
    );

    res.status(201).json({
      paymentId,
      paymentLink: intent.paymentLink,
      mock: intent.mock,
      amount: price,
      currency,
    });
  } catch (e) {
    console.error("Modem Pay checkout failed", e);
    res.status(502).json({ error: "Could not start checkout with Modem Pay", detail: e.message });
  }
});

/**
 * Fallback poll — in case a webhook was missed, the frontend can ask
 * "did this payment go through?" directly.
 */
router.get("/payments/:paymentId", requireAuth, async (req, res) => {
  const payment = await db.get(
    "SELECT * FROM payments WHERE id = $1 AND user_id = $2",
    [req.params.paymentId, req.userId]
  );
  if (!payment) return res.status(404).json({ error: "Payment not found" });

  if (payment.status === "pending" && !payment.mock) {
    try {
      const remote = await modempay.retrievePaymentIntent(payment.provider_reference);
      // Modem Pay's actual status values: requires_payment_method,
      // processing, successful, failed, cancelled. ("successful", not
      // "succeeded" — easy to get wrong, and we did the first time.)
      if (remote.status === "successful") {
        await subscriptionService.activateFromPayment(payment.id);
      } else if (remote.status === "failed" || remote.status === "cancelled") {
        await subscriptionService.markPaymentFailed(payment.id);
      }
    } catch (e) {
      console.error("Could not poll Modem Pay for payment status", e);
    }
  }

  const fresh = await db.get("SELECT * FROM payments WHERE id = $1", [payment.id]);
  res.json({
    id: fresh.id,
    subjectId: fresh.subject_id,
    status: fresh.status,
    mock: !!fresh.mock,
  });
});

module.exports = router;
