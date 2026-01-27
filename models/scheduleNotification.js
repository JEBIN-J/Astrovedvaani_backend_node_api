// models/ScheduledNotification.js
const mongoose = require("mongoose");
const { Schema } = mongoose;

const ScheduledNotificationSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    title: { type: String, required: true },
    body: { type: String, required: true },
    data: { type: Object, default: {} },

    sendAt: { type: Date, required: true }, // when to send
    sent: { type: Boolean, default: false },
    attempts: { type: Number, default: 0 },
    lastError: { type: String, default: null },
  },
  { timestamps: true },
);

module.exports = mongoose.model(
  "ScheduledNotification",
  ScheduledNotificationSchema,
);
