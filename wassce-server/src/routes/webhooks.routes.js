const express = require("express");
const db = require("../db");
const modempay = require("../services/modempay.service");
const subscriptionService = require("../services/subscription.service");
const bookOrderService = require("../services/bookOrder.service");

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
router.post("/modempay", async (req, res) => {
  const rawBody = req.body; // Buffer, thanks to express.raw()

  const { verified, matchedHeader, reason } = modempay.verifyWebhookSignature(rawBody, req.headers);

  if (!verified) {
    // Log enough to settle the header-name question the first time a
    // real Modem Pay test-mode webhook hits this endpoint, without
    // dumping the full header set (may include cookies/auth-adjacent
    // values on some proxies) or the raw body (payment data) to logs.
    console.warn("Rejected webhook: signature did not verify —", reason);
    console.warn(
      "Headers present on this request:",
      Object.keys(req.headers).filter((k) => k.includes("modem") || k.includes("signature"))
    );
    return res.status(400).json({ error: "Invalid signature" });
  }

  // This is the confirmation line: once a real webhook verifies, this
  // tells us definitively which header name Modem Pay actually uses,
  // so CANDIDATE_SIGNATURE_HEADERS in modempay.service.js can be
  // narrowed to just that one.
  console.log("Webhook signature verified via header:", matchedHeader);

  let event;
  try {
    event = JSON.parse(rawBody.toString("utf8"));
  } catch (e) {
    return res.status(400).json({ error: "Malformed JSON payload" });
  }

  // Awaited (not fire-and-forget) so we only acknowledge success once
  // the activation/failure has actually been persisted — otherwise a
  // fast retry or an immediate status poll from the frontend could
  // race ahead of the write.
  try {
    await handleEvent(event);
  } catch (e) {
    console.error("Error handling webhook event", e);
    return res.status(500).json({ error: "Internal error handling event" });
  }

  res.status(200).json({ received: true });
});

async function handleEvent(event) {
  const type = event.event || event.type;
  const payload = event.payload || event.data || {};
  const metadata = payload.metadata || {};
  const paymentId = metadata.paymentId;

  if (!paymentId) {
    console.warn("Webhook event without a matching paymentId in metadata, ignoring", type);
    return;
  }

  const payment = await db.get("SELECT * FROM payments WHERE id = $1", [paymentId]);
  if (!payment) {
    console.warn("Webhook referenced unknown payment", paymentId);
    return;
  }

  // Real event names (Modem Pay SDK dist/types/events.d.ts):
  // "charge.succeeded" is the actual success event — there is no
  // "payment_intent.succeeded". Failure/cancellation can arrive as
  // any of these three depending on how the payment ended.
  //
  // purchase_type on the payment row decides which service handles
  // it — a subscription payment extends access to a subject, a
  // book_order payment fulfills a Book Store purchase and sends a
  // receipt. Both are idempotent, so a retried webhook delivery for
  // either kind is always safe.
  const handler = payment.purchase_type === "book_order" ? bookOrderService : subscriptionService;
  const activate = payment.purchase_type === "book_order" ? handler.fulfillFromPayment : handler.activateFromPayment;
  const fail = payment.purchase_type === "book_order" ? handler.markFailed : handler.markPaymentFailed;

  if (type === "charge.succeeded") {
    await activate(paymentId);
  } else if (type === "charge.failed" || type === "charge.cancelled" || type === "payment_intent.cancelled") {
    await fail(paymentId);
  }
}

module.exports = router;
