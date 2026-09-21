const { v4: uuid } = require("uuid");
const db = require("../db");

const SUBSCRIPTION_DAYS = 30;
const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Mark a payment succeeded and extend (or start) the subscription.
 * Idempotent: calling this twice for the same payment id is safe —
 * a payment already marked "succeeded" is left alone rather than
 * extending the subscription again. This matters because Modem Pay
 * (like most providers) may retry a webhook delivery.
 *
 * country_id comes from the payment row itself rather than being a
 * separate parameter — a payment already knows which country it was
 * made in, so callers (the webhook handler, the dev simulator, the
 * fallback poll) don't each need to independently look up or thread
 * through the user's country.
 */
async function activateFromPayment(paymentId) {
  const payment = await db.get("SELECT * FROM payments WHERE id = $1", [paymentId]);
  if (!payment) throw new Error("Unknown payment " + paymentId);
  if (payment.status === "succeeded") {
    return getSubscription(payment.user_id, payment.country_id, payment.subject_id); // already processed
  }

  const now = Date.now();
  const existing = await db.get(
    "SELECT * FROM subscriptions WHERE user_id = $1 AND country_id = $2 AND subject_id = $3",
    [payment.user_id, payment.country_id, payment.subject_id]
  );

  // Extend from the current expiry if still active, otherwise start fresh from now.
  const base = existing && existing.status === "active" && Number(existing.expires_at) > now
    ? Number(existing.expires_at)
    : now;
  const expiresAt = base + SUBSCRIPTION_DAYS * DAY_MS;

  if (existing) {
    await db.run(
      `UPDATE subscriptions SET status = 'active', started_at = $1, expires_at = $2 WHERE id = $3`,
      [existing.started_at || now, expiresAt, existing.id]
    );
  } else {
    await db.run(
      `INSERT INTO subscriptions (id, user_id, country_id, subject_id, status, started_at, expires_at, created_at)
       VALUES ($1, $2, $3, $4, 'active', $5, $6, $7)`,
      [uuid(), payment.user_id, payment.country_id, payment.subject_id, now, expiresAt, now]
    );
  }

  await db.run("UPDATE payments SET status = 'succeeded', confirmed_at = $1 WHERE id = $2", [now, payment.id]);

  return getSubscription(payment.user_id, payment.country_id, payment.subject_id);
}

async function markPaymentFailed(paymentId) {
  await db.run("UPDATE payments SET status = 'failed' WHERE id = $1 AND status = 'pending'", [paymentId]);
}

async function getSubscription(userId, countryId, subjectId) {
  return db.get(
    "SELECT * FROM subscriptions WHERE user_id = $1 AND country_id = $2 AND subject_id = $3",
    [userId, countryId, subjectId]
  );
}

async function listSubscriptionsForUser(userId) {
  const rows = await db.all("SELECT * FROM subscriptions WHERE user_id = $1", [userId]);
  const now = Date.now();
  return rows.map((r) => ({
    subjectId: r.subject_id,
    countryId: r.country_id,
    status: r.status === "active" && Number(r.expires_at) > now ? "active" : "expired",
    startedAt: r.started_at === null ? null : Number(r.started_at),
    expiresAt: r.expires_at === null ? null : Number(r.expires_at),
  }));
}

module.exports = {
  SUBSCRIPTION_DAYS,
  activateFromPayment,
  markPaymentFailed,
  getSubscription,
  listSubscriptionsForUser,
};
