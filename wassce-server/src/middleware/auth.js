const jwt = require("jsonwebtoken");
const crypto = require("crypto");

/**
 * JWT_SECRET must never silently fall back to a hardcoded value. A
 * hardcoded fallback here would be visible to anyone who has ever
 * seen this codebase (git history, a shared zip, etc.), letting them
 * forge valid login tokens for any user if the app ever ran in
 * production without JWT_SECRET actually set in the environment.
 *
 * Production: refuse to start at all without a real, sufficiently
 * long secret — fail loudly at boot, not silently at runtime.
 * Development: generate a random secret for this process only if
 * none is set, so local dev still works without a .env, but every
 * restart invalidates existing tokens (a visible, harmless nudge to
 * just set JWT_SECRET in .env instead of relying on this).
 */
function resolveJwtSecret() {
  const configured = process.env.JWT_SECRET;
  const isProduction = process.env.NODE_ENV === "production";

  if (configured && configured.length >= 32) {
    return configured;
  }

  if (isProduction) {
    throw new Error(
      configured
        ? "JWT_SECRET is set but too short (must be at least 32 characters). Generate one with: node -e \"console.log(require('crypto').randomBytes(64).toString('hex'))\""
        : "JWT_SECRET is not set. Refusing to start in production without it. Generate one with: node -e \"console.log(require('crypto').randomBytes(64).toString('hex'))\" and set it in your environment."
    );
  }

  console.warn(
    "WARNING: JWT_SECRET is not set (or too short) — using a random secret for this process only. " +
      "All existing tokens will be invalidated on every restart. Set JWT_SECRET in .env to avoid this."
  );
  return crypto.randomBytes(64).toString("hex");
}

const JWT_SECRET = resolveJwtSecret();

function signToken(user) {
  return jwt.sign({ sub: user.id, email: user.email }, JWT_SECRET, {
    expiresIn: "30d",
  });
}

function requireAuth(req, res, next) {
  const header = req.headers.authorization || "";
  const [scheme, token] = header.split(" ");
  if (scheme !== "Bearer" || !token) {
    return res.status(401).json({ error: "Missing or malformed Authorization header" });
  }
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    req.userId = payload.sub;
    next();
  } catch (e) {
    return res.status(401).json({ error: "Invalid or expired token" });
  }
}

module.exports = { signToken, requireAuth, JWT_SECRET };
