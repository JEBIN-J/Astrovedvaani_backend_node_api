const mongoose = require("mongoose");

const salarySlipSchema = new mongoose.Schema(
  {
    user_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    month: Number,

    year: Number,

    slip_number: String,

    total_earnings: Number,

    pdf_url: String,
  },
  {
    timestamps: true,
  },
);
salarySlipSchema.index(
  {
    user_id: 1,
    month: 1,
    year: 1,
  },
  {
    unique: true,
  },
);
module.exports = mongoose.model("SalarySlip", salarySlipSchema);
