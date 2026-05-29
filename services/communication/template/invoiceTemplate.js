const PDFDocument = require("pdfkit");
const fs = require("fs");
const path = require("path");
const axios = require("axios");
const FormData = require("form-data");
const logger = require("../../../utils/logger");

// ---- Generate PDF and return local path ----
const generateInvoicePDF = (invoice) => {
  return new Promise((resolve, reject) => {
    const invoicesDir = path.join(process.cwd(), "public", "invoices");
    if (!fs.existsSync(invoicesDir))
      fs.mkdirSync(invoicesDir, { recursive: true });

    const filePath = path.join(invoicesDir, `${invoice.invoice_number}.pdf`);
    const doc = new PDFDocument({ margin: 40 });
    const writeStream = fs.createWriteStream(filePath);

    doc.pipe(writeStream);

    // ---- Header ----
    doc
      .fontSize(22)
      .fillColor("#0CAC66")
      .text("astrovedvanni", { align: "center" })
      .moveDown(0.5);
    doc
      .fontSize(14)
      .fillColor("#444")
      .text(`Invoice #: ${invoice.invoice_number}`, { align: "center" })
      .text(`Date: ${new Date(invoice.issued_at).toLocaleDateString()}`, {
        align: "center",
      })
      .moveDown(2);

    // ---- Customer Info ----
    const addr = invoice.address_snapshot || {};
    doc
      .fontSize(14)
      .fillColor("#000")
      .text("Billed To:", { underline: true })
      .moveDown(0.2);
    doc
      .fontSize(12)
      .text(`${addr.full_name || "N/A"}`)
      .text(`${addr.address_line1 || ""}`)
      .text(`${addr.address_line2 || ""}`)
      .text(`${addr.city || ""}, ${addr.state || ""} ${addr.pincode || ""}`)
      .text(`${addr.country || ""}`)
      .text(`Phone: ${addr.mobile_number || "N/A"}`)
      .moveDown(1);

    // ---- Payment / Order Info ----
    const p = invoice.price_snapshot || {};
    doc.fontSize(14).text("Order Details:", { underline: true }).moveDown(0.3);
    doc
      .fontSize(12)
      .text(`Order ID: ${invoice.order_id}`)
      .text(`Payment Method: ${invoice.payment_method}`)
      .text(`Transaction ID: ${invoice.transaction_id || "N/A"}`)
      .moveDown(1);

    // ---- Pricing Table ----
    doc
      .fontSize(14)
      .text("Price Breakdown:", { underline: true })
      .moveDown(0.3);
    doc
      .fontSize(12)
      .text(`Base Price: ₹${p.base_price || 0}`)
      .text(`GST: ${p.gst_percent || 0}%`)
      .text(`Discount: ₹${p.discount || 0}`)
      .text(`Delivery: ₹${p.delivery_charge || 0}`)
      .text(`Final Amount: ₹${p.total_payable || 0}`)
      .moveDown(2);

    // ---- Footer ----
    doc
      .fontSize(10)
      .fillColor("#888")
      .text("This is a computer-generated invoice from astrovedvanni.", {
        align: "center",
      })
      .moveDown(0.5)
      .text("Thank you for your purchase!", { align: "center" });

    doc.end();

    writeStream.on("finish", () => resolve(filePath));
    writeStream.on("error", (err) => reject(err));
  });
};

// ---- Upload PDF to server ----
const uploadPDF = async (pdfFullPath) => {
  const form = new FormData();
  form.append("file", fs.createReadStream(pdfFullPath));
  const res = await axios.post(
    "https://api.astrovedvaani.com/api/file/upload",
    form,
    { headers: form.getHeaders() },
  );
  if (!res.data?.url) throw new Error("No URL returned from upload");
  return res.data.url;
};

module.exports = { generateInvoicePDF, uploadPDF };
