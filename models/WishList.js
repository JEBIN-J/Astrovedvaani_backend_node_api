const mongoose = require('mongoose');
const Enums = require('../utils/constants');
const { Schema } = mongoose;

const wishlistSchema = new Schema(
  {
    user_id: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    item_type: { type: Number, enum: Object.values(Enums.ORDER.TYPE), required: true },
    reference_id: { type: Schema.Types.ObjectId, required: true },
    added_at: { type: Date, default: Date.now }
  },
  { timestamps: true }
);

wishlistSchema.index({ user_id: 1, item_type: 1, reference_id: 1 }, { unique: true });
module.exports = mongoose.models.Wishlist || mongoose.model('Wishlist', wishlistSchema);
