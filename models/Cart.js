const mongoose = require('mongoose');
const { Schema } = mongoose;

const cartItemSchema = new Schema({
  product: { 
    type: Schema.Types.ObjectId, 
    ref: 'Product',
    required: true 
  },
  quantity: { 
    type: Number, 
    required: true,
    min: 1,
    default: 1 
  },
  price: {
    type: Number,
    required: true
  },
  discounted_price: {
    type: Number,
    required: true
  }
}, { _id: false });

const cartSchema = new Schema({
  user: { 
    type: Schema.Types.ObjectId, 
    ref: 'User',
    required: true,
    unique: true
  },
  items: [cartItemSchema],
  coupon: {
    code: String,
    discount_value: Number,
    discount_type: { type: String, enum: ['percentage', 'fixed'] }
  },
  created_at: { type: Date, default: Date.now },
  updated_at: { type: Date, default: Date.now }
});

// Update timestamp on save
cartSchema.pre('save', function(next) {
  this.updated_at = Date.now();
  next();
});

module.exports = mongoose.model('Cart', cartSchema);