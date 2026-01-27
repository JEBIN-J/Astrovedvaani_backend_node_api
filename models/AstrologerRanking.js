const mongoose = require('mongoose');
const { Schema } = mongoose;

const astrologerRankingSchema = new Schema(
  {
    astrologer_id: { type: Schema.Types.ObjectId, ref: 'Astrologer', required: true, unique: true },
    ratings_avg: { type: Number, default: 0, min: 0, max: 5 },
    score: { type: Number, default: 0 },
    last_shown: Date,
    last_shown_times: { type: [Date], default: [] },
    show_count: { type: Number, default: 0 },
    click_through_rate: { type: Number, default: 0 },
    engagement_rate: { type: Number, default: 0 },
    response_time_avg: { type: Number, default: 0 },
    session_completion_rate: { type: Number, default: 0 },
  },
  { timestamps: true }
);

module.exports = mongoose.model('AstrologerRanking', astrologerRankingSchema);
