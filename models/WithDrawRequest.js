const mongoose = require('mongoose');
const Enums = require('../utils/constants');
const { Schema } = mongoose;

const withdrawalRequestSchema = new Schema({
  wallet: {
    type: Schema.Types.ObjectId,
    ref: 'Wallet',
    required: true
  },
  user: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  amount: {
    type: Number,
    required: true,
    min: 1
  },
  status: {
    type: Number,
    enum: Object.values(Enums.SERVICE.STATUS),
    default: Enums.SERVICE.STATUS.PENDING
  },
  remarks: {
    type: String
  },
  requestedAt: {
    type: Date,
    default: Date.now
  },
  processedAt: {
    type: Date
  }
}, { timestamps: true });

module.exports = mongoose.model('WithdrawalRequest', withdrawalRequestSchema);
