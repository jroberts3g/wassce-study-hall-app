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
 */
function activateFromPayment(paymentId) {
  const payment = db.prepare("SELECT * FROM payments WHERE id = ?").get(paymentId);
  if (!payment) throw new Error("Unknown payment " + paymentId);
  if (payment.status === "succeeded") {
    return getSubscription(payment.user_id, payment.subject_id); // already processed
  }

  const now = Date.now();
  const existing = db
    .prepare("SELECT * FROM subscriptions WHERE user_id = ? AND subject_id = ?")
    .get(payment.user_id, payment.subject_id);

  // Extend from the current expiry if still active, otherwise start fresh from now.
  const base = existing && existing.status === "active" && existing.expires_at > now
    ? existing.expires_at
    : now;
  const expiresAt = base + SUBSCRIPTION_DAYS * DAY_MS;

  if (existing) {
    db.prepare(
      `UPDATE subscriptions SET status = 'active', started_at = ?, expires_at = ? WHERE id = ?`
    ).run(existing.started_at || now, expiresAt, existing.id);
  } else {
    db.prepare(
      `INSERT INTO subscriptions (id, user_id, subject_id, status, started_at, expires_at, created_at)
       VALUES (?, ?, ?, 'active', ?, ?, ?)`
    ).run(uuid(), payment.user_id, payment.subject_id, now, expiresAt, now);
  }

  db.prepare("UPDATE payments SET status = 'succeeded', confirmed_at = ? WHERE id = ?").run(
    now,
    payment.id
  );

  return getSubscription(payment.user_id, payment.subject_id);
}

function markPaymentFailed(paymentId) {
  db.prepare("UPDATE payments SET status = 'failed' WHERE id = ? AND status = 'pending'").run(
    paymentId
  );
}

function getSubscription(userId, subjectId) {
  return db
    .prepare("SELECT * FROM subscriptions WHERE user_id = ? AND subject_id = ?")
    .get(userId, subjectId);
}

function userEmail(userId) {
  const u = db.prepare("SELECT email FROM users WHERE id = ?").get(userId);
  return u ? String(u.email).toLowerCase() : null;
}

/** Live partner grants (free access for franchise partners) for one user, by email. */
function activeGrants(userId, now = Date.now()) {
  const email = userEmail(userId);
  if (!email) return [];
  return db.prepare("SELECT subject_id, expires_at, created_at FROM partner_grants WHERE email = ? AND expires_at > ?").all(email, now);
}

/** True if the user can use this subject: a paid subscription or a partner grant. */
function hasAccess(userId, subjectId) {
  const now = Date.now();
  const sub = getSubscription(userId, subjectId);
  if (sub && sub.status === "active" && sub.expires_at > now) return true;
  return activeGrants(userId, now).some((g) => g.subject_id === subjectId);
}

function listSubscriptionsForUser(userId) {
  const rows = db.prepare("SELECT * FROM subscriptions WHERE user_id = ?").all(userId);
  const now = Date.now();
  const bySubject = new Map();
  for (const r of rows) {
    bySubject.set(r.subject_id, {
      subjectId: r.subject_id,
      status: r.status === "active" && r.expires_at > now ? "active" : "expired",
      startedAt: r.started_at,
      expiresAt: r.expires_at,
    });
  }
  // A partner grant makes the subject active until the contract ends, without touching any paid subscription.
  for (const g of activeGrants(userId, now)) {
    const cur = bySubject.get(g.subject_id);
    if (cur && cur.status === "active" && cur.expiresAt >= g.expires_at) continue; // paid cover already runs longer
    bySubject.set(g.subject_id, {
      subjectId: g.subject_id, status: "active", startedAt: cur && cur.startedAt ? cur.startedAt : g.created_at,
      expiresAt: g.expires_at, partnerAccess: true,
    });
  }
  return [...bySubject.values()];
}

module.exports = {
  SUBSCRIPTION_DAYS,
  activateFromPayment,
  markPaymentFailed,
  getSubscription,
  hasAccess,
  listSubscriptionsForUser,
};
