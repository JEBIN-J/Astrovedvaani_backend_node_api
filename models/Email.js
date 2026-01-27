const mongoose = require('mongoose');
const { Schema } = mongoose;

const emailSchema = new Schema(
  {
    email: {
      type: String,
      required: true,
      lowercase: true,
      trim: true,
    },
    is_active: {
      type: Boolean,
      default: false,
    },
    provider: {
      type: String,
      required: true,
    },
    config: {
      host: String,
      port: Number,
      secure: Boolean,
      auth: {
        user: String,
        pass: String,
      },
      api_key: String,
    },
    verified: {
      type: Boolean,
      default: false,
    },
    last_used_at: {
      type: Date,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Email', emailSchema);