const mongoose = require("mongoose");
const { Schema } = mongoose;
const Enums = require("../utils/constants");
const supportTicketSchema = new Schema(
  {
    raised_by: {
      id: {
        type: Schema.Types.ObjectId,
        ref: "User",
        default: null,
      },
      role: {
        type: String,
        enum: Object.values(Enums.USER.ROLE),
        default: null,
      },
    },
    related_to: {
      model: {
        type: String,
        enum: Object.values(Enums.SUPPORT.RELATED_TO),
        default: null,
      },
      ref_id: {
        type: Schema.Types.ObjectId,
        default: null,
      },
    },

    subject: { type: String, required: true },
    description: { type: String, required: true },

    category: {
      type: String,
      enum: Object.values(Enums.SUPPORT.CATEGORY),
      default: Enums.SUPPORT.CATEGORY.OTHER,
    },

    priority: {
      type: String,
      enum: Object.values(Enums.SUPPORT.PRIORITY),
      default: Enums.SUPPORT.PRIORITY.MEDIUM,
    },

    status: {
      type: String,
      enum: Object.values(Enums.SUPPORT.TICKET_STATUS),
      default: Enums.SUPPORT.TICKET_STATUS.OPEN,
    },
    attachment_url: String,
    resolution_notes: {
      type: String,
      default: null,
    },
  },
  { timestamps: true },
);

supportTicketSchema.index({ "raised_by.id": 1 });
supportTicketSchema.index({ "related_to.model": 1, "related_to.ref_id": 1 });

module.exports = mongoose.model("SupportTicket", supportTicketSchema);
