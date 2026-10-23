const crypto = require("crypto");
const fetch = require("node-fetch");

/**
 * Modem Pay integration.
 *
 * Reference: https://docs.modempay.com/documentation/payment-intents/overview
 * and https://docs.modempay.com/documentation/payment-intents/create
 *
 * Create-intent request/response shape below is taken directly from
 * Modem Pay's published docs (POST https://api.modempay.com/v1/payments,
 * Bearer auth, body wrapped in { data: {...} }).
 *
 * The webhook signature scheme is NOT fully published in their public
 * docs at the time this was written — their PHP SDK exposes a
 * `webhooks()->composeEventDetails(payload, signature, secret)` helper
 * and sends the signature in an `X-Modempay-Signature` header, which
 * points at the standard HMAC-SHA256-of-raw-body pattern implemented
 * below. CONFIRM this against the current Node SDK (`modem-pay` on
 * npm) or by asking Modem Pay support before relying on it in
 * production — if their algorithm differs, swap the implementation
 * inside `verifyWebhookSignature` only; nothing else needs to change.
 */

const API_BASE = process.env.MODEMPAY_API_BASE || "https://api.modempay.com/v1";
const API_KEY = process.env.MODEMPAY_API_KEY || "";
const WEBHOOK_SECRET = process.env.MODEMPAY_WEBHOOK_SECRET || "";

const isMockMode = () => !API_KEY;

/**
 * Create a Payment Intent for a subject subscription.
 * amountGmd: number, e.g. 10
 * Returns: { paymentLink, providerReference, mock, raw }
 */
async function createPaymentIntent({ amountGmd, title, description, metadata, customerEmail }) {
  if (isMockMode()) {
    // No MODEMPAY_API_KEY configured: simulate a payment intent so the
    // rest of the app (and a developer with no merchant account yet)
    // can still exercise the full checkout -> webhook -> activation
    // flow. See routes/dev.routes.js for the matching simulate-webhook
    // endpoint.
    const fakeId = "mock_" + crypto.randomUUID();
    return {
      paymentLink: "https://example-sandbox.modempay.com/mock-checkout/" + fakeId,
      providerReference: fakeId,
      mock: true,
      raw: { status: "requires_payment_method", mock: true },
    };
  }

  const res = await fetch(API_BASE + "/payments", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: "Bearer " + API_KEY,
    },
    body: JSON.stringify({
      data: {
        amount: amountGmd,
        currency: "GMD",
        title,
        description,
        customer_email: customerEmail,
        metadata,
        return_url: process.env.CHECKOUT_RETURN_URL,
        cancel_url: process.env.CHECKOUT_CANCEL_URL,
        from_sdk: false,
      },
    }),
  });

  const body = await res.json().catch(() => null);

  if (!res.ok || !body || body.status !== true) {
    const message = (body && body.message) || "Modem Pay request failed (" + res.status + ")";
    const err = new Error(message);
    err.details = body;
    throw err;
  }

  // Log the complete real response every time, unconditionally, while
  // we're still nailing down which field Modem Pay actually uses for
  // retrieval — their own type definitions promised `data.id` but the
  // live API doesn't seem to honor that, so guessing further isn't
  // productive; seeing the exact real keys settles it.
  console.log("Modem Pay create-payment response data:", JSON.stringify(body.data));

  const providerReference = body.data.id || body.data.intent_secret || body.data.reference || null;

  return {
    paymentLink: body.data.payment_link,
    providerReference,
    mock: false,
    raw: body.data,
  };
}

/**
 * Retrieve a payment intent's current status — used as a fallback
 * poll in case a webhook delivery is missed.
 */
async function retrievePaymentIntent(providerReference) {
  if (isMockMode() || String(providerReference || "").startsWith("mock_")) {
    return { status: "requires_payment_method", mock: true };
  }
  const url = API_BASE + "/payments/" + providerReference;
  const res = await fetch(url, {
    headers: { Authorization: "Bearer " + API_KEY },
  });
  const rawText = await res.text();
  let body = null;
  try {
    body = JSON.parse(rawText);
  } catch {
    // not JSON — rawText below carries the diagnostic info instead
  }
  if (!res.ok || !body) {
    throw new Error(
      "Could not retrieve payment intent " + providerReference +
      " — GET " + url + " returned HTTP " + res.status + ": " + rawText.slice(0, 300)
    );
  }
  return body.data || body;
}

/**
 * Verify an inbound webhook's signature.
 * rawBody: the exact raw request bytes/string (not the parsed JSON —
 *          signature verification must run on the untouched payload).
 * signatureHeader: value of the X-Modempay-Signature header.
 *
 * Algorithm confirmed directly from Modem Pay's own SDK source
 * (modem-pay on npm, dist/resources/webhook.js, composeEventDetails):
 * HMAC-SHA512 of the raw payload, hex-encoded. Earlier versions of
 * this file used SHA-256, which is wrong — Anthropic's own docs on
 * this integration didn't have this confirmed either, and it silently
 * rejected every real webhook Modem Pay sent, which is why every
 * event showed "Failed" in the dashboard regardless of whether the
 * tunnel was working.
 */
function verifyWebhookSignature(rawBody, signatureHeader) {
  if (!WEBHOOK_SECRET) {
    // No secret configured (e.g. local/mock development). Refuse to
    // silently "pass" — callers should treat this as unverified and
    // only accept it on non-production environments.
    return false;
  }
  if (!signatureHeader) return false;

  const payloadString = Buffer.isBuffer(rawBody) ? rawBody.toString("utf8") : rawBody;
  const expected = crypto
    .createHmac("sha512", WEBHOOK_SECRET)
    .update(payloadString)
    .digest("hex");

  const a = Buffer.from(expected, "utf8");
  const b = Buffer.from(String(signatureHeader), "utf8");
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

module.exports = {
  isMockMode,
  createPaymentIntent,
  retrievePaymentIntent,
  verifyWebhookSignature,
};
