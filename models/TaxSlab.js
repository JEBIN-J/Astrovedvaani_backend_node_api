const mongoose = require("mongoose");
const Enums = require("../utils/constants");

const taxSlabSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    rate: { type: Number, required: true, min: 0 },
    taxContext: {
      type: Number,
      enum: Object.values(Enums.TAX.CONTEXT),
      required: true,
    },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true },
);

module.exports = mongoose.model("TaxSlab", taxSlabSchema);
