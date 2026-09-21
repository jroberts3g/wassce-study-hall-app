// Postgres, via the standard `pg` driver. Replaces the SQLite
// (node:sqlite DatabaseSync) version this project started with —
// that was fine for local prototyping, but SQLite is a single file
// on one machine: no concurrent writers across multiple server
// instances, no built-in replication/backups, and a real limit as
// real user/payment/assessment volume grows across five countries.
//
// This also carries the full Phase 2 schema (countries, per-country
// pricing for subscriptions and books, book orders, yearly rankings)
// even though only Gambia's subscription flow is wired up to use it
// today — see the schema sketch discussion this migration followed
// from. The subject/curriculum catalog itself deliberately stays as
// code files (src/data/subjects.js and similar, one per country),
// not a database table — that was an explicit decision, not an
// oversight: it's simpler and needs no content-migration tooling.
//
// IMPORTANT: unlike the old db.js, this one is asynchronous. Every
// query goes over the network to a Postgres server, so `get`/`all`/
// `run` below all return Promises — every call site needs `await`.
// Callers also use $1/$2/... positional placeholders with an array
// of values now, not SQLite's `?` or `@name` binding.
const { Pool } = require("pg");

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

pool.on("error", (err) => {
  // A background, idle client hit an error (e.g. the connection was
  // dropped by the server) — this does NOT mean the pool is dead,
  // just that one connection was. Log it rather than letting it
  // become an unhandled rejection that could crash the process.
  console.error("Unexpected error on idle Postgres client", err);
});

/**
 * query/get/all/run: thin helpers over pool.query so call sites read
 * close to how they did with the old synchronous SQLite API, just
 * with `await` added and $1/$2 placeholders instead of ?/@name.
 */
async function query(sql, params = []) {
  return pool.query(sql, params);
}

async function get(sql, params = []) {
  const { rows } = await query(sql, params);
  return rows[0];
}

async function all(sql, params = []) {
  const { rows } = await query(sql, params);
  return rows;
}

async function run(sql, params = []) {
  const result = await query(sql, params);
  return { rowCount: result.rowCount };
}

/**
 * Reference data seeded on every startup, idempotently. Only Gambia
 * has app_enabled = true today — the other four get a row (so
 * foreign keys and future curriculum-overview pages have something
 * to point at) but their apps aren't live yet, matching where Phase
 * 2 actually stands per the doc this schema was designed from.
 */
const COUNTRY_SEED = [
  { id: "gm", name: "The Gambia", currency_code: "GMD", curriculum_label: "WAEC / MoBSE (Gambia)", app_enabled: true },
  { id: "gh", name: "Ghana", currency_code: "GHS", curriculum_label: "WAEC (Ghana)", app_enabled: false },
  { id: "ng", name: "Nigeria", currency_code: "NGN", curriculum_label: "WAEC (Nigeria)", app_enabled: false },
  { id: "sl", name: "Sierra Leone", currency_code: "SLE", curriculum_label: "WAEC (Sierra Leone)", app_enabled: false },
  { id: "lr", name: "Liberia", currency_code: "LRD", curriculum_label: "WAEC (Liberia)", app_enabled: false },
];

async function migrate() {
  await query(`
    CREATE TABLE IF NOT EXISTS countries (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      currency_code TEXT NOT NULL,
      curriculum_label TEXT,
      app_enabled BOOLEAN NOT NULL DEFAULT FALSE,
      created_at BIGINT NOT NULL DEFAULT (extract(epoch from now()) * 1000)::bigint
    );

    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      phone TEXT,
      password_hash TEXT NOT NULL,
      candidate_no TEXT NOT NULL UNIQUE,
      country_id TEXT NOT NULL DEFAULT 'gm' REFERENCES countries(id),
      created_at BIGINT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS subscriptions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      country_id TEXT NOT NULL REFERENCES countries(id),
      subject_id TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'inactive',
      started_at BIGINT,
      expires_at BIGINT,
      created_at BIGINT NOT NULL,
      UNIQUE(user_id, country_id, subject_id)
    );

    CREATE TABLE IF NOT EXISTS payments (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      country_id TEXT NOT NULL REFERENCES countries(id),
      purchase_type TEXT NOT NULL DEFAULT 'subscription',
      subject_id TEXT,
      order_id TEXT,
      amount NUMERIC NOT NULL,
      currency TEXT NOT NULL,
      provider TEXT NOT NULL DEFAULT 'modempay',
      provider_reference TEXT,
      status TEXT NOT NULL DEFAULT 'pending',
      mock INTEGER NOT NULL DEFAULT 0,
      created_at BIGINT NOT NULL,
      confirmed_at BIGINT
    );

    CREATE TABLE IF NOT EXISTS assessments (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      country_id TEXT NOT NULL REFERENCES countries(id),
      subject_id TEXT NOT NULL,
      topic_id TEXT NOT NULL,
      band TEXT NOT NULL DEFAULT 'senior-secondary',
      score INTEGER NOT NULL,
      max_score INTEGER NOT NULL,
      taken_at BIGINT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS yearly_rankings (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      country_id TEXT NOT NULL REFERENCES countries(id),
      year INTEGER NOT NULL,
      total_score NUMERIC NOT NULL,
      rank INTEGER NOT NULL,
      prize_tier TEXT,
      computed_by TEXT,
      computed_at BIGINT NOT NULL,
      UNIQUE(user_id, country_id, year)
    );

    CREATE TABLE IF NOT EXISTS books (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      author TEXT,
      description TEXT,
      cover_image_url TEXT,
      created_at BIGINT NOT NULL
    );

    -- Added after the books table already existed in some
    -- deployments (including the live Supabase database) — IF NOT
    -- EXISTS makes this safe to run unconditionally on every
    -- startup, for both fresh installs and existing databases.
    ALTER TABLE books ADD COLUMN IF NOT EXISTS active BOOLEAN NOT NULL DEFAULT true;

    CREATE TABLE IF NOT EXISTS book_prices (
      book_id TEXT NOT NULL REFERENCES books(id) ON DELETE CASCADE,
      country_id TEXT NOT NULL REFERENCES countries(id),
      price NUMERIC NOT NULL,
      currency TEXT NOT NULL,
      updated_at BIGINT NOT NULL,
      PRIMARY KEY (book_id, country_id)
    );

    CREATE TABLE IF NOT EXISTS book_orders (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      book_id TEXT NOT NULL REFERENCES books(id),
      payment_id TEXT REFERENCES payments(id),
      quantity INTEGER NOT NULL DEFAULT 1,
      status TEXT NOT NULL DEFAULT 'pending',
      delivery_type TEXT NOT NULL DEFAULT 'digital',
      shipping_address TEXT,
      created_at BIGINT NOT NULL,
      fulfilled_at BIGINT
    );

    CREATE TABLE IF NOT EXISTS subscription_prices (
      country_id TEXT PRIMARY KEY REFERENCES countries(id),
      price NUMERIC NOT NULL,
      currency TEXT NOT NULL,
      updated_at BIGINT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at BIGINT NOT NULL
    );

    -- Tracks which renewal reminders have already gone out, keyed by
    -- the specific expires_at they're about. Keying on expires_at
    -- (not just subscription_id) means a renewal naturally gets a
    -- fresh set of reminders next cycle, without needing to reset or
    -- delete anything — a new expiry date is a new, un-reminded row.
    CREATE TABLE IF NOT EXISTS reminder_log (
      subscription_id TEXT NOT NULL REFERENCES subscriptions(id) ON DELETE CASCADE,
      reminder_type TEXT NOT NULL, -- '3_day' | 'expiry_day'
      expires_at BIGINT NOT NULL,
      sent_at BIGINT NOT NULL,
      PRIMARY KEY (subscription_id, reminder_type, expires_at)
    );

    -- AI-generated study diagrams (cycles, pathways, labeled diagrams),
    -- cached by concept so the same request ("nitrogen cycle") is
    -- generated once and reused for every student, not regenerated
    -- per-request. subject_id/topic_id are for organizing/browsing,
    -- not part of the cache key — concept_key alone is, since the
    -- same concept should hit the same cached diagram regardless of
    -- which subject/topic led a student to ask for it.
    CREATE TABLE IF NOT EXISTS diagrams (
      id TEXT PRIMARY KEY,
      concept_key TEXT NOT NULL UNIQUE,
      concept TEXT NOT NULL,
      subject_id TEXT,
      topic_id TEXT,
      svg TEXT NOT NULL,
      mock BOOLEAN NOT NULL DEFAULT FALSE,
      created_at BIGINT NOT NULL
    );

    -- Admin-curated supplementary links per subject. Deliberately a
    -- plain flat list (title, url, note, sort_order) rather than
    -- anything richer — this is meant to be something an admin can
    -- add to at any time without a deploy, not a content system.
    CREATE TABLE IF NOT EXISTS further_reading (
      id TEXT PRIMARY KEY,
      subject_id TEXT NOT NULL,
      title TEXT NOT NULL,
      url TEXT NOT NULL,
      note TEXT,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at BIGINT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_subscriptions_user ON subscriptions(user_id);
    CREATE INDEX IF NOT EXISTS idx_payments_user ON payments(user_id);
    CREATE INDEX IF NOT EXISTS idx_assessments_user ON assessments(user_id);
    CREATE INDEX IF NOT EXISTS idx_book_orders_user ON book_orders(user_id);
    CREATE INDEX IF NOT EXISTS idx_yearly_rankings_country_year ON yearly_rankings(country_id, year);
    CREATE INDEX IF NOT EXISTS idx_further_reading_subject ON further_reading(subject_id);
    CREATE INDEX IF NOT EXISTS idx_book_orders_payment ON book_orders(payment_id);
  `);

  for (const c of COUNTRY_SEED) {
    await query(
      `INSERT INTO countries (id, name, currency_code, curriculum_label, app_enabled, created_at)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (id) DO NOTHING`,
      [c.id, c.name, c.currency_code, c.curriculum_label, c.app_enabled, Date.now()]
    );
  }

  const existingGmPrice = await get("SELECT 1 FROM subscription_prices WHERE country_id = 'gm'");
  if (!existingGmPrice) {
    const oldSetting = await get("SELECT value FROM settings WHERE key = 'subscription_price_gmd'");
    const price = oldSetting ? Number(oldSetting.value) : 10;
    await query(
      `INSERT INTO subscription_prices (country_id, price, currency, updated_at) VALUES ('gm', $1, 'GMD', $2)`,
      [price, Date.now()]
    );
  }
}

// Callers (src/index.js) await this once at startup, before
// app.listen, so no request can be served against a database that
// hasn't finished migrating yet.
const ready = migrate().catch((err) => {
  console.error("Database migration failed — refusing to start:", err);
  process.exit(1);
});

module.exports = { pool, ready, query, get, all, run };
