const mongoose = require('mongoose');
const { Schema } = mongoose;
const Enums = require('../utils/constants');

const poojaBookingSchema = new Schema(
  {
    user_id: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },

    pooja_id: {
      type: Schema.Types.ObjectId,
      ref: 'PoojaMaster',
      required: true,
      index: true
    },

    special_notes: { type: String },

    astrologer_id: {
      type: Schema.Types.ObjectId,
      ref: 'Astrologer',
      index: true
    },

    booking_status: {
      type: Number,
      enum: Object.values(Enums.ORDER.STATUS),
      default: Enums.ORDER.STATUS.PENDING
    },

    payment_status: {
      type: Number,
      enum: Object.values(Enums.PAYMENT.STATUS),
      default: Enums.PAYMENT.STATUS.PENDING
    },

    scheduled_at: { type: Date },
    admin_remarks: { type: String },

    price_snapshot: {
      base_price: { type: Number },
      gst_percent: { type: Number },
      discount: { type: Number },
      final_price: { type: Number }
    },
    astrologer_share_amount: {
      type: Number,
      min: 0
    },
    commission_pct: {
      type: Number,
      min: 0,
      max: 100
    },
  },
  { timestamps: true }
);

poojaBookingSchema.index({ user_id: 1, pooja_id: 1 });

module.exports = mongoose.model('PoojaBooking', poojaBookingSchema);
