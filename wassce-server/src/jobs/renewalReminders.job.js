const db = require("../db");
const email = require("../services/email.service");
const { getSubject } = require("../data/subjects");

const DAY_MS = 24 * 60 * 60 * 1000;
const SWEEP_INTERVAL_MS = 60 * 60 * 1000; // hourly

/**
 * Two reminder types, each checked with a 24-hour-wide window rather
 * than an exact instant — since this job runs hourly (not
 * continuously), an exact "expires_at - now === 3 days" check could
 * miss its one moment between sweeps. A day-wide window guarantees
 * an hourly sweep always catches it at least once.
 *
 * reminder_log's primary key on (subscription_id, reminder_type,
 * expires_at) is what actually prevents double-sends across
 * overlapping windows or repeated sweeps — the window width just
 * needs to be *at least* the sweep interval, not exact.
 */
const REMINDER_TYPES = [
  {
    type: "3_day",
    // subscriptions whose expiry falls 2-3 days from now
    windowStartOffset: 2 * DAY_MS,
    windowEndOffset: 3 * DAY_MS,
    subject: (subjectName) => `Your ${subjectName} subscription expires in 3 days`,
    body: (name, subjectName) =>
      `Hi ${name},\n\nYour subscription to ${subjectName} on WASSCE Study Hall expires in 3 days. ` +
      `Renew now to keep uninterrupted access to your study materials and self-assessments.\n\n— WASSCE Study Hall`,
  },
  {
    type: "expiry_day",
    // subscriptions that expired within the last 24 hours
    windowStartOffset: -1 * DAY_MS,
    windowEndOffset: 0,
    subject: (subjectName) => `Your ${subjectName} subscription has expired`,
    body: (name, subjectName) =>
      `Hi ${name},\n\nYour subscription to ${subjectName} on WASSCE Study Hall has expired today. ` +
      `Renew any time to pick up right where you left off.\n\n— WASSCE Study Hall`,
  },
];

async function sweepOnce() {
  const now = Date.now();

  for (const reminder of REMINDER_TYPES) {
    // windowStartOffset/windowEndOffset are relative to "now" and
    // describe when expires_at should fall for this reminder to
    // apply — e.g. 3_day: expires_at between (now+2d) and (now+3d).
    const rangeStart = now + reminder.windowStartOffset;
    const rangeEnd = now + reminder.windowEndOffset;

    const candidates = await db.all(
      `SELECT s.id, s.subject_id, s.country_id, s.expires_at, u.email, u.name
       FROM subscriptions s
       JOIN users u ON u.id = s.user_id
       WHERE s.status = 'active'
         AND s.expires_at BETWEEN $1 AND $2
         AND NOT EXISTS (
           SELECT 1 FROM reminder_log r
           WHERE r.subscription_id = s.id
             AND r.reminder_type = $3
             AND r.expires_at = s.expires_at
         )`,
      [rangeStart, rangeEnd, reminder.type]
    );

    for (const row of candidates) {
      const subject = getSubject(row.subject_id);
      const subjectName = subject ? subject.name : row.subject_id;

      try {
        await email.sendEmail({
          to: row.email,
          subject: reminder.subject(subjectName),
          text: reminder.body(row.name, subjectName),
          html:
            `<div style="font-family:sans-serif;max-width:480px;margin:0 auto;">` +
            `<img src="cid:logo" alt="Next-Gen Academy" width="72" style="display:block;margin-bottom:16px;">` +
            `<p style="white-space:pre-line;">${reminder.body(row.name, subjectName)}</p>` +
            `</div>`,
          attachments: [email.logoCidAttachment()],
        });

        // Logged only after a successful send: if sendEmail throws,
        // no row is written, so the next hourly sweep retries this
        // same subscription instead of silently giving up on it.
        await db.run(
          `INSERT INTO reminder_log (subscription_id, reminder_type, expires_at, sent_at)
           VALUES ($1, $2, $3, $4)
           ON CONFLICT DO NOTHING`,
          [row.id, reminder.type, row.expires_at, now]
        );
      } catch (e) {
        console.error(
          `Failed to send ${reminder.type} reminder for subscription ${row.id} (will retry next sweep):`,
          e.message
        );
      }
    }

    if (candidates.length > 0) {
      console.log(`Renewal reminders: sent ${candidates.length} '${reminder.type}' email(s).`);
    }
  }
}

/**
 * Starts the hourly sweep. Runs once immediately on startup (so a
 * reminder due right as the server restarts isn't stuck waiting up
 * to an hour), then every SWEEP_INTERVAL_MS after that.
 */
function start() {
  sweepOnce().catch((e) => console.error("Renewal reminder sweep failed", e));
  setInterval(() => {
    sweepOnce().catch((e) => console.error("Renewal reminder sweep failed", e));
  }, SWEEP_INTERVAL_MS);
}

module.exports = { start, sweepOnce };
