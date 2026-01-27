const mongoose = require("mongoose");
const { MEDIA_CONTENT } = require("../utils/constants");

const mediaContentSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    description: {
      type: String,
      trim: true,
    },
    short_description: {
      type: String,
      trim: true,
    },
    type: {
      type: Number,
      enum: Object.values(MEDIA_CONTENT.MEDIA_TYPE),
      required: true,
      trim: true,
    },
    description: {
      type: String,
      trim: true,
    },

    slug: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      lowercase: true,
    },
    url: {
      type: String,
      required: true,
    },
    thumbnail: {
      type: String,
    },
    image: {
      type: String,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
  },
  { timestamps: true },
);
// Pre-validate hook to generate slug
mediaContentSchema.pre("validate", function (next) {
  if (!this.slug && this.name) {
    this.slug = this.name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "");
  }
  next();
});

const Media = mongoose.model("MediaContent", mediaContentSchema);
module.exports = Media;
