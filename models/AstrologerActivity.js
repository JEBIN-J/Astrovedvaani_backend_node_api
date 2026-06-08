const mongoose = require("mongoose");
const { Schema } = mongoose;

const astrologerActivitySchema = new Schema(
  {
    astrologer_id: {
      type: Schema.Types.ObjectId,
      ref: "Astrologer",
      required: true,
      index: true,
    },

    activity_date: {
      type: String,
      required: true,
    },

    first_login_at: {
      type: Date,
      default: null,
    },

    current_login_at: {
      type: Date,
      default: null,
    },

    last_logout_at: {
      type: Date,
      default: null,
    },

    total_online_seconds: {
      type: Number,
      default: 0,
    },

    login_count: {
      type: Number,
      default: 0,
    },

    is_online: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
  }
);

astrologerActivitySchema.index(
  {
    astrologer_id: 1,
    activity_date: 1,
  },
  {
    unique: true,
  }
);

module.exports = mongoose.model(
  "AstrologerActivity",
  astrologerActivitySchema
);