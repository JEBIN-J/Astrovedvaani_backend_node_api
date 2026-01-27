const mongoose = require('mongoose');
const { Schema } = mongoose;

const leaderboardSchema = new Schema({
  user_id: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  score: { type: Number, default: 0 },
  rank: { type: Number, default: 0 },
  category: { type: String, default: 'general' },
}, { timestamps: { updatedAt: 'updated_at' } });

leaderboardSchema.index({ user_id: 1, category: 1 }, { unique: true });

module.exports = mongoose.model('Leaderboard', leaderboardSchema);
