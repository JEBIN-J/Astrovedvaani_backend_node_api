const logger = require("../../utils/logger");
const Invoice = require("../../models/Invoice");

const {
  generatePoojaInvoicePdf,
} = require("../../services/communication/template/poojaInvoiceTemplate");

exports.generatePoojaInvoice = async (booking, order, transactionId = null) => {
  try {
    logger.info(`[PoojaInvoice] Start bookingId=${booking?._id}`);

    const ps = booking.price_snapshot || {};

    const invoice = await Invoice.create({
      invoice_number: `POOJA-INV-${Date.now()}`,

      order_id: order._id,

      user_id: booking.user_id,

      payment_method: order.payment_method,

      transaction_id: transactionId || null,

      price_snapshot: {
        base_price: Number(ps.base_price || 0),

        selling_price: Number(ps.base_price || 0),

        gst_percent: Number(ps.gst_percent || 0),

        discount: Number(ps.discount || 0),

        final_price: Number(ps.final_price || 0),

        delivery_charge: 0,

        total_payable: Number(ps.final_price || 0),

        quantity: 1,
      },

      address_snapshot: {
        full_name: booking.user_id?.name || "N/A",

        mobile_number: booking.user_id?.mobileNumber || "N/A",

        address_line1: "N/A",

        city: "N/A",

        state: "N/A",

        country: "India",

        pincode: "000000",
      },

      remarks: "Pooja Invoice",
    });

    await generatePoojaInvoicePdf(invoice._id, booking);

    logger.info(`[PoojaInvoice] Completed invoiceId=${invoice._id}`);

    return invoice;
  } catch (err) {
    logger.error(`[PoojaInvoice] FAILED error=${err?.stack}`);

    throw err;
  }
};
