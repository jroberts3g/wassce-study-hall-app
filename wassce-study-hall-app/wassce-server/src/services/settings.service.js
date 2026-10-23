const db = require("../db");

/**
 * Runtime settings, stored in the database instead of hardcoded in
 * source. The point is that changing the subscription price (or any
 * future setting added here) never requires touching code or
 * redeploying — just an authenticated PUT request.
 */

const DEFAULTS = {
  subscription_price_gmd: "10",
};

function getRaw(key) {
  const row = db.prepare("SELECT value FROM settings WHERE key = ?").get(key);
  if (row) return row.value;

  // Not set yet — seed the default so it's visible/editable from here on.
  const fallback = DEFAULTS[key];
  if (fallback === undefined) return null;
  setRaw(key, fallback);
  return fallback;
}

function setRaw(key, value) {
  const now = Date.now();
  db.prepare(
    `INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`
  ).run(key, String(value), now);
}

function getSubscriptionPriceGmd() {
  return Number(getRaw("subscription_price_gmd"));
}

function setSubscriptionPriceGmd(priceGmd) {
  const n = Number(priceGmd);
  if (!Number.isFinite(n) || n <= 0) {
    throw new Error("priceGmd must be a positive number");
  }
  setRaw("subscription_price_gmd", n);
  return n;
}

function getPublicSettings() {
  return {
    subscriptionPriceGmd: getSubscriptionPriceGmd(),
  };
}

module.exports = {
  getSubscriptionPriceGmd,
  setSubscriptionPriceGmd,
  getPublicSettings,
};
