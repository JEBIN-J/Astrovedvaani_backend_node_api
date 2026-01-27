const mongoose = require("mongoose");
const { Schema } = mongoose;

const adminNotificationSchema = new Schema(
  {
    title: { type: String, required: true },
    message: { type: String, required: true },
    type: { type: String, enum: ["instant", "scheduled"], default: "instant" },
    role: {
      type: String,
      enum: ["all", "users", "astrologers", "newUsers", "newAstrologers"],
      required: true,
    },
    scheduled_at: { type: Date },
    created_by: { type: Schema.Types.ObjectId, ref: "User", required: true },
    sent: { type: Boolean, default: false },
  },
  { timestamps: true }
);

module.exports = mongoose.model("AdminNotification", adminNotificationSchema);
