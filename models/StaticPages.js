const mongoose = require("mongoose");
const Enums = require('../utils/constants');

const staticPageSchema = new mongoose.Schema({
  type: {
    type: Number,
    enum: Object.values(Enums.STATIC_PAGE.TYPE),
    required: true,
    unique: true
  },
  contentType: {
    type: Number,
    enum: Object.values(Enums.STATIC_PAGE.CONTENT_TYPE),
    required: true
  },
  fileUrl: { type: String },
  jsonContent: { type: mongoose.Schema.Types.Mixed },
  updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  updatedAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model("StaticPage", staticPageSchema);
