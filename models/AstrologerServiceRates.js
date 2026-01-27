const mongoose = require('mongoose');
const Enums = require('../utils/constants');
const { Schema } = mongoose;

const serviceRateSchema = new Schema(
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
    rate: {
      type: Number,
      required: true,
      min: 0
    },
    commission_pct: {
      type: Number,
      required: true,
      min: 0,
      max: 100
    }
  },
  { timestamps: true }
);

serviceRateSchema.index({ astrologer_id: 1, service_type: 1 }, { unique: true });

module.exports = mongoose.model('AstrologerServiceRates', serviceRateSchema);
