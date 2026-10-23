/**
 * Protects settings changes with a shared secret (ADMIN_SECRET in
 * .env) rather than building a full admin-role system for what is,
 * for now, a single-operator platform. Sent as the X-Admin-Secret
 * header. If ADMIN_SECRET isn't set at all, admin actions are
 * disabled outright rather than silently left open.
 */
function requireAdmin(req, res, next) {
  const configured = process.env.ADMIN_SECRET;
  if (!configured) {
    return res.status(503).json({
      error: "Admin settings are disabled — set ADMIN_SECRET in your .env file first",
    });
  }
  const provided = req.headers["x-admin-secret"];
  if (!provided || provided !== configured) {
    return res.status(403).json({ error: "Invalid admin secret" });
  }
  next();
}

module.exports = { requireAdmin };
