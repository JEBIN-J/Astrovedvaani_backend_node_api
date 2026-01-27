const mongoose = require('mongoose');
const { Schema } = mongoose;

const invoiceSchema = new Schema(
  {
    invoice_number: {
      type: String,
      required: true,
      unique: true
    },
    order_id: {
      type: Schema.Types.ObjectId,
      ref: 'Order',
      required: true,
      index: true
    },
    user_id: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true
    },
    payment_method: {
      type: Number,
      required: true
    },
    transaction_id: {
      type: Schema.Types.ObjectId,
      ref: 'WalletLedger',
      default: null
    },
    price_snapshot: {
      base_price: { type: Number, required: true },
      selling_price: { type: Number, required: true },
      gst_percent: { type: Number, default: 0 },
      discount: { type: Number, default: 0 },
      final_price: { type: Number, required: true },
      delivery_charge: { type: Number, default: 0 },
      total_payable: { type: Number, required: true },
      coupon_code: { type: String, default: null },
      quantity: { type: Number, default: 1 }
    },
    address_snapshot: {
      full_name: { type: String, required: true },
      mobile_number: { type: String, required: true },
      address_line1: { type: String, required: true },
      address_line2: { type: String },
      city: { type: String, required: true },
      state: { type: String, required: true },
      country: { type: String, required: true, default: 'India' },
      pincode: { type: String, required: true },
      landmark: { type: String }
    },
    issued_at: {
      type: Date,
      default: Date.now
    },
    remarks: {
      type: String,
      trim: true
    },
    invoiceUrl:{
      type:String
    }
  },
  { timestamps: true }
);
invoiceSchema.index({ user_id: 1, order_id: 1 });
module.exports = mongoose.model('Invoice', invoiceSchema);