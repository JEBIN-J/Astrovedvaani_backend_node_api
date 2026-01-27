const mongoose = require('mongoose');
const { Schema } = mongoose;
const referralUsageSchema = new Schema(
  {
    referral_code_id: {
      type: Schema.Types.ObjectId,
      ref: 'ReferralCode',
      required: true,
    },
    referred_user_id: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
  },
  { timestamps: { createdAt: 'used_at' } }
);

module.exports = mongoose.model('ReferralUsage', referralUsageSchema);