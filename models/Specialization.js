const mongoose = require("mongoose");
const { Schema } = mongoose;
const Enums = require("../utils/constants");

const specializationSchema = new Schema(
  {
    name: { type: String, required: true, unique: true },
    description: { type: String, default: "" },
    isActive: { type: Boolean, default: true },
    related_to: {
      type: Number,
      enum: Object.values(Enums.SPECIALIZATION.RELATED_TO),
      default: Enums.SPECIALIZATION.RELATED_TO.DOMAIN,
    },
  },
  { timestamps: true },
);

module.exports = mongoose.model("Specialization", specializationSchema);
