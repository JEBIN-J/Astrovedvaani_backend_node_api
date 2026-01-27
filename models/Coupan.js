const mongoose = require('mongoose');
const { Schema } = mongoose;

const couponSchema = new Schema(
  {
    code: { type: String, required: true, unique: true, uppercase: true, trim: true },
    description: { type: String },
    discount_type: { type: String, enum: ['percentage', 'fixed'], required: true },//f
    discount_value: { type: Number, required: true },//20
    min_cart_value: { type: Number, default: 0 },//1000
    valid_from: { type: Date, required: true },//
    valid_until: { type: Date, required: true },
    is_active: { type: Boolean, default: true },//

    usage_limit: { type: Number, default: null }, // e.g., 100 total uses
    used_count: { type: Number, default: 0 },

    per_user_limit: { type: Number, default: null }, // e.g., 1 use per user

    usage_by_user: [
      {
        user_id: { type: Schema.Types.ObjectId, ref: 'User' },
        count: { type: Number, default: 0 }
      }
    ]
  },
  { timestamps: true }
);

module.exports = mongoose.model('Coupon', couponSchema);
