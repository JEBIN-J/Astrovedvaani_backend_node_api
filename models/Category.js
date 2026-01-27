const mongoose = require('mongoose');
const { Schema } = mongoose;

const categorySchema = new Schema(
  {
    name: {
      type: String,
      required: true,
      unique: true,
      trim: true
    },
    description: { type: String },
    slug: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      lowercase: true
    },
    parent_category: {
      type: Schema.Types.ObjectId,
      ref: 'Category',
      default: null
    },
    image_url: { type: String },
    seo_title: { type: String },
    seo_description: { type: String },
    seo_keywords: { type: String },
    display_order: { type: Number, default: 0 },
    is_active: { type: Boolean, default: true },
    is_featured: { type: Boolean, default: false },
    created_by: {
      type: Schema.Types.ObjectId,
      ref: 'User'
    },
    updated_by: {
      type: Schema.Types.ObjectId,
      ref: 'User'
    }
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true }
  }
);

// Virtual for child categories
categorySchema.virtual('children', {
  ref: 'Category',
  localField: '_id',
  foreignField: 'parent_category'
});

// Pre-validate hook to generate slug
categorySchema.pre('validate', function (next) {
  if (!this.slug && this.name) {
    this.slug = this.name.toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '');
  }
  next();
});

module.exports = mongoose.model('Category', categorySchema);
