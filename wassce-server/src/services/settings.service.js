const db = require("../db");

/**
 * Runtime settings, stored in the database instead of hardcoded in
 * source. The point is that changing a value never requires touching
 * code or redeploying — just an authenticated PUT request.
 *
 * Subscription pricing used to live here as a single global
 * 'subscription_price_gmd' key — that had the same currency baked
 * into the name problem payments.amount_gmd did. It's now its own
 * subscription_prices table, one row per country, mirroring
 * book_prices. The generic key/value functions below (getRaw/setRaw)
 * remain for anything that's genuinely global rather than
 * per-country.
 */

const DEFAULTS = {};

async function getRaw(key) {
  const row = await db.get("SELECT value FROM settings WHERE key = $1", [key]);
  if (row) return row.value;

  const fallback = DEFAULTS[key];
  if (fallback === undefined) return null;
  await setRaw(key, fallback);
  return fallback;
}

async function setRaw(key, value) {
  const now = Date.now();
  await db.run(
    `INSERT INTO settings (key, value, updated_at) VALUES ($1, $2, $3)
     ON CONFLICT (key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
    [key, String(value), now]
  );
}

/**
 * Per-country subscription price. Falls back to a sensible default
 * (10, in that country's own currency) if a country has never had a
 * price explicitly set — matters for the four countries whose apps
 * aren't live yet, so a future launch isn't blocked on remembering to
 * seed a price first.
 */
async function getSubscriptionPrice(countryId) {
  const row = await db.get("SELECT price, currency FROM subscription_prices WHERE country_id = $1", [countryId]);
  if (row) return { price: Number(row.price), currency: row.currency };

  const country = await db.get("SELECT currency_code FROM countries WHERE id = $1", [countryId]);
  return { price: 10, currency: country ? country.currency_code : "GMD" };
}

async function setSubscriptionPrice(countryId, price, currency) {
  const n = Number(price);
  if (!Number.isFinite(n) || n <= 0) {
    throw new Error("price must be a positive number");
  }
  if (!currency) {
    throw new Error("currency is required");
  }
  await db.run(
    `INSERT INTO subscription_prices (country_id, price, currency, updated_at) VALUES ($1, $2, $3, $4)
     ON CONFLICT (country_id) DO UPDATE SET price = excluded.price, currency = excluded.currency, updated_at = excluded.updated_at`,
    [countryId, n, currency, Date.now()]
  );
  return { price: n, currency };
}

/**
 * Public settings for the frontend, shown before a student logs in.
 * Defaults to Gambia (the only country with a live app today) when
 * no country is specified, so existing callers that don't pass one
 * yet keep working exactly as before.
 */
async function getPublicSettings(countryId = "gm") {
  const { price, currency } = await getSubscriptionPrice(countryId);
  return {
    subscriptionPrice: price,
    subscriptionCurrency: currency,
  };
}

module.exports = {
  getSubscriptionPrice,
  setSubscriptionPrice,
  getPublicSettings,
};
