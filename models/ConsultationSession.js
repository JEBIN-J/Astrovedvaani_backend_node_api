const mongoose = require("mongoose");
const Enums = require("../utils/constants");
const { Schema } = mongoose;

const ALL_STATUS_REASONS = [
  ...Object.values(Enums.SERVICE.STATUS_REASON.CANCELLED),
  ...Object.values(Enums.SERVICE.STATUS_REASON.COMPLETED),
  ...Object.values(Enums.SERVICE.STATUS_REASON.NO_SHOW),
];

const consultationSessionSchema = new Schema(
  {
    user_id: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    astrologer_user_id: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    astrologer_id: {
      type: Schema.Types.ObjectId,
      ref: "Astrologer",
    },

    mode: {
      type: Number,
      enum: Object.values(Enums.SERVICE.TYPE),
      default: Enums.SERVICE.TYPE.CHAT,
    },

    start_time: {
      type: Date,
      required: true,
    },

    end_time: {
      type: Date,
    },

    duration_minutes: {
      type: Number,
      min: 1,
    },

    rate_per_minute: {
      type: Number,
      required: true,
      min: 1,
    },

    total_buffer_time: {
      type: Number,
      default: 0,
    },

    total_amount: {
      type: Number,
      min: 0,
    },

    astrologer_share_amount: {
      type: Number,
      min: 0,
      required: true,
    },

    commission_pct: {
      type: Number,
      required: true,
      min: 0,
      max: 100,
    },

    status: {
      type: Number,
      enum: Object.values(Enums.SERVICE.STATUS),
      default: Enums.SERVICE.STATUS.PENDING,
    },

    // NEW FIELD
    status_reason: {
      type: Number,
      enum: ALL_STATUS_REASONS,
      default: null,
    },

    payment_status: {
      type: Number,
      enum: Object.values(Enums.PAYMENT.STATUS),
      default: Enums.PAYMENT.STATUS.PENDING,
    },

    meeting_link: {
      type: String,
      trim: true,
    },

    chat_id: {
      type: String,
      trim: true,
    },

    is_free: {
      type: Boolean,
      default: false,
    },

    freeDuration: {
      type: Number,
      default: 0,
    },

    last_extended_at: {
      type: Date,
      default: null,
    },
    is_promotional: {
      type: Boolean,
      default: false,
    },
    promotionalDuration: {
      type: Number,
      default: 0,
      min: 0,
    },


    promotion_id: {
      type: Schema.Types.ObjectId,
      ref: "AstrologerPromotion",
      default: null,
    },
  },
  { timestamps: true },
);

// =========================
// VALIDATION
// =========================

consultationSessionSchema.pre("save", function (next) {
  const status = this.status;
  const reason = this.status_reason;

  if (!reason) return next();

  const STATUS = Enums.SERVICE.STATUS;
  const REASON = Enums.SERVICE.STATUS_REASON;

  const validReasonsMap = {
    [STATUS.CANCELLED]: Object.values(REASON.CANCELLED),

    [STATUS.COMPLETED]: Object.values(REASON.COMPLETED),

    [STATUS.NO_SHOW]: Object.values(REASON.NO_SHOW),
  };

  const validReasons = validReasonsMap[status] || [];

  if (!validReasons.includes(reason)) {
    return next(new Error("Invalid status_reason for selected status"));
  }

  next();
});

// =========================
// INDEXES
// =========================

consultationSessionSchema.index({ user_id: 1 });

consultationSessionSchema.index({ astrologer_user_id: 1 });

consultationSessionSchema.index({ status: 1 });

consultationSessionSchema.index({ status_reason: 1 });

consultationSessionSchema.index({ payment_status: 1 });

consultationSessionSchema.index({ user_id: 1, status: 1 });

consultationSessionSchema.index({
  astrologer_user_id: 1,
  status: 1,
});

module.exports = mongoose.model(
  "ConsultationSession",
  consultationSessionSchema,
);
