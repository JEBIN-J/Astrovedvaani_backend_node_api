const mongoose = require("mongoose");
const { Schema } = mongoose;

const specializationSchema = new Schema(
  {
    name: { type: String, required: true, unique: true },
    description: { type: String, default: "" },
    isActive: { type: Boolean, default: true }
  },
  { timestamps: true }
);

module.exports = mongoose.model("Specialization", specializationSchema);