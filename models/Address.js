const mongoose = require("mongoose");
const Enums = require("../utils/constants");
const { Schema } = mongoose;

const addressSchema = new Schema(
  {
    user_id: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    label: {
      type: Number,
      enum: Object.values(Enums.ADDRESS.TYPE),
      default: Enums.ADDRESS.TYPE.HOME,
    },

    name: {
      type: String,
      trim: true,
    },
    email: {
      type: String,
      lowercase: true,
      trim: true,
    },
    phone: {
      type: String,
    },

    line1: {
      type: String,
    },

    line2: {
      type: String,
      default: "",
    },

    city: {
      type: String,
      required: true,
    },

    state: {
      type: String,
    },

    pincode: {
      type: String,
    },

    country: {
      type: String,
      default: "India",
    },

    is_default: {
      type: Boolean,
      default: false,
    },

    is_active: {
      type: Boolean,
      default: false,
    },
  },
  { timestamps: true },
);

addressSchema.index({ user_id: 1, is_default: -1 });

module.exports = mongoose.model("Address", addressSchema);
