const mongoose = require('mongoose');
const { Schema } = mongoose;
const { SMS_TEMPLATE_TYPE } = require('../utils/constants');

const smsTemplateSchema = new Schema(
  {
    type: {
      type: String,
      enum: Object.values(SMS_TEMPLATE_TYPE),
      required: true,
    },
    body: {
      type: String,
      required: true,
    },
    active: {
      type: Boolean,
      default: true,
    },
    purpose: {
      type: Number,
      enum: Object.values(SMS_TEMPLATE_TYPE),
      required: true,
    },
    variables: {
      type: [String],
      default: [],
    },
    last_updated_by: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model('SmsTemplate', smsTemplateSchema);