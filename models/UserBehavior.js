const mongoose = require('mongoose');
const { Schema } = mongoose;

const userBehaviorSchema = new Schema({
  user: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    unique: true
  },
  viewedProducts: [{
    product: {
      type: Schema.Types.ObjectId,
      ref: 'Product'
    },
    viewCount: {
      type: Number,
      default: 1
    },
    lastViewed: {
      type: Date,
      default: Date.now
    }
  }],
  viewedCategories: [{
    type: Schema.Types.ObjectId,
    ref: 'Category'
  }],
  purchasedProducts: [{
    type: Schema.Types.ObjectId,
    ref: 'Product'
  }],
  searchHistory: [{
    query: String,
    timestamp: {
      type: Date,
      default: Date.now
    }
  }]
}, {
  timestamps: true
});

userBehaviorSchema.index({ 'viewedProducts.product': 1 });
userBehaviorSchema.index({ viewedCategories: 1 });

module.exports = mongoose.model('UserBehavior', userBehaviorSchema);
