const mongoose = require("mongoose");
const { Schema } = mongoose;
const mediaSchema = require("./ProductMedia");
const slugify = require("slugify");

const productSchema = new Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 100 },
    category_id: {
      type: Schema.Types.ObjectId,
      ref: "Category",
      default: null,
    },
    description: {
      type: String,
      // maxlength: [1000, "Description cannot exceed 1000 characters"],
    },
    summary: { type: String, maxlength: 2000 },
    sku: { type: String, uppercase: true, trim: true }, // optional if using variants
    base_price: { type: Number, set: (v) => parseFloat(v || 0) },
    selling_price: { type: Number, set: (v) => parseFloat(v || 0) },
    gst_percent: { type: Number, default: 0, set: (v) => parseFloat(v || 0) },
    discount: { type: Number, default: 0, set: (v) => parseFloat(v || 0) },
    final_price: { type: Number, set: (v) => parseFloat(v || 0) },
    media: { type: [mediaSchema], validate: (v) => v.length <= 10 },
    thumbnailImage: { type: String, trim: true, default: null },
    slug: { type: String, unique: true, lowercase: true, trim: true },
    is_active: { type: Boolean, default: true },
    created_by: { type: Schema.Types.ObjectId, ref: "User", required: true },
    updated_by: { type: Schema.Types.ObjectId, ref: "User" },
    ratings_avg: { type: Number, default: 0, min: 0, max: 5 },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  },
);

// Indexes
productSchema.index({ category_id: 1 });
productSchema.index({ is_active: 1 });
productSchema.index({ created_by: 1 });

// Virtual for category
productSchema.virtual("category", {
  ref: "Category",
  localField: "category_id",
  foreignField: "_id",
  justOne: true,
});
productSchema.pre("validate", function (next) {
  if (!this.slug && this.name) {
    this.slug = slugify(this.name, { lower: true, strict: true });
  }
  next();
});

module.exports = mongoose.model("Product", productSchema);
