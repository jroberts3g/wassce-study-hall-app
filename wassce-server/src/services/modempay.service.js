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
/**
 * The webhook signature scheme is NOT fully published in their public
 * docs, but has now been independently CONFIRMED end-to-end against a
 * real, live-signed webhook (2026-09-15, via Modem Pay dashboard's
 * "Send Test Event", delivered through an ngrok tunnel, verified by
 * this exact code):
 *   - Algorithm: HMAC-SHA512 of the raw (unparsed) request body,
 *     hex-encoded, compared with crypto.timingSafeEqual. Confirmed
 *     both from the SDK source (modem-pay@1.1.8, composeEventDetails)
 *     and now from a real successful verification.
 *   - Event shape: { event: "...", payload: {...} } — confirmed in
 *     the SDK's dist/types/events.d.ts and in the real delivered
 *     payload.
 *   - Header name: `x-modem-signature`. This was genuinely ambiguous
 *     earlier (Modem Pay's own PHP SDK README implied
 *     `X-Modempay-Signature`, while their TypeScript blog tutorial
 *     said `x-modem-signature`) — a real webhook delivery confirmed
 *     the blog was right. Server log from the confirming request:
 *     "Webhook signature verified via header: x-modem-signature".
 *
 * No more guessing needed — narrowed to the single confirmed header.
 */
const CANDIDATE_SIGNATURE_HEADERS = ["x-modem-signature"];

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
 * Compute the expected signature for a raw payload. Exposed separately
 * from verifyWebhookSignature so the webhook route can log a diagnostic
 * comparison when nothing matches, without duplicating the HMAC logic.
 */
function computeExpectedSignature(rawBody) {
  const payloadString = Buffer.isBuffer(rawBody) ? rawBody.toString("utf8") : rawBody;
  return crypto.createHmac("sha512", WEBHOOK_SECRET).update(payloadString).digest("hex");
}

function safeEqualHex(expectedHex, candidateHeaderValue) {
  if (!candidateHeaderValue) return false;
  const a = Buffer.from(expectedHex, "utf8");
  const b = Buffer.from(String(candidateHeaderValue), "utf8");
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

/**
 * Verify an inbound webhook's signature.
 * rawBody: the exact raw request bytes/string (not the parsed JSON —
 *          signature verification must run on the untouched payload).
 * headers: the request's headers object (lowercased keys, as Express
 *          provides). We check every header name in
 *          CANDIDATE_SIGNATURE_HEADERS since the true one isn't yet
 *          confirmed empirically — see the file-level comment above.
 *
 * Algorithm confirmed directly from Modem Pay's own SDK source
 * (modem-pay@1.1.8 on npm, dist/resources/webhook.js,
 * composeEventDetails): HMAC-SHA512 of the raw payload, hex-encoded,
 * timing-safe compared. Earlier versions of this file used SHA-256,
 * which is wrong and would silently reject every real webhook Modem
 * Pay sent regardless of whether the header name is also right.
 *
 * Returns { verified: boolean, matchedHeader: string|null } rather
 * than a plain boolean so the caller can log which header (if any)
 * actually matched — that log line is the fastest way to permanently
 * resolve the header-name ambiguity once a real test-mode webhook
 * arrives.
 */
function verifyWebhookSignature(rawBody, headers) {
  if (!WEBHOOK_SECRET) {
    // No secret configured (e.g. local/mock development). Refuse to
    // silently "pass" — callers should treat this as unverified and
    // only accept it on non-production environments.
    return { verified: false, matchedHeader: null, reason: "no MODEMPAY_WEBHOOK_SECRET configured" };
  }

  const expected = computeExpectedSignature(rawBody);
  const h = headers || {};

  for (const headerName of CANDIDATE_SIGNATURE_HEADERS) {
    if (safeEqualHex(expected, h[headerName])) {
      return { verified: true, matchedHeader: headerName };
    }
  }

  const presentCandidates = CANDIDATE_SIGNATURE_HEADERS.filter((n) => h[n] != null);
  return {
    verified: false,
    matchedHeader: null,
    reason:
      presentCandidates.length === 0
        ? "none of the candidate signature headers were present: " + CANDIDATE_SIGNATURE_HEADERS.join(", ")
        : "candidate header(s) present but did not match: " + presentCandidates.join(", "),
  };
}

module.exports = {
  isMockMode,
  createPaymentIntent,
  retrievePaymentIntent,
  verifyWebhookSignature,
  CANDIDATE_SIGNATURE_HEADERS,
};
