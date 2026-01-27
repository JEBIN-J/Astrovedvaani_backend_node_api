const mongoose = require("mongoose");
const { Schema } = mongoose;

const META_TYPES = [
  // Core Pages
  "HOMEPAGE",

  // Astrologer Listings
  "CHAT_ASTROLOGER_LISTING",
  "TALK_ASTROLOGER_LISTING",

  // Kundli & Matchmaking
  "KUNDLI_FORM_PAGE",
  "MATCHMAKING_FORM_PAGE",

  // Pooja Pages
  "POOJA_LISTING_PAGE",

  // Product Pages
  "PRODUCT_LISTING_PAGE",

  // Blog Pages
  "BLOG_LISTING_PAGE",

  // Auth / User Pages
  "REGISTRATION_PAGE",
  "ORDER_HISTORY_PAGE",
  "WALLET_PAGE",

  // Static / Policy Pages
  "TERMS_AND_CONDITIONS_PAGE",
  "CONTACT_US_PAGE",
  "ABOUT_US_PAGE",
  "SHIPPING_POLICY_PAGE",
  "REFUND_POLICY_PAGE",
  "GRIEVANCE_POLICY_PAGE",
  "PRIVACY_POLICY_PAGE",
];

const metaSeoSchema = new Schema(
  {
    type: {
      type: String,
      enum: META_TYPES, // enum-based validation
      required: true,
      unique: true,
      trim: true,
    },

    meta_title: {
      type: String,
      required: true,
      trim: true,
      maxlength: 120,
    },

    meta_description: {
      type: String,
      required: true,
      trim: true,
      maxlength: 320,
    },

    meta_keywords: {
      type: [String],
      default: [],
    },

    is_active: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
  },
);

module.exports = mongoose.model("MetaSeo", metaSeoSchema);
