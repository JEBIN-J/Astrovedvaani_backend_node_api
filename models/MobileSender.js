const mongoose = require('mongoose');
const { Schema } = mongoose;

const mobileSenderSchema = new Schema(
  {
    sender_id: {
      type: String, // e.g., TWILIO_SMS, EXOTEL_PRIMARY
      required: true,
      unique: true,
    },
    provider: {
      type: String, // e.g., 'twilio', 'exotel'
      required: true,
    },
    is_active: {
      type: Boolean,
      default: false,
    },
    config: {
      account_sid: String,
      auth_token: String,
      sender_number: String,
      api_key: String,
      api_secret: String,
      custom_config: Schema.Types.Mixed,
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

module.exports = mongoose.model('MobileSender', mobileSenderSchema);