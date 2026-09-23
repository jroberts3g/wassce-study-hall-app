const rateLimit = require("express-rate-limit");

/**
 * Signup: tight limit. There's no legitimate reason for the same IP
 * to create many accounts quickly — this is mainly about stopping
 * mass fake-account creation (relevant here since the leaderboard/
 * prizes feature planned for Phase 2 gives a concrete incentive to
 * game rankings with fake accounts) and general signup spam.
 */
const signupLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many accounts created from this network recently. Please try again later." },
});

/**
 * Login: looser than signup (real users mistype passwords sometimes)
 * but still capped, to blunt brute-force / credential-stuffing
 * attempts against known email addresses. Deliberately not keyed to
 * the submitted email — keying by IP only, so an attacker can't
 * dodge the limit by cycling through many target emails from one
 * machine, and one user's typos never lock out a different user
 * sharing the same NAT/office network for long (short window, login
 * traffic is naturally bursty for shared IPs).
 */
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many login attempts from this network. Please wait a few minutes and try again." },
});

/**
 * Forgot-password: tight limit similar to signup. This endpoint
 * always returns the same generic response regardless of whether the
 * email exists (to avoid leaking which addresses are registered),
 * but without a rate limit it could still be used to spam a real
 * user's inbox with reset emails, or as a slow email-enumeration
 * timing probe.
 */
const forgotPasswordLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many password reset requests from this network. Please try again later." },
});

module.exports = { signupLimiter, loginLimiter, forgotPasswordLimiter };
