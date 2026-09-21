const PDFDocument = require("pdfkit");
const path = require("path");

const LOGO_PATH = path.join(__dirname, "..", "assets", "logo.png");

/**
 * Generates a simple, clean PDF receipt for a book order. Returns a
 * Promise<Buffer> — pdfkit is a stream-based API, so we collect the
 * chunks ourselves rather than writing to disk (no receipt file ever
 * needs to persist; both callers — the download endpoint and the
 * confirmation email — just need the bytes once, on demand).
 */
function generateReceiptPdf({ order, book, user, amount, currency, paidAt }) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margin: 50 });
    const chunks = [];
    doc.on("data", (chunk) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    // The logo image already carries the "Next-Gen Academy" wordmark
    // baked in, so it replaces the plain-text heading rather than
    // sitting alongside a redundant second copy of the name.
    doc.image(LOGO_PATH, 50, 40, { width: 70 });
    doc.fontSize(10).fillColor("#666").text("techhaven360.com", 130, 62);
    doc.y = 130;
    doc.x = 50;

    doc.fontSize(16).fillColor("#000").text("Receipt", { align: "left" });
    doc.moveDown(0.5);

    doc.fontSize(10).fillColor("#333");
    doc.text(`Receipt for order: ${order.id}`);
    doc.text(`Date: ${new Date(paidAt).toLocaleString("en-GB", { dateStyle: "long", timeStyle: "short" })}`);
    doc.moveDown(1);

    doc.fontSize(11).fillColor("#000").text("Billed to:", { underline: true });
    doc.fontSize(10).fillColor("#333").text(user.name);
    doc.text(user.email);
    doc.moveDown(1);

    doc.fontSize(11).fillColor("#000").text("Order details:", { underline: true });
    doc.moveDown(0.3);

    const tableTop = doc.y;
    doc.fontSize(10).fillColor("#000");
    doc.text("Item", 50, tableTop, { width: 250, continued: false });
    doc.text("Qty", 300, tableTop, { width: 60 });
    doc.text("Delivery", 360, tableTop, { width: 90 });
    doc.text("Amount", 450, tableTop, { width: 95, align: "right" });
    doc.moveTo(50, doc.y + 4).lineTo(545, doc.y + 4).strokeColor("#ccc").stroke();
    doc.moveDown(0.6);

    const rowY = doc.y;
    doc.fontSize(10).fillColor("#333");
    doc.text(book.title + (book.author ? ` — ${book.author}` : ""), 50, rowY, { width: 250 });
    doc.text(String(order.quantity), 300, rowY, { width: 60 });
    doc.text(order.delivery_type === "physical" ? "Physical" : "Digital", 360, rowY, { width: 90 });
    doc.text(`${currency} ${Number(amount).toFixed(2)}`, 450, rowY, { width: 95, align: "right" });

    if (order.delivery_type === "physical" && order.shipping_address) {
      doc.moveDown(2);
      doc.fontSize(11).fillColor("#000").text("Shipping address:", { underline: true });
      doc.fontSize(10).fillColor("#333").text(order.shipping_address);
    }

    doc.moveDown(2.5);
    doc.moveTo(50, doc.y).lineTo(545, doc.y).strokeColor("#ccc").stroke();
    doc.moveDown(0.6);
    doc.fontSize(12).fillColor("#000").text(`Total paid: ${currency} ${Number(amount).toFixed(2)}`, { align: "right" });

    doc.moveDown(2);
    doc.fontSize(9).fillColor("#888").text(
      "This is a computer-generated receipt for a purchase made through Next-Gen Academy's Book Store. " +
        "For support, contact Support@techhaven360.com.",
      { align: "left" }
    );

    doc.end();
  });
}

module.exports = { generateReceiptPdf };
