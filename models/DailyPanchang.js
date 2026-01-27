const mongoose = require('mongoose');
const { Schema } = mongoose;

const dailyPanchangSchema = new Schema(
  {
    date: { type: Date, required: true, unique: true },
    sunrise: String,
    sunset: String,
    tithi: String,
    nakshatra: String,
    auspicious_timings: { type: Schema.Types.Mixed },
    other_data: { type: Schema.Types.Mixed }
  },
  { timestamps: true }
);

module.exports = mongoose.model('DailyPanchang', dailyPanchangSchema);
