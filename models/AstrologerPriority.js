const mongoose = require("mongoose");
const { Schema } = mongoose;

const astrologerPrioritySchema = new Schema(
  {
    astrologer_ids: [
      {
        type: Schema.Types.ObjectId,
        ref: "Astrologer",
        required: true,
      },
    ],

    updated_by: {
      type: Schema.Types.ObjectId,
      ref: "User", // admin
    },
  },
  { timestamps: true },
);

module.exports = mongoose.model("AstrologerPriority", astrologerPrioritySchema);
