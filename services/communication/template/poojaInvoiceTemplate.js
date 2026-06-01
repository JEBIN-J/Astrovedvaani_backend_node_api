const ejs = require("ejs");
const path = require("path");
const fs = require("fs");
const puppeteer = require("puppeteer");

const Invoice = require("../../../models/Invoice");

const { uploadPDF } = require("../../communication/template/invoiceTemplate");

exports.generatePoojaInvoicePdf = async (invoiceId, booking) => {
  try {
    const invoice = await Invoice.findById(invoiceId)
      .populate("user_id")
      .populate("order_id");

    if (!invoice) {
      throw new Error("Invoice not found");
    }

    const templatePath = path.join(
      __dirname,
      "../../communication/template/poojaInvoiceTemplate.ejs",
    );

    const html = await ejs.renderFile(templatePath, {
      invoice,
      booking,
      pooja: booking?.pooja_id || {},
      user: invoice.user_id || {},
    });

    const browser = await puppeteer.launch({
      headless: true,
      args: ["--no-sandbox"],
    });

    const page = await browser.newPage();

    await page.setContent(html, {
      waitUntil: "networkidle0",
    });

    const pdfBuffer = await page.pdf({
      format: "A4",
      printBackground: true,
    });

    await browser.close();

    const invoicesDir = path.join(__dirname, "../invoices");

    if (!fs.existsSync(invoicesDir)) {
      fs.mkdirSync(invoicesDir, {
        recursive: true,
      });
    }

    const pdfPath = path.join(invoicesDir, `${invoice.invoice_number}.pdf`);

    fs.writeFileSync(pdfPath, pdfBuffer);

    const uploadedUrl = await uploadPDF(pdfPath);

    invoice.invoiceUrl = uploadedUrl;

    await invoice.save();

    fs.unlinkSync(pdfPath);

    return {
      success: true,
      invoiceUrl: uploadedUrl,
    };
  } catch (err) {
    throw err;
  }
};
