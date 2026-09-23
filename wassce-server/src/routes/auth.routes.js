const express = require("express");
const bcrypt = require("bcryptjs");
const crypto = require("crypto");
const { v4: uuid } = require("uuid");
const db = require("../db");
const { signToken, requireAuth } = require("../middleware/auth");
const { signupLimiter, loginLimiter, forgotPasswordLimiter } = require("../middleware/rateLimit");
const email = require("../services/email.service");

const router = express.Router();

const RESET_TOKEN_TTL_MS = 60 * 60 * 1000; // 1 hour

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

/**
 * Deliberately returns the SAME generic message whether or not the
 * email is actually registered — the alternative ("no account with
 * that email") is a classic email-enumeration leak, letting anyone
 * probe which addresses have accounts just by trying them here.
 */
router.post("/forgot-password", forgotPasswordLimiter, async (req, res) => {
  const { email: rawEmail } = req.body || {};
  const generic = { message: "If an account exists for that email, a password reset link has been sent." };

  if (!rawEmail || !isValidEmail(rawEmail)) {
    // Still generic — even telling someone "that's not a valid email
    // format" is a smaller, but real, information leak compared to
    // just treating it the same as "no account found."
    return res.json(generic);
  }

  const user = await db.get("SELECT * FROM users WHERE email = $1", [rawEmail.toLowerCase()]);
  if (!user) {
    return res.json(generic);
  }

  const token = crypto.randomBytes(32).toString("hex");
  const now = Date.now();

  // Invalidate any earlier outstanding tokens for this user first —
  // only the most recently requested reset link should actually
  // work, so an old email sitting in an inbox (or a previously
  // intercepted one) can't be used after a newer request.
  await db.run("DELETE FROM password_resets WHERE user_id = $1 AND used_at IS NULL", [user.id]);
  await db.run(
    `INSERT INTO password_resets (token, user_id, expires_at, created_at) VALUES ($1, $2, $3, $4)`,
    [token, user.id, now + RESET_TOKEN_TTL_MS, now]
  );

  const resetLink = "https://app.techhaven360.com/?reset=" + token;

  try {
    await email.sendEmail({
      to: user.email,
      subject: "Reset your Next-Gen Academy password",
      text:
        `Hi ${user.name},\n\nWe received a request to reset your password. This link is valid for 1 hour:\n\n${resetLink}\n\n` +
        "If you didn't request this, you can safely ignore this email — your password will stay unchanged.\n\n— Next-Gen Academy",
      html:
        `<div style="font-family:sans-serif;max-width:480px;margin:0 auto;">` +
        `<img src="cid:logo" alt="Next-Gen Academy" width="72" style="display:block;margin-bottom:16px;">` +
        `<p>Hi ${user.name},</p>` +
        `<p>We received a request to reset your password. This link is valid for 1 hour:</p>` +
        `<p><a href="${resetLink}">${resetLink}</a></p>` +
        `<p>If you didn't request this, you can safely ignore this email — your password will stay unchanged.</p>` +
        `<p style="color:#888;font-size:13px;margin-top:24px;">— Next-Gen Academy · techhaven360.com</p>` +
        `</div>`,
      attachments: [email.logoCidAttachment()],
    });
  } catch (e) {
    // The token is already stored and valid regardless of whether
    // the email actually made it out — log the failure but still
    // return the generic success response, both to avoid leaking
    // that delivery failed (which itself would confirm the account
    // exists) and because the link is real and usable either way if
    // the person contacts support for it.
    console.error("Failed to send password reset email", e);
  }

  res.json(generic);
});

router.post("/reset-password", async (req, res) => {
  const { token, password } = req.body || {};
  if (!token || !password) {
    return res.status(400).json({ error: "token and password are required" });
  }
  if (String(password).length < 8) {
    return res.status(400).json({ error: "Password must be at least 8 characters" });
  }

  const reset = await db.get("SELECT * FROM password_resets WHERE token = $1", [token]);
  const now = Date.now();
  if (!reset || reset.used_at !== null || Number(reset.expires_at) < now) {
    return res.status(400).json({ error: "This reset link is invalid or has expired. Please request a new one." });
  }

  const passwordHash = await bcrypt.hash(password, 10);
  await db.run("UPDATE users SET password_hash = $1 WHERE id = $2", [passwordHash, reset.user_id]);
  await db.run("UPDATE password_resets SET used_at = $1 WHERE token = $2", [now, token]);
  // Any other outstanding tokens for this user are now moot — a
  // password was just successfully changed, so an older reset link
  // (e.g. from a prior request) should stop working too.
  await db.run("DELETE FROM password_resets WHERE user_id = $1 AND used_at IS NULL", [reset.user_id]);

  res.json({ message: "Password updated. You can now log in with your new password." });
});

module.exports = router;
