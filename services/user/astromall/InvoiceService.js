const logger = require("../../../utils/logger");
const Invoice = require("../../../models/Invoice");
const Address = require("../../../models/Address");
const ejs = require("ejs");
const path = require("path");
const fs = require("fs");
const axios = require("axios");
const FormData = require("form-data");
const puppeteer = require("puppeteer");

exports.generateInvoice = async (order, transactionId) => {
  logger.info(`[Invoice] Start generateInvoice orderId=${order?._id}`);

  try {
    // -------------------------------
    // ADDRESS SNAPSHOT (SAFE DEFAULT)
    // -------------------------------
    let addressSnapshot = {
      full_name: "N/A",
      mobile_number: "N/A",
      address_line1: "N/A",
      city: "N/A",
      state: "N/A",
      country: "India",
      pincode: "000000",
      landmark: "",
    };

    if (order.shipping_address) {
      logger.info(
        `[Invoice] Fetching address addressId=${order.shipping_address}`,
      );

      const addressDoc = await Address.findById(order.shipping_address).lean();
      if (addressDoc) {
        addressSnapshot = {
          full_name: addressDoc.name || "N/A",
          mobile_number: addressDoc.phone || "N/A",
          address_line1: addressDoc.line1 || "N/A",
          address_line2: addressDoc.line2 || "",
          city: addressDoc.city || "N/A",
          state: addressDoc.state || "N/A",
          country: addressDoc.country || "India",
          pincode: addressDoc.pincode || "000000",
          landmark: "",
        };
      }
    }

    const ps = order.price_snapshot || {};

    logger.info(
      `[Invoice] Pricing base=${ps.base_price} selling=${ps.selling_price} final=${ps.final_price} payable=${order.total_payable}`,
    );

    // -------------------------------
    // CREATE INVOICE DOCUMENT
    // -------------------------------
    const invoice = await Invoice.create({
      invoice_number: `INV-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      order_id: order._id,
      user_id: order.user_id,
      payment_method: order.payment_method,
      transaction_id: transactionId || null,

      price_snapshot: {
        base_price: Number(ps.base_price || 0),
        selling_price: Number(ps.selling_price || 0),
        gst_percent: Number(ps.gst_percent || 0),
        discount: Number(ps.discount || 0),
        final_price: Number(ps.final_price || 0),
        total_payable: Number(order.total_payable || 0),
        quantity: order.quantity || 1,
      },

      address_snapshot: addressSnapshot,
      remarks: "GST adjusted via wallet",
    });

    logger.info(`[Invoice] Invoice DB created invoiceId=${invoice._id}`);

    // -------------------------------
    // PDF GENERATION (NON BLOCKING)
    // -------------------------------
    try {
      logger.info(`[Invoice] Starting PDF generation invoiceId=${invoice._id}`);

      const pdfResult = await exports.generateInvoicePdf(invoice._id);

      logger.info(
        `[Invoice] PDF generated invoiceId=${invoice._id} url=${pdfResult.invoiceUrl}`,
      );
    } catch (pdfErr) {
      logger.error(
        `[Invoice] PDF generation FAILED invoiceId=${invoice._id} error=${pdfErr?.stack}`,
      );
    }

    return invoice;
  } catch (err) {
    logger.error(
      `[Invoice] generateInvoice FAILED orderId=${order?._id} error=${err?.stack}`,
    );
    throw err;
  }
};
exports.generateInvoicePdf = async (
  invoiceId,
  dealerAddress = {},
  companyAddress = {},
) => {
  logger.info(`[InvoicePDF] Start generateInvoicePdf invoiceId=${invoiceId}`);

  try {
    const invoice = await Invoice.findById(invoiceId)
      .populate({
        path: "order_id",
        populate: { path: "reference_id", model: "Product" },
      })
      .populate("user_id");

    if (!invoice) {
      throw new Error("Invoice not found");
    }

    const templatePath = path.join(
      __dirname,
      "../../communication/template/invoiceTemplate.ejs",
    );

    logger.info(`[InvoicePDF] Using template ${templatePath}`);

    const finalDealerAddress = {
      name: "Dummy Dealer",
      addressLine1: "123, Dealer Street",
      city: "Bengaluru",
      state: "Karnataka",
      pincode: "560078",
      email: "dealer@example.com",
      phone: "+91 9876543210",
      gstin: "29DIVIN1234A1Z9",
      ...dealerAddress,
    };

    const finalCompanyAddress = {
      name: "Dummy Company Pvt. Ltd.",
      addressLine1: "221B, MG Road",
      city: "Bengaluru",
      state: "Karnataka",
      pincode: "560001",
      email: "support@company.com",
      phone: "+91 9876543210",
      gstin: "29ABCDE1234F1Z5",
      ...companyAddress,
    };

    const html = await ejs.renderFile(templatePath, {
      invoice,
      product: invoice.order_id?.reference_id || {},
      dealerAddress: finalDealerAddress,
      companyAddress: finalCompanyAddress,
    });

    const browser = await puppeteer.launch({
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
    });

    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: "networkidle0" });

    const pdfBuffer = await page.pdf({
      format: "A4",
      printBackground: true,
    });

    await browser.close();

    const invoicesDir = path.join(__dirname, "../invoices");
    if (!fs.existsSync(invoicesDir)) {
      fs.mkdirSync(invoicesDir, { recursive: true });
    }

    const pdfPath = path.join(invoicesDir, `${invoice.invoice_number}.pdf`);

    fs.writeFileSync(pdfPath, pdfBuffer);

    const uploadedUrl = await uploadPDF(pdfPath);

    invoice.invoiceUrl = uploadedUrl;
    await invoice.save();

    fs.unlinkSync(pdfPath);

    logger.info(
      `[InvoicePDF] Completed invoiceId=${invoice._id} url=${uploadedUrl}`,
    );

    return {
      success: true,
      invoiceUrl: uploadedUrl,
      invoiceId: invoice._id,
    };
  } catch (err) {
    logger.error(
      `[InvoicePDF] FAILED invoiceId=${invoiceId} error=${err?.stack}`,
    );
    throw err;
  }
};
exports.getInvoices = async (userId, order_id) => {
  logger.info(
    `[Invoice] Fetch invoices userId=${userId} orderId=${order_id || "ALL"}`,
  );

  const query = { user_id: userId };
  if (order_id) query.order_id = order_id;

  const invoices = await Invoice.find(query).sort({ issued_at: -1 }).lean();

  return invoices.length === 1 ? invoices[0] : invoices;
};
const uploadPDF = async (pdfFullPath) => {
  logger.info(`[Invoice] Uploading PDF path=${pdfFullPath}`);
  const form = new FormData();
  form.append("file", fs.createReadStream(pdfFullPath));
  const res = await axios.post(
    `${process.env.APP_BASE_URL}/api/file/upload`,
    form,
    { headers: form.getHeaders() },
  );

  if (!res.data?.url) {
    throw new Error("Upload failed: URL missing");
  }

  logger.info(`[Invoice] PDF uploaded url=${res.data.url}`);
  return res.data.url;
};

module.exports = { uploadPDF };
