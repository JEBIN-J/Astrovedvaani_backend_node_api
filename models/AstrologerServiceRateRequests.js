const mongoose = require('mongoose');
const Enums = require('../utils/constants');
const { Schema } = mongoose;

const serviceRateRequestSchema = new Schema(
  {
    astrologer_id: {
      type: Schema.Types.ObjectId,
      ref: 'Astrologer',
      required: true
    },
    service_type: {
      type: Number,
      enum: Object.values(Enums.SERVICE.TYPE),
      required: true
    },
    requested_rate: {
      type: Number,
      required: true,
      min: 0
    },
    requested_commission_pct: {
      type: Number,
      min: 0,
      max: 100
    },
    status: {
      type: Number,
      enum: Object.values(Enums.USER.VERIFICATION_STATUS),
      default: Enums.USER.VERIFICATION_STATUS.PENDING,
    }
  },
  { timestamps: true }
);

serviceRateRequestSchema.index(
  { astrologer_id: 1, service_type: 1, status: 1 },
  {
    unique: true,
    partialFilterExpression: {
      status: Enums.USER.VERIFICATION_STATUS.PENDING
    }
  }
);

module.exports = mongoose.model(
  'AstrologerServiceRateRequests',
  serviceRateRequestSchema
);