const mongoose = require("mongoose");
const { EMAIL_TEMPLATE_TYPE } = require("../utils/constants");
const { Schema } = mongoose;

const emailTemplateSchema = new Schema(
  {
    type: {
      type: String,
      enum: Object.values(EMAIL_TEMPLATE_TYPE),
      required: true,
      unique: true,
    },
    subject: {
      type: String,
      required: true,
    },
    body: {
      type: String,
      required: true,
    },
    is_active: {
      type: Boolean,
      default: true,
    },
    used_for: {
      type: Number,
      enum: Object.values(EMAIL_TEMPLATE_TYPE),
      required: true,
    },
    variables: {
      type: [String],
      default: [],
    },
    last_updated_by: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("EmailTemplate", emailTemplateSchema);