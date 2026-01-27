const mongoose = require("mongoose");
const Enums = require("../utils/constants");
const { Schema } = mongoose;

const astrologerSchema = new Schema(
  {
    user_id: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    display_name: { type: String },
    bio: { type: String, trim: true },
    images: { type: [String] },
    document: { type: String, default: null },
    specializations: [
      { type: Schema.Types.ObjectId, ref: "Specialization", default: [] },
    ],
    languages_spoken: [
      { type: Schema.Types.ObjectId, ref: "Language", default: [] },
    ],
    experience_years: { type: Number, min: 0 },
    calendar_availability: { type: Schema.Types.Mixed },
    timezone: { type: String, trim: true },
    is_online: { type: Boolean, default: false },
    isChat: { type: Boolean, default: false },
    isCall: { type: Boolean, default: false },
    isVideo: { type: Boolean, default: false },
    is_premium: { type: Boolean, default: false },
    is_busy: { type: Boolean, default: false },
    premium_expiry: Date,
    premium_boost: { type: Number, default: 0 },
    kyc_details: { type: Schema.Types.Mixed },
    bank_account_number: { type: String, default: null }, // new
    ifsc: { type: String, default: null }, // new
    razorpay_contact_id: { type: String, default: null }, // new
    razorpay_fund_account_id: { type: String, default: null }, // new
    metaTitle: {
      type: String,
      trim: true,
      maxlength: [60, "Meta title cannot exceed 60 characters"],
    },

    metaDescription: {
      type: String,
      trim: true,
      maxlength: [160, "Meta description cannot exceed 160 characters"],
    },
  },
  { timestamps: true },
);

astrologerSchema.index({ user_id: 1 });
astrologerSchema.post("save", function (doc) {
  require("../services/astrologer/rankingService").updateAstrologerScores([
    doc._id,
  ]);
});

astrologerSchema.post("findOneAndUpdate", function (doc) {
  if (doc) {
    require("../services/astrologer/rankingService").updateAstrologerScores([
      doc._id,
    ]);
  }
});

module.exports = mongoose.model("Astrologer", astrologerSchema);
