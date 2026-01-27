const mongoose = require('mongoose');
const { Schema } = mongoose;

const userHoroscopeSchema = new Schema(
  {
    user_id: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    type: { type: String, enum: ['daily', 'weekly', 'monthly'], required: true },
    sign: { type: String, required: true },
    date: { type: Date, required: true },
    content: { type: String, required: true }
  },
  { timestamps: true }
);

userHoroscopeSchema.index({ user_id: 1, type: 1, date: 1 }, { unique: true });

module.exports = mongoose.model('UserHoroscope', userHoroscopeSchema);
