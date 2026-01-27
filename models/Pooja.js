const mongoose = require("mongoose");
const { Schema } = mongoose;
const slugify = require("slugify");

const poojaMasterSchema = new Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    slug: {
      type: String,
      unique: true,
      required: true,
      lowercase: true,
      trim: true,
    },
    description: {
      type: String,
      required: true,
    },
    image_url: { type: String },
    base_price: {
      type: Number,
      required: true,
      min: 0,
    },
    selling_price: {
      type: Number,
      required: true,
      min: 0,
    },
    gst_percent: {
      type: Number,
      default: 0,
      min: 0,
      max: 100,
    },
    discount: {
      type: Number,
      default: 0,
      min: 0,
    },
    final_price: {
      type: Number,
      required: true,
      min: 0,
    },
    is_active: {
      type: Boolean,
      default: true,
    },
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

// Pre-validate hook to generate slug
poojaMasterSchema.pre("validate", function (next) {
  if (!this.slug && this.name) {
    this.slug = slugify(this.name, { lower: true, strict: true });
  }
  next();
});

module.exports = mongoose.model("PoojaMaster", poojaMasterSchema);
