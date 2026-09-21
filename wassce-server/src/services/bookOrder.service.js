const db = require("../db");
const email = require("./email.service");
const { generateReceiptPdf } = require("./receipt.service");

/**
 * Mirrors subscription.service.js's activateFromPayment: idempotent
 * (a payment already marked succeeded is left alone, so a retried
 * webhook delivery never double-fulfills or double-emails), and
 * driven entirely by the payment row rather than needing the caller
 * to pass extra context.
 *
 * Digital orders are fulfilled immediately (fulfilled_at = now,
 * access is instant). Physical orders are marked 'succeeded' but
 * fulfilled_at stays null until an admin actually ships them and
 * marks it — payment succeeding isn't the same as a package being
 * in the mail.
 */
async function fulfillFromPayment(paymentId) {
  const payment = await db.get("SELECT * FROM payments WHERE id = $1", [paymentId]);
  if (!payment || payment.purchase_type !== "book_order") {
    throw new Error("Payment " + paymentId + " is not a book order payment");
  }
  if (payment.status === "succeeded") {
    return; // already processed — don't re-fulfill or re-email on a retried webhook
  }

  const order = await db.get("SELECT * FROM book_orders WHERE payment_id = $1", [payment.id]);
  if (!order) throw new Error("No book_order found for payment " + paymentId);

  const now = Date.now();
  const fulfilledAt = order.delivery_type === "digital" ? now : null;

  await db.run("UPDATE book_orders SET status = 'succeeded', fulfilled_at = $1 WHERE id = $2", [fulfilledAt, order.id]);
  await db.run("UPDATE payments SET status = 'succeeded', confirmed_at = $1 WHERE id = $2", [now, payment.id]);

  // Receipt + email happen after both rows are updated, and failures
  // here don't roll back the fulfillment — the purchase is real and
  // paid for either way. Errors are logged, not thrown, so a flaky
  // SMTP send can't leave a paid order looking unfulfilled.
  try {
    await sendReceipt(order, payment);
  } catch (e) {
    console.error("Order fulfilled, but sending the receipt email failed for order " + order.id, e);
  }
}

async function markFailed(paymentId) {
  const payment = await db.get("SELECT * FROM payments WHERE id = $1", [paymentId]);
  if (!payment || payment.purchase_type !== "book_order") return;
  await db.run("UPDATE payments SET status = 'failed' WHERE id = $1 AND status = 'pending'", [paymentId]);
  await db.run(
    "UPDATE book_orders SET status = 'failed' WHERE payment_id = $1 AND status = 'pending'",
    [paymentId]
  );
}

async function sendReceipt(order, payment) {
  const [book, user] = await Promise.all([
    db.get("SELECT * FROM books WHERE id = $1", [order.book_id]),
    db.get("SELECT * FROM users WHERE id = $1", [order.user_id]),
  ]);

  const pdf = await generateReceiptPdf({
    order,
    book,
    user,
    amount: payment.amount,
    currency: payment.currency,
    paidAt: Date.now(),
  });

  await email.sendEmail({
    to: user.email,
    subject: "Your Next-Gen Academy receipt — " + book.title,
    text:
      `Hi ${user.name},\n\nThank you for your purchase of "${book.title}". Your receipt is attached.\n\n` +
      (order.delivery_type === "digital"
        ? "Your copy is available now in the app under My Orders."
        : "We'll be in touch once your order ships.") +
      "\n\n— Next-Gen Academy",
    html:
      `<div style="font-family:sans-serif;max-width:480px;margin:0 auto;">` +
      `<img src="cid:logo" alt="Next-Gen Academy" width="72" style="display:block;margin-bottom:16px;">` +
      `<p>Hi ${user.name},</p>` +
      `<p>Thank you for your purchase of <strong>${book.title}</strong>. Your receipt is attached.</p>` +
      `<p>${order.delivery_type === "digital"
        ? "Your copy is available now in the app under My Orders."
        : "We'll be in touch once your order ships."}</p>` +
      `<p style="color:#888;font-size:13px;margin-top:24px;">— Next-Gen Academy · techhaven360.com</p>` +
      `</div>`,
    attachments: [
      email.logoCidAttachment(),
      { filename: "receipt-" + order.id + ".pdf", content: pdf, contentType: "application/pdf" },
    ],
  });
}

/**
 * Regenerates a receipt PDF on demand for the download endpoint —
 * receipts aren't stored as files anywhere; they're cheap to
 * regenerate from the order/payment/book/user rows, which avoids
 * ever needing binary storage for something this small and static.
 */
async function getReceiptPdf(orderId, userId) {
  const order = await db.get("SELECT * FROM book_orders WHERE id = $1 AND user_id = $2", [orderId, userId]);
  if (!order || order.status !== "succeeded") return null;

  const payment = order.payment_id ? await db.get("SELECT * FROM payments WHERE id = $1", [order.payment_id]) : null;
  const [book, user] = await Promise.all([
    db.get("SELECT * FROM books WHERE id = $1", [order.book_id]),
    db.get("SELECT * FROM users WHERE id = $1", [userId]),
  ]);
  if (!payment || !book || !user) return null;

  return generateReceiptPdf({
    order,
    book,
    user,
    amount: payment.amount,
    currency: payment.currency,
    paidAt: Number(payment.confirmed_at) || Number(order.created_at),
  });
}

module.exports = { fulfillFromPayment, markFailed, getReceiptPdf };
