const express = require("express");
const { v4: uuid } = require("uuid");
const db = require("../db");
const { requireAuth } = require("../middleware/auth");
const { requireAdmin } = require("../middleware/adminAuth");
const modempay = require("../services/modempay.service");
const bookOrderService = require("../services/bookOrder.service");

const router = express.Router();

// ---------- Public browsing ----------
// No subscription gate — the Book Store is a separate product from
// subject subscriptions, just login-gated like the rest of the app.
router.get("/", requireAuth, async (req, res) => {
  const user = await db.get("SELECT country_id FROM users WHERE id = $1", [req.userId]);
  const countryId = req.query.country || user.country_id;

  const rows = await db.all(
    `SELECT b.id, b.title, b.author, b.description, b.cover_image_url, p.price, p.currency
     FROM books b
     LEFT JOIN book_prices p ON p.book_id = b.id AND p.country_id = $1
     WHERE b.active = true
     ORDER BY b.created_at DESC`,
    [countryId]
  );

  res.json({
    books: rows.map((r) => ({
      id: r.id,
      title: r.title,
      author: r.author,
      description: r.description,
      coverImageUrl: r.cover_image_url,
      price: r.price !== null ? Number(r.price) : null,
      currency: r.currency,
    })),
  });
});

// ---------- My orders (registered before /:bookId to avoid Express
// matching "orders" as a bookId — literal paths must come first) ----------
router.get("/orders", requireAuth, async (req, res) => {
  const rows = await db.all(
    `SELECT o.*, b.title, b.author FROM book_orders o
     JOIN books b ON b.id = o.book_id
     WHERE o.user_id = $1 ORDER BY o.created_at DESC`,
    [req.userId]
  );
  res.json({
    orders: rows.map((r) => ({
      id: r.id,
      bookTitle: r.title,
      bookAuthor: r.author,
      quantity: r.quantity,
      status: r.status,
      deliveryType: r.delivery_type,
      createdAt: Number(r.created_at),
      fulfilledAt: r.fulfilled_at === null ? null : Number(r.fulfilled_at),
    })),
  });
});

router.get("/orders/:orderId/receipt.pdf", requireAuth, async (req, res) => {
  const pdf = await bookOrderService.getReceiptPdf(req.params.orderId, req.userId);
  if (!pdf) return res.status(404).json({ error: "Receipt not available for this order" });
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `attachment; filename="receipt-${req.params.orderId}.pdf"`);
  res.send(pdf);
});

// Fallback poll, same shape as the subscription payments poll — in
// case a webhook was missed.
router.get("/orders/:orderId/status", requireAuth, async (req, res) => {
  const order = await db.get("SELECT * FROM book_orders WHERE id = $1 AND user_id = $2", [req.params.orderId, req.userId]);
  if (!order) return res.status(404).json({ error: "Order not found" });

  if (order.status === "pending" && order.payment_id) {
    const payment = await db.get("SELECT * FROM payments WHERE id = $1", [order.payment_id]);
    if (payment && payment.status === "pending" && !payment.mock) {
      try {
        const remote = await modempay.retrievePaymentIntent(payment.provider_reference);
        if (remote.status === "successful") {
          await bookOrderService.fulfillFromPayment(payment.id);
        } else if (remote.status === "failed" || remote.status === "cancelled") {
          await bookOrderService.markFailed(payment.id);
        }
      } catch (e) {
        console.error("Could not poll Modem Pay for book order payment status", e);
      }
    }
  }

  const fresh = await db.get("SELECT status, fulfilled_at FROM book_orders WHERE id = $1", [order.id]);
  res.json({ status: fresh.status, fulfilledAt: fresh.fulfilled_at === null ? null : Number(fresh.fulfilled_at) });
});

// ---------- Checkout ----------
router.post("/:bookId/checkout", requireAuth, async (req, res) => {
  const { quantity, deliveryType, shippingAddress } = req.body || {};
  const qty = Number(quantity) || 1;
  if (qty < 1 || qty > 20) return res.status(400).json({ error: "quantity must be between 1 and 20" });

  const delivery = deliveryType === "physical" ? "physical" : "digital";
  if (delivery === "physical" && !shippingAddress) {
    return res.status(400).json({ error: "shippingAddress is required for physical delivery" });
  }

  const user = await db.get("SELECT * FROM users WHERE id = $1", [req.userId]);
  const priceRow = await db.get("SELECT * FROM book_prices WHERE book_id = $1 AND country_id = $2", [req.params.bookId, user.country_id]);
  const book = await db.get("SELECT * FROM books WHERE id = $1 AND active = true", [req.params.bookId]);
  if (!book || !priceRow) return res.status(404).json({ error: "Book not available in your country" });

  const totalAmount = Number(priceRow.price) * qty;
  const orderId = uuid();
  const paymentId = uuid();

  try {
    const intent = await modempay.createPaymentIntent({
      amountGmd: totalAmount,
      title: book.title + (qty > 1 ? ` x${qty}` : ""),
      description: "Next-Gen Academy Book Store order",
      customerEmail: user.email,
      metadata: { paymentId, userId: user.id, orderId },
    });

    await db.run(
      `INSERT INTO payments (id, user_id, country_id, purchase_type, order_id, amount, currency, provider, provider_reference, status, mock, created_at)
       VALUES ($1, $2, $3, 'book_order', $4, $5, $6, 'modempay', $7, 'pending', $8, $9)`,
      [paymentId, user.id, user.country_id, orderId, totalAmount, priceRow.currency, intent.providerReference ?? null, intent.mock ? 1 : 0, Date.now()]
    );

    await db.run(
      `INSERT INTO book_orders (id, user_id, book_id, payment_id, quantity, status, delivery_type, shipping_address, created_at)
       VALUES ($1, $2, $3, $4, $5, 'pending', $6, $7, $8)`,
      [orderId, user.id, book.id, paymentId, qty, delivery, delivery === "physical" ? shippingAddress : null, Date.now()]
    );

    res.status(201).json({
      orderId,
      paymentId,
      paymentLink: intent.paymentLink,
      mock: intent.mock,
      amount: totalAmount,
      currency: priceRow.currency,
    });
  } catch (e) {
    console.error("Book Store checkout failed", e);
    res.status(502).json({ error: "Could not start checkout with Modem Pay", detail: e.message });
  }
});

// ---------- Admin ----------
router.post("/", requireAdmin, async (req, res) => {
  const { title, author, description, coverImageUrl, prices } = req.body || {};
  if (!title) return res.status(400).json({ error: "title is required" });

  const book = { id: uuid(), title, author: author || null, description: description || null, cover_image_url: coverImageUrl || null, created_at: Date.now() };
  await db.run(
    `INSERT INTO books (id, title, author, description, cover_image_url, created_at) VALUES ($1, $2, $3, $4, $5, $6)`,
    [book.id, book.title, book.author, book.description, book.cover_image_url, book.created_at]
  );

  if (Array.isArray(prices)) {
    for (const p of prices) {
      if (!p.country || !p.price || !p.currency) continue;
      await db.run(
        `INSERT INTO book_prices (book_id, country_id, price, currency, updated_at) VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (book_id, country_id) DO UPDATE SET price = excluded.price, currency = excluded.currency, updated_at = excluded.updated_at`,
        [book.id, p.country, Number(p.price), p.currency, Date.now()]
      );
    }
  }

  res.status(201).json({ book });
});

router.put("/:bookId/price", requireAdmin, async (req, res) => {
  const { country, price, currency } = req.body || {};
  const n = Number(price);
  if (!country || !Number.isFinite(n) || n <= 0 || !currency) {
    return res.status(400).json({ error: "country, price (positive number), and currency are required" });
  }
  const book = await db.get("SELECT id FROM books WHERE id = $1", [req.params.bookId]);
  if (!book) return res.status(404).json({ error: "Unknown book" });

  await db.run(
    `INSERT INTO book_prices (book_id, country_id, price, currency, updated_at) VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (book_id, country_id) DO UPDATE SET price = excluded.price, currency = excluded.currency, updated_at = excluded.updated_at`,
    [req.params.bookId, country, n, currency, Date.now()]
  );
  res.json({ ok: true, bookId: req.params.bookId, country, price: n, currency });
});

// Amend a book's catalog fields (not price — see PUT /:bookId/price
// above for that). Only the fields provided are changed.
router.put("/:bookId", requireAdmin, async (req, res) => {
  const existing = await db.get("SELECT * FROM books WHERE id = $1", [req.params.bookId]);
  if (!existing) return res.status(404).json({ error: "Unknown book" });

  const { title, author, description, coverImageUrl } = req.body || {};
  await db.run(
    `UPDATE books SET title = $1, author = $2, description = $3, cover_image_url = $4 WHERE id = $5`,
    [
      title ?? existing.title,
      author !== undefined ? author : existing.author,
      description !== undefined ? description : existing.description,
      coverImageUrl !== undefined ? coverImageUrl : existing.cover_image_url,
      existing.id,
    ]
  );
  res.json({ ok: true });
});

// Soft delete: a book with real orders/receipts against it can never
// be hard-deleted without breaking that order history (a receipt
// needs to keep showing what was actually bought). Deactivating just
// removes it from GET /books' catalog listing instead.
router.delete("/:bookId", requireAdmin, async (req, res) => {
  const result = await db.run("UPDATE books SET active = false WHERE id = $1", [req.params.bookId]);
  if (result.rowCount === 0) return res.status(404).json({ error: "Unknown book" });
  res.json({ ok: true });
});

module.exports = router;
