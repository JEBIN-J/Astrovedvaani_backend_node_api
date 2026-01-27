const mongoose = require("mongoose");
const { Schema } = mongoose;

const userAstrologySchema = new Schema(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      index: true,
      default: null,
    },
    name: { type: String, required: true, trim: true },
    gender: { type: Number },
    birthDate: { type: Date, required: true },
    birthTime: { type: String },
    birthPlace: { type: String, trim: true },
    isKundli: { type: Boolean, default: false }, // false means macthmaking parter and true means kundli profile
    isPalmistry: { type: Boolean, default: false },
    latitude: { type: Number },
    longitude: { type: Number },
    timezone: { type: Number, default: 5.5 },

    zodiacSign: { type: String, trim: true }, // rasi
    rasi: { type: String, trim: true }, // alias for clarity
    rasiLord: { type: String, trim: true },

    sunSign: { type: String, trim: true },
    ascendant: { type: String, trim: true },

    nakshatra: { type: String, trim: true },
    nakshatraLord: { type: String, trim: true },
    nakshatraPada: { type: Number, min: 1, max: 4 },

    manglikStatus: {
      type: String,
      enum: ["Yes", "No", "Partial"],
      default: "No",
    },
    doshas: [{ type: String }],
    gotra: { type: String, trim: true },

    // New fields
    nadi: { type: String, trim: true },
    varna: { type: String, trim: true },
    paya: { type: String, trim: true },
    tatva: { type: String, trim: true },
    lifeStone: { type: String, trim: true },
    luckyStone: { type: String, trim: true },
    fortuneStone: { type: String, trim: true },
    nameStart: { type: String, trim: true },

    preferredAstrologySystem: {
      type: String,
      enum: ["vedic", "western", "numerology", "chinese"],
      default: "vedic",
    },
    preferredLanguage: { type: String, default: "en" },
    relationshipToOwner: { type: String, default: "other" }, // self mean login user profile
    transitDate: { type: Date },
    transitTime: { type: String },
    transitTimezone: { type: Number },
    houseType: { type: String },
    zodiacType: { type: String },
    direction: { type: String },
    transitPlace: { type: String },
  },
  { timestamps: true },
);

module.exports = mongoose.model("UserAstrology", userAstrologySchema);
