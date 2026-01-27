const mongoose = require("mongoose");
const { Schema } = mongoose;

const languageSchema = new Schema(
  {
    name: { type: String, required: true, unique: true },
    isActive: { type: Boolean, default: true }
  },
  { timestamps: true }
);

module.exports = mongoose.model("Language", languageSchema);
