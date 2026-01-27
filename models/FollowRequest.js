const mongoose = require('mongoose');
const { Schema } = mongoose;
const Enums = require('../utils/constants');

const followRequestSchema = new Schema(
  {
    user_id: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    astrologer_id: {
      type: Schema.Types.ObjectId,
      ref: 'Astrologer',
      required: true,
    },
    status: {
      type: Number,
      enum: Object.values(Enums.SERVICE.FOLLOW),
      default: Enums.SERVICE.FOLLOW.ACCEPTED
    },
    auto: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: { createdAt: 'created_at' },
  }
);

followRequestSchema.index({ user_id: 1 });
followRequestSchema.index({ astrologer_id: 1 });
followRequestSchema.index({ user_id: 1, astrologer_id: 1 }, { unique: true });

module.exports = mongoose.model('FollowRequest', followRequestSchema);
