const mongoose = require("mongoose");
const { Schema } = mongoose;
const Enums = require("../utils/constants");

const astrologyServiceDetailsSchema = new Schema(
  {
    title: {
      type: String,
      required: [true, "astrologyServiceDetails title is required"],
      trim: true,
      maxlength: [120, "Title cannot exceed 120 characters"],
    },
    slug: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    content: {
      type: String,
      required: [true, "astrologyServiceDetails content is required"],
      minlength: [300, "Content should be at least 300 characters"],
    },
    excerpt: {
      type: String,
      maxlength: [200, "Excerpt cannot exceed 200 characters"],
    },
    category: {
      type: Number,
      enum: Object.values(Enums.ASTROLOGY.CATEGORY),
      required: true,
      unique: [true,"Category must be unique for each astrology service details"],
    },
    thumbnailImage: { type: String, trim: true },
    createdBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
    updatedBy: { type: Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true },
);

astrologyServiceDetailsSchema.index({ category: 1 });


// Generate slug and excerpt before validation
astrologyServiceDetailsSchema.pre("validate", function (next) {
  if (!this.slug && this.title) {
    this.slug = this.title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "");
  }

  if (!this.excerpt && this.content) {
    this.excerpt = this.content.substring(0, 160).trim() + "...";
  }

  next();
});

module.exports = mongoose.model("AstrologyServiceDetails", astrologyServiceDetailsSchema);
