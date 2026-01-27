const Enums = require("../utils/constants");
const mongoose = require("mongoose");
const { Schema } = mongoose;
const ticketReplySchema = new Schema(
  {
    ticket_id: {
      type: Schema.Types.ObjectId,
      ref: "SupportTicket",
      required: true,
      index: true,
    },
    sender: {
      id: {
        type: Schema.Types.ObjectId,
        ref: "User",
        required: true,
      },
      role: {
        type: Number,
        enum: Object.values(Enums.USER.ROLE),
        default: Enums.USER.ROLE.ADMIN,
      },
    },
    message: {
      type: String,
      required: true,
    },
    attachment_url: {
      type: String,
      default: null,
    },
    replied_at: {
      type: Date,
      default: Date.now,
    },
  },
  { timestamps: false },
);

module.exports = mongoose.model("TicketReply", ticketReplySchema);
