const mongoose = require('mongoose');
const { Schema } = mongoose;

const userKundliSchema = new Schema(
  {
    user_id: { type: Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
    data: { type: Schema.Types.Mixed, required: true },
    report_url: String,
  },
  { timestamps: true }
);

module.exports = mongoose.model('UserKundli', userKundliSchema);
