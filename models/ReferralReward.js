const mongoose = require('mongoose');
const { REFERRAL } = require('../utils/constants');
const { Schema } = mongoose;

const referralRewardSchema = new Schema(
  {
    user_id: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    referral_usage_id: {
      type: Schema.Types.ObjectId,
      ref: 'ReferralUsage',
      required: true,
    },
    reward_type: {
      type: Number,
      enum: Object.values(REFERRAL.REWARD_TYPE),
      required: true,
    },
    amount: {
      type: mongoose.Types.Decimal128,
      required: true,
      get: (v) => parseFloat(v.toString()) // Add getter for better handling
    },
    status: {
      type: Number,
      enum: Object.values(REFERRAL.REWARD_STATUS),
      required: true,
    },
    metadata: {
      type: Schema.Types.Mixed,
      default: {}
    }
  },
  { 
    timestamps: { createdAt: 'granted_at' },
    toJSON: { 
      virtuals: true,
      getters: true 
    }
  }
);

// Add logging middleware
referralRewardSchema.post('save', function(doc) {
  console.info('[ReferralReward] New reward created', {
    rewardId: doc._id,
    userId: doc.user_id,
    type: doc.reward_type,
    amount: doc.amount,
    status: doc.status
  });
});

referralRewardSchema.post('insertMany', function(docs) {
  console.info('[ReferralReward] Batch rewards created', {
    count: docs.length,
    rewardIds: docs.map(d => d._id)
  });
});

// Add indexes for better querying
referralRewardSchema.index({ user_id: 1 });
referralRewardSchema.index({ referral_usage_id: 1 });
referralRewardSchema.index({ status: 1 });

module.exports = mongoose.model('ReferralReward', referralRewardSchema);