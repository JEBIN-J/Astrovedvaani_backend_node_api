const mongoose = require('mongoose');
const { Schema } = mongoose;

const savedAstrologerSchema = new Schema(
  {
    user_id: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true
    },

    astrologer_id: {
      type: Schema.Types.ObjectId,
      ref: 'Astrologer',
      required: true
    },

    saved_at: {
      type: Date,
      default: Date.now
    }
  },
  { timestamps: true }
);

savedAstrologerSchema.index({ user_id: 1, astrologer_id: 1 }, { unique: true });

module.exports = mongoose.model('SavedAstrologer', savedAstrologerSchema);
