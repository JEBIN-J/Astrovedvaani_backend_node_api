const mongoose = require('mongoose');
const { Schema } = mongoose;
const Enums = require('../utils/constants');

const chatMessageSchema = new Schema(
  {
    session_id: { 
      type: Schema.Types.ObjectId, 
      ref: 'ConsultationSession', 
      required: true,
      index: true 
    },
    sender_id: { 
      type: Schema.Types.ObjectId, 
      ref: 'User', 
      required: true,
      index: true 
    },
    receiver_id: { 
      type: Schema.Types.ObjectId, 
      ref: 'User', 
      required: true,
      index: true 
    },
    message_type: {
      type: Number,
      enum: Object.values(Enums.COMMUNICATION.MESSAGE_TYPE),
      required: true, 
      default: Enums.COMMUNICATION.MESSAGE_TYPE.TEXT
    },
    content: { 
      type: String, 
      required: true 
    },
    media_url: { 
      type: String 
    },
    is_read: { 
      type: Boolean, 
      default: false 
    },
    read_at: { 
      type: Date 
    },
    is_system_message: { 
      type: Boolean, 
      default: false 
    },
    status: { 
      type: Number,
      enum: Object.values(Enums.COMMUNICATION.MESSAGE_STATUS),
      required: true,
      default: Enums.COMMUNICATION.MESSAGE_STATUS.SENT
    }
  },
  { timestamps: true }
);

chatMessageSchema.index({ session_id: 1, createdAt: 1 });
chatMessageSchema.index({ sender_id: 1, receiver_id: 1 });
chatMessageSchema.index({ createdAt: -1 });

module.exports = mongoose.model('ChatMessage', chatMessageSchema);