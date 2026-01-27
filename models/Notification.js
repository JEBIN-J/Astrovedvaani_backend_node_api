const mongoose = require('mongoose');
const Enums = require('../utils/constants');
const { Schema } = mongoose;
const notificationSchema = new Schema(
  {
    recipient_id: { 
      type: Schema.Types.ObjectId, 
      ref: 'User', 
      required: true,
      index: true 
    },
    sender_id: { 
      type: Schema.Types.ObjectId, 
      ref: 'User' 
    },
    type: {
      type: Number,
      enum: Object.values(Enums.NOTIFICATION.NOTIFICATION_TYPE),
      default:  Enums.NOTIFICATION.NOTIFICATION_TYPE.ADMIN_MESSAGE,
    },
    title: { 
      type: String, 
      required: true 
    },
    message: { 
      type: String, 
      required: true 
    },
    is_read: { 
      type: Boolean, 
      default: false 
    },
    read_at: { 
      type: Date 
    },
    related_entity: {
      type: {
        entity_type: { type: String, required: true },
        entity_id: { type: Schema.Types.ObjectId, required: true }
      }
    },
    status: {
      type: Number,
      enum: Object.values(Enums.NOTIFICATION.NOTIFICATION_STATUS),
      default: Enums.NOTIFICATION.NOTIFICATION_STATUS.UNREAD
    }
  },
  { timestamps: true }
);

notificationSchema.index({ recipient_id: 1, is_read: 1 });
notificationSchema.index({ createdAt: -1 });

module.exports = mongoose.model('Notification', notificationSchema);