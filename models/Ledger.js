const mongoose = require("mongoose");
const { Schema } = mongoose;
const Enums = require("../utils/constants");

const ledgerSchema = new Schema(
  {
    wallet_id: {
      type: Schema.Types.ObjectId,
      ref: "Wallet",
      required: true,
    },

    transaction_type: {
      type: Number,
      enum: Object.values(Enums.TRANSACTION.TYPE),
      default: Enums.TRANSACTION.TYPE.SESSION,
      required: true,
    },

    direction: {
      type: Number,
      enum: Object.values(Enums.TRANSACTION.DIRECTION),
      required: true,
    },

    amount: {
      type: Number,
      required: true,
      min: 0,
    },

    gst_included: {
      type: Boolean,
      default: false,
    },

    gst_percent: {
      type: Number,
      default: 0,
      min: 0,
      max: 100,
    },
    bonus_amount: {
      type: Number,
      default: 0,
      min: 0,
      comment: "Any bonus/coupon added to this transaction",
    },

    credit_amount: {
      type: Number,
      default: 0,
      min: 0,
      comment: "Total amount to credit to wallet (amount + bonus)",
    },

    final_amount: {
      type: Number,
      required: true,
      min: 0,
    },

    payment_method: {
      type: Number,
      enum: Object.values(Enums.PAYMENT.METHOD),
      required: true,
      default: Enums.PAYMENT.METHOD.WALLET,
    },

    external_transaction_id: {
      type: String,
      default: null,
      trim: true,
      comment: "Transaction ID from Razorpay, Stripe etc.",
    },

    payment_provider: {
      type: Number,
      enum: Object.values(Enums.PAYMENT.PROVIDER),
      default: Enums.PAYMENT.PROVIDER.ASTROVEDVANNI,
      comment: "Gateway used if not wallet",
    },

    payment_status: {
      type: Number,
      enum: Object.values(Enums.PAYMENT.STATUS),
      default: Enums.PAYMENT.STATUS.PENDING,
      comment: "Payment status from provider",
    },

    order_id: {
      type: Schema.Types.ObjectId,
      ref: "Order",
      default: null,
    },

    related_entity_id: {
      type: String,
      default: null,
      comment:
        "Reference to external or internal entity like Razorpay order_id, Stripe session_id, etc.",
    },

    related_entity_type: {
      type: String,
      enum: Enums.ENTITY.TYPE,
      default: Enums.ENTITY.TYPE.SESSION,
      comment: "Type of the related entity or external system",
    },

    metadata: {
      type: Schema.Types.Mixed,
      default: {},
      comment: "Additional context like email, notes, webhook source etc.",
    },

    remarks: {
      type: String,
      trim: true,
    },

    timestamp: {
      type: Date,
      default: Date.now,
    },
    opening_balance: {
      type: Number,
      required: true,
      min: 0,
      comment: "Wallet balance before this transaction",
    },

    closing_balance: {
      type: Number,
      required: true,
      min: 0,
      comment: "Wallet balance after this transaction",
    },
  },
  {
    timestamps: true,
  },
);

ledgerSchema.index({ wallet_id: 1, timestamp: -1 });
ledgerSchema.index({ external_transaction_id: 1 });
ledgerSchema.index({ related_entity_id: 1, related_entity_type: 1 });

module.exports = mongoose.model("WalletLedger", ledgerSchema);
