const mongoose = require("mongoose");
const { Schema } = mongoose;
const Enums = require("../utils/constants");

const promotionServiceSchema = new Schema(
  {
    service_type: {
      type: Number,
      required: true,
      enum: Object.values(Enums.SERVICE.TYPE),
    },
    promotional_rate: {
      type: Number,
      required: true,
      min: 0,
    },

    commission_pct: {
      type: Number,
      required: true,
      min: 0,
      max: 100,
    },
  },
  { _id: false },
);

const promotionSchema = new Schema(
  {
    title: {
      type: String,
      trim: true,
      required: true,
    },
    astrologers: [
      {
        type: Schema.Types.ObjectId,
        ref: "Astrologer",
        required: true,
      },
    ],

    services: {
      type: [promotionServiceSchema],
      validate: {
        validator: (arr) => Array.isArray(arr) && arr.length > 0,
        message: "At least one promotional service must be configured.",
      },
    },

    startDate: { type: Date, required: true },
    endDate: { type: Date, required: true },

    isActive: {
      type: Boolean,
      default: true,
    },

    createdBy: {
      type: Schema.Types.ObjectId,
      ref: "Admin",
    },
  },
  { timestamps: true },
);

promotionSchema.index({ astrologers: 1, startDate: 1, endDate: 1 });

// Is this promo live right this second? (used everywhere instead of
// trusting the cached `status` field)
promotionSchema.methods.isLiveNow = function () {
  const now = new Date();
  return this.isActive && this.startDate <= now && this.endDate >= now;
};

module.exports = mongoose.model("Promotion", promotionSchema);
