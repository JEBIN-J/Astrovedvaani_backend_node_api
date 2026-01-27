const mongoose = require('mongoose');
const { Schema } = mongoose;
const Enums = require('../utils/constants');

const liveSessionSchema = new Schema(
  {
    astrologer_user_id: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    title: { type: String, default:null },
    description: { type: String, trim: true,default:null },
    mode: {
      type: Number,
      enum: Object.values(Enums.SERVICE.TYPE),
      default: Enums.SERVICE.TYPE.LIVE,
    },
    scheduled_start_time: { type: Date },
    actual_start_time: { type: Date },
    end_time: { type: Date },
    is_live: { type: Boolean, default: false },
    total_viewers: { type: Number, default: 0 },
    live_link: { type: String, trim: true },
    attendees: [
      {
        user_id: { type: Schema.Types.ObjectId, ref: 'User' },
        joined_at: { type: Date, default: Date.now },
      }
    ],
     comments: [
      {
        user_id: { type: Schema.Types.ObjectId, ref: 'User' },
        text: { type: String, required: true },
        created_at: { type: Date, default: Date.now }
      }
    ],
    status: {
      type: Number,
      enum: Object.values(Enums.SERVICE.STATUS),
      default: Enums.SERVICE.STATUS.PENDING,
    },
  },
  { timestamps: true }
);

liveSessionSchema.index({ astrologer_user_id: 1 });
liveSessionSchema.index({ status: 1 });
liveSessionSchema.index({ scheduled_start_time: 1 });

module.exports = mongoose.model('LiveSession', liveSessionSchema);