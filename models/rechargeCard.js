// models/RechargeCard.js
const mongoose = require("mongoose");

const RechargeCardSchema = new mongoose.Schema({
  amount: {
    type: Number,
    required: [true, "Amount is required"],
    min: [1, "Amount must be greater than 0"],
  },

  bonus: {
    type: Number,
    default: 0,
  },

  discount_type: {
    type: String,
    enum: ["percentage", "fixed"],
    default: null,
  },

  // New: Mode — whether discount is OFF or EXTRA
  card_mode: {
    type: String,
    enum: ["OFF", "EXTRA"],
    default: null,
  },
  gst_percent: {
    type: Number,
    default: 0,
    min: 0,
    max: 100,
  },
  // Admin controls
  is_active: {
    type: Boolean,
    default: true,
  },
  is_applicable: {
    type: Boolean,
    default: false,
  },

  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
  },

  createdAt: {
    type: Date,
    default: Date.now,
  },
});

module.exports = mongoose.model("RechargeCard", RechargeCardSchema);
