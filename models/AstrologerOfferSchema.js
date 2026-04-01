const mongoose = require("mongoose");
const Enums = require("../utils/constants");
const { Schema } = mongoose;

const offerSchema = new Schema(
  {
    service_type: {
      type: Number,
      enum: Object.values(Enums.SERVICE.TYPE),
      required: true,
    },

    discount_type: {
      type: String,
      enum: ["PERCENTAGE", "FLAT"],
      default: "PERCENTAGE",
    },

    discount_value: {
      type: Number,
      required: true,
    },

    start_time: Date,
    end_time: Date,

    is_active: {
      type: Boolean,
      default: true,
    },
  },
  { _id: false }
);

const astrologerOfferSchema = new Schema(
  {
    astrologer_id: {
      type: Schema.Types.ObjectId,
      ref: "Astrologer",
      required: true,
      unique: true,
    },
    offers: {
      type: [offerSchema],
      default: [],
    },
  },
  { timestamps: true }
);

astrologerOfferSchema.index({
  astrologer_id: 1,
  "offers.service_type": 1,
});

module.exports = mongoose.model(
  "AstrologerOffer",
  astrologerOfferSchema
);