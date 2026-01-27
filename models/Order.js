const mongoose = require("mongoose");
const { Schema } = mongoose;
const Enums = require("../utils/constants");

const orderSchema = new Schema(
  {
    user_id: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    order_type: {
      type: Number,
      enum: Object.values(Enums.ORDER.TYPE),
      default: Enums.ORDER.TYPE.SERVICE,
    },

    reference_id: {
      type: Schema.Types.ObjectId,
      required: true,
    },

    quantity: { type: Number, default: 1 },

    price_snapshot: {
      base_price: { type: Number },
      selling_price: { type: Number },
      gst_percent: { type: Number, default: 0 },
      discount: { type: Number, default: 0 },
      discountType: {
        type: String,
        enum: ["PERCENTAGE", "FIXED"],
        default: "PERCENTAGE",
      },
      final_price: { type: Number, required: true },
    },

    coupon_code: {
      type: String,
      default: null,
    },

    delivery_charge: {
      type: Number,
      default: 0,
    },

    total_payable: {
      type: Number,
      required: true,
    },

    payment_status: {
      type: Number,
      enum: Object.values(Enums.PAYMENT.STATUS),
      default: Enums.PAYMENT.STATUS.PENDING,
    },

    payment_method: {
      type: Number,
      enum: Object.values(Enums.PAYMENT.METHOD),
      default: Enums.PAYMENT.METHOD.WALLET,
    },

    transaction_id: {
      type: Schema.Types.ObjectId,
      ref: "WalletLedger",
      default: null,
    },

    paid_amount: {
      type: Number,
      required: true,
    },

    shipping_address: {
      type: Schema.Types.ObjectId,
      ref: "Address",
      default: null,
    },

    tracking_status: {
      type: Number,
      enum: Object.values(Enums.ORDER.STATUS),
      default: Enums.ORDER.STATUS.PENDING,
    },

    expected_delivery_date: {
      type: Date,
      default: null,
    },

    delivered_at: {
      type: Date,
      default: null,
    },

    remarks: { type: String, trim: true },
  },
  { timestamps: true },
);

orderSchema.index({ user_id: 1, order_type: 1 });

module.exports = mongoose.model("Order", orderSchema);
