const express = require("express");
const bcrypt = require("bcryptjs");
const { v4: uuid } = require("uuid");
const db = require("../db");
const { signToken, requireAuth } = require("../middleware/auth");
const { signupLimiter, loginLimiter } = require("../middleware/rateLimit");

const router = express.Router();

function randomCandidateNo() {
  return String(Math.floor(1000000 + Math.random() * 8999999));
}

function isValidEmail(email) {
  return typeof email === "string" && /^\S+@\S+\.\S+$/.test(email);
}

router.post("/signup", signupLimiter, async (req, res) => {
  const { name, email, phone, password, country } = req.body || {};

  if (!name || !email || !password) {
    return res.status(400).json({ error: "name, email and password are required" });
  }
  if (!isValidEmail(email)) {
    return res.status(400).json({ error: "Enter a valid email address" });
  }
  if (String(password).length < 8) {
    return res.status(400).json({ error: "Password must be at least 8 characters" });
  }

  const existing = await db.get("SELECT id FROM users WHERE email = $1", [email.toLowerCase()]);
  if (existing) {
    return res.status(409).json({ error: "An account with that email already exists" });
  }

  // country defaults to Gambia (the only live country today) if not
  // given; an invalid id is caught by the FK to countries below
  // rather than re-validated here, so this list never has to be kept
  // in sync by hand as countries are added.
  const countryId = country || "gm";

  const passwordHash = await bcrypt.hash(password, 10);
  const user = {
    id: uuid(),
    name,
    email: email.toLowerCase(),
    phone: phone || null,
    password_hash: passwordHash,
    candidate_no: randomCandidateNo(),
    country_id: countryId,
    created_at: Date.now(),
  };

  try {
    await db.run(
      `INSERT INTO users (id, name, email, phone, password_hash, candidate_no, country_id, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [user.id, user.name, user.email, user.phone, user.password_hash, user.candidate_no, user.country_id, user.created_at]
    );
  } catch (e) {
    if (e.code === "23503") {
      // foreign_key_violation — countryId isn't a real country
      return res.status(400).json({ error: "Unknown country" });
    }
    throw e;
  }

  const token = signToken(user);
  res.status(201).json({
    token,
    user: { id: user.id, name: user.name, email: user.email, candidateNo: user.candidate_no, countryId: user.country_id },
  });
});

router.post("/login", loginLimiter, async (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) {
    return res.status(400).json({ error: "email and password are required" });
  }

  const user = await db.get("SELECT * FROM users WHERE email = $1", [String(email).toLowerCase()]);
  if (!user) {
    return res.status(401).json({ error: "Incorrect email or password" });
  }

  const ok = await bcrypt.compare(password, user.password_hash);
  if (!ok) {
    return res.status(401).json({ error: "Incorrect email or password" });
  }

  const token = signToken(user);
  res.json({
    token,
    user: { id: user.id, name: user.name, email: user.email, candidateNo: user.candidate_no, countryId: user.country_id },
  });
});

router.get("/me", requireAuth, async (req, res) => {
  const user = await db.get(
    "SELECT id, name, email, phone, candidate_no, country_id, created_at FROM users WHERE id = $1",
    [req.userId]
  );
  if (!user) return res.status(404).json({ error: "User not found" });
  res.json({
    id: user.id,
    name: user.name,
    email: user.email,
    phone: user.phone,
    candidateNo: user.candidate_no,
    countryId: user.country_id,
    createdAt: Number(user.created_at),
  });
});

module.exports = router;
