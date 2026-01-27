const mongoose = require('mongoose');
const { Schema } = mongoose;

const userGiftSchema = new Schema({
  gift_id: {
    type: Schema.Types.ObjectId,
    ref: 'Gift',
    required: true
  },
  owner_id: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  status: {
    type: String,
    enum: ['OWNED', 'SENT', 'USED'],
    default: 'OWNED'
  },
  price: {
    type: Number,
    required: true
  },
  recipient_id: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },
  sent_at: {
    type: Date
  },
  used_at: {
    type: Date
  }
}, { timestamps: true });

module.exports = mongoose.model('UserGift', userGiftSchema);
