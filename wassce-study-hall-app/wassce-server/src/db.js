// Uses Node's built-in SQLite (available from Node 22.5+, stable by
// Node 24) instead of the better-sqlite3 package. That package ships
// prebuilt native binaries per Node version/OS, and if none exists
// for your exact combination (common right after a new Node release,
// especially on Windows) npm falls back to compiling from source,
// which needs a C++ toolchain most machines don't have. Node's own
// SQLite needs no compilation at all — same API, no native module.
const { DatabaseSync } = require("node:sqlite");
const path = require("path");

const DATABASE_FILE = process.env.DATABASE_FILE || "./data.sqlite";

const db = new DatabaseSync(path.resolve(process.cwd(), DATABASE_FILE));
db.exec("PRAGMA journal_mode = WAL");
db.exec("PRAGMA foreign_keys = ON");

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    phone TEXT,
    password_hash TEXT NOT NULL,
    candidate_no TEXT NOT NULL UNIQUE,
    created_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS subscriptions (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    subject_id TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'inactive', -- inactive | active | expired
    started_at INTEGER,
    expires_at INTEGER,
    created_at INTEGER NOT NULL,
    UNIQUE(user_id, subject_id)
  );

  CREATE TABLE IF NOT EXISTS payments (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    subject_id TEXT NOT NULL,
    amount_gmd REAL NOT NULL,
    provider TEXT NOT NULL DEFAULT 'modempay',
    provider_reference TEXT,          -- Modem Pay payment intent id / secret
    status TEXT NOT NULL DEFAULT 'pending', -- pending | succeeded | failed
    mock INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL,
    confirmed_at INTEGER
  );

  CREATE TABLE IF NOT EXISTS assessments (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    subject_id TEXT NOT NULL,
    topic_id TEXT NOT NULL,
    band TEXT NOT NULL DEFAULT 'senior-secondary',
    score INTEGER NOT NULL,
    max_score INTEGER NOT NULL,
    taken_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at INTEGER NOT NULL
  );

  -- Free access granted to approved franchise partners for the length of their
  -- contract. Keyed by email so it applies whether the partner registered here
  -- before or after the grant. Written only by the signed partner-sync endpoint.
  CREATE TABLE IF NOT EXISTS partner_grants (
    id TEXT PRIMARY KEY,
    partner_key TEXT NOT NULL,          -- the partner portal's application id
    email TEXT NOT NULL,                -- lower-case
    subject_id TEXT NOT NULL,
    expires_at INTEGER NOT NULL,
    created_at INTEGER NOT NULL,
    UNIQUE(partner_key, subject_id)
  );
  CREATE INDEX IF NOT EXISTS idx_partner_grants_email ON partner_grants(email);

  CREATE INDEX IF NOT EXISTS idx_subscriptions_user ON subscriptions(user_id);
  CREATE INDEX IF NOT EXISTS idx_payments_user ON payments(user_id);
  CREATE INDEX IF NOT EXISTS idx_assessments_user ON assessments(user_id);
`);

module.exports = db;
