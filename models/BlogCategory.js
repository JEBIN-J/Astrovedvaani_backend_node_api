const mongoose = require('mongoose');
const { Schema } = mongoose;
const Enums = require('../utils/constants');

const blogCategorySchema = new Schema({
  name: {
    type: String,
    required: [true, 'Category name is required'],
    unique: true,
    trim: true,
    maxlength: [50, 'Category name cannot exceed 50 characters']
  },
  slug: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true
  },
  description: {
    type: String,
    maxlength: [200, 'Description cannot exceed 200 characters']
  },
  related_to: {
      type: Number,
      enum: Object.values(Enums.GENERAL.CATEGORY.RELATED_TO),
      default: Enums.GENERAL.CATEGORY.RELATED_TO.BLOG,
    },
}, { timestamps: true });

blogCategorySchema.index({ related_to: 1 });


// Generate slug before validation (instead of save)
blogCategorySchema.pre('validate', function (next) {
  if (!this.slug && this.name) {
    this.slug = this.name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')     // replace spaces/specials with -
      .replace(/(^-|-$)/g, '');        // remove leading/trailing -
  }
  next();
});

module.exports = mongoose.model('BlogCategory', blogCategorySchema);
