const express = require("express");
const db = require("../db");
const modempay = require("../services/modempay.service");
const subscriptionService = require("../services/subscription.service");

const router = express.Router();

/**
 * Modem Pay webhook receiver.
 *
 * IMPORTANT: this route is mounted with express.raw() in src/index.js
 * (not express.json()) specifically so req.body is the untouched raw
 * bytes — signature verification must run on the exact payload Modem
 * Pay sent, not a re-serialized copy of it.
 *
 * We look for `payment_intent.*` / `charge.*` style events and match
 * them back to our own payment row via the metadata.paymentId we set
 * at intent-creation time. Event shape and the full list of real
 * event names below are confirmed directly from Modem Pay's own SDK
 * source (modem-pay on npm, dist/types/events.d.ts) — the payload
 * lives under `event.payload`, not `event.data` as an earlier version
 * of this file assumed, which silently broke this handler even when
 * the signature verified correctly.
 */
router.post("/modempay", (req, res) => {
  const rawBody = req.body; // Buffer, thanks to express.raw()
  const signature = req.headers["x-modempay-signature"];

  const verified = modempay.verifyWebhookSignature(rawBody, signature);
  if (!verified) {
    console.warn("Rejected webhook: signature did not verify");
    return res.status(400).json({ error: "Invalid signature" });
  }

  let event;
  try {
    event = JSON.parse(rawBody.toString("utf8"));
  } catch (e) {
    return res.status(400).json({ error: "Malformed JSON payload" });
  }

  handleEvent(event);

  // Acknowledge immediately; do any slow work (none here) async.
  res.status(200).json({ received: true });
});

function handleEvent(event) {
  const type = event.event || event.type;
  const payload = event.payload || event.data || {};
  const metadata = payload.metadata || {};
  const paymentId = metadata.paymentId;

  if (!paymentId) {
    console.warn("Webhook event without a matching paymentId in metadata, ignoring", type);
    return;
  }

  const payment = db.prepare("SELECT * FROM payments WHERE id = ?").get(paymentId);
  if (!payment) {
    console.warn("Webhook referenced unknown payment", paymentId);
    return;
  }

  // Real event names (Modem Pay SDK dist/types/events.d.ts):
  // "charge.succeeded" is the actual success event — there is no
  // "payment_intent.succeeded". Failure/cancellation can arrive as
  // any of these three depending on how the payment ended.
  if (type === "charge.succeeded") {
    subscriptionService.activateFromPayment(paymentId);
  } else if (type === "charge.failed" || type === "charge.cancelled" || type === "payment_intent.cancelled") {
    subscriptionService.markPaymentFailed(paymentId);
  }
}

module.exports = router;
