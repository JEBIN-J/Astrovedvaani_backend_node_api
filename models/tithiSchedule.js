const mongoose = require("mongoose");

const tithiScheduleSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    date: { type: String, required: true }, // format: YYYY-MM-DD
    tithi: String,
    specialTithi: String,
    email: {
      type: String,
      lowercase: true,
      trim: true,
    },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true },
);
tithiScheduleSchema.index({ userId: 1, date: 1 }, { unique: true });

module.exports = mongoose.model("TithiSchedule", tithiScheduleSchema);
