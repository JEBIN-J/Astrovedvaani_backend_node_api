const mongoose = require('mongoose');
const Enums = require('../utils/constants');
const { Schema } = mongoose;

const thirdPartyIntegrationSchema = new Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    type: {
      type: Number,
      enum: Object.values(Enums.INTEGRATION.TYPE),
      required: true,
    },
    provider: {
      type: Number,
      enum: Object.values(Enums.INTEGRATION.PROVIDER),
      required: true,
    },
    api_key: {
      type: String,
      required: true,
    },
    api_secret: {
      type: String,
    },
    base_url: {
      type: String,
      trim: true,
    },
    extra_config: {
      type: Schema.Types.Mixed,
      default: {},
    },
    is_active: {
      type: Boolean,
      default: true,
    },
    expiry_date: {
      type: Date,
    }
  },
  { timestamps: true }
);


thirdPartyIntegrationSchema.index({ type: 1, is_active: 1 });

module.exports = mongoose.model('ThirdPartyIntegration', thirdPartyIntegrationSchema);