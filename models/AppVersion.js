// models/AppVersion.js
const mongoose = require("mongoose");
const { Schema } = mongoose;

const appVersionSchema = new Schema(
  {
    platform: {
      type: String,
      enum: ["android", "ios"],
      required: true,
    },
    latestVersion: {
      type: String, // "1.2.3"
      required: true,
    },
    minSupportedVersion: {
      type: String, // force update below this
      required: true,
    },
    latestVersionCode: {
      type: Number,
      required: true,
    },
    minSupportedVersionCode: {
      type: Number,
      required: true,
    },
    updateMessage: { type: String, required: true, trim: true },
    storeUrl: {
      type: String,
      required: true,
    },
    status: {
      type: String,
      enum: ["ACTIVE", "INACTIVE"],
      default: "ACTIVE",
    },
    created_by: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    updated_by: {
      type: Schema.Types.ObjectId,
      ref: "User",
    },
  },
  { timestamps: true },
);

module.exports = mongoose.model("AppVersion", appVersionSchema);
