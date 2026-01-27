const mongoose = require("mongoose");

const taxSlabSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    rate: { type: Number, required: true, min: 0 },
    applicableServices: [
      {
        type: Number,
        enum: [400, 401, 402, 403, 404, 405, 406, 407],
      },
    ],
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

module.exports = mongoose.model("TaxSlab", taxSlabSchema);
