const mongoose = require("mongoose");
const { Schema } = mongoose;
const Enums = require("../utils/constants");

const sessionSettingSchema = new Schema(
  {
    enableFreeSession: {
      type: Boolean,
      default: true,
    },
    freeSessionMinutes: {
      type: Number,
      default: 2,
      min: 0,
    },
    bufferInSeconds: {
      type: Number,
      default: 30,
      min: 0,
    },
    maxFreeSessionsPerUser: {
      type: Number,
      default: 1,
      min: 0,
    },
    freeSessionUsageInterval: {
      type: Number,
      enum:Object.values(Enums.SESSION_INTERVAL),
      default: Enums.SESSION_INTERVAL.LIFETIME,
    },
    eligibleRolesForFreeSession: {
      type: [Number],
      default: [Enums.USER.ROLE.USER],
      enum: Object.values(Enums.USER.ROLE),
    },
    notes: {
      type: String,
      trim: true,
      default: "",
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  { timestamps: true }
);


module.exports = mongoose.model("SessionSetting", sessionSettingSchema);
