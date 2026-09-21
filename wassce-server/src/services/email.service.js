const nodemailer = require("nodemailer");
const path = require("path");

const LOGO_PATH = path.join(__dirname, "..", "assets", "logo.png");

/**
 * A CID (content-id) attachment embeds the logo directly in the
 * email itself rather than linking to a hosted image URL — works
 * regardless of whether the recipient's mail client loads remote
 * images, and doesn't depend on the logo being hosted anywhere
 * public. Reference it in HTML as <img src="cid:logo">.
 */
function logoCidAttachment() {
  return { filename: "logo.png", path: LOGO_PATH, cid: "logo" };
}

/**
 * Mock/live pattern matching modempay.service.js and
 * anthropic.service.js: no SMTP credentials configured -> log what
 * would have been sent instead of failing or silently doing nothing.
 * Add real SMTP_* env vars later (any provider — Gmail, your host's
 * SMTP, SendGrid/Mailgun's SMTP relay, etc.) and it starts sending
 * for real with no code changes.
 */
function isMockMode() {
  return !process.env.SMTP_HOST;
}

let transporter = null;
function getTransporter() {
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT || 587),
      secure: Number(process.env.SMTP_PORT) === 465,
      auth: process.env.SMTP_USER
        ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
        : undefined,
    });
  }
  return transporter;
}

async function sendEmail({ to, subject, text, html, attachments }) {
  if (isMockMode()) {
    const attachmentNote = attachments && attachments.length
      ? ` [with attachment(s): ${attachments.map((a) => a.filename).join(", ")}]`
      : "";
    console.log(`[MOCK EMAIL] To: ${to} | Subject: ${subject}${attachmentNote}\n${text}`);
    return { mock: true };
  }

  await getTransporter().sendMail({
    from: {
      name: process.env.SMTP_FROM_NAME || "WASSCE Study Hall",
      address: process.env.SMTP_FROM || process.env.SMTP_USER,
    },
    to,
    subject,
    text,
    html: html || undefined,
    attachments: attachments || undefined,
  });
  return { mock: false };
}

module.exports = { isMockMode, sendEmail, logoCidAttachment };
