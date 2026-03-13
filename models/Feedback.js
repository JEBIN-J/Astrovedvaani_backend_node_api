const mongoose = require("mongoose");
const { Schema } = mongoose;
const Enums = require("../utils/constants");

const feedbackSchema = new Schema(
  {
    user_id: {
      type: Schema.Types.ObjectId,
      ref: "User", // the one who provides feedback
      required: true,
    },

    source_type: {
      type: Number,
      enum: Object.values(Enums.ENTITY.TYPE), // session, product, pooja-booking
      default: Enums.ENTITY.TYPE.SESSION,
    },

    source_id: {
      type: Schema.Types.ObjectId, // session/product/pooja-booking ID
      // required: true,
    },

    rating: {
      type: Number,
      min: 1,
      max: 5,
      // required: true,
    },

    review: {
      type: String,
      trim: true,
    },

    reviewed_at: {
      type: Date,
      default: Date.now,
    },

    is_visible: {
      type: Boolean,
      default: true,
    },

    astrologer_user_id: {
      type: Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
  },
  { timestamps: true },
);

feedbackSchema.index({ user_id: 1 });
feedbackSchema.index({ source_id: 1 });
feedbackSchema.index({ source_type: 1 });

module.exports = mongoose.model("Feedback", feedbackSchema);
