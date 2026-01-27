const mongoose = require('mongoose');
const { IMAGE_TYPE } = require('../utils/constants');
const { Schema } = mongoose;


const palmistryImageSchema = new Schema(
  {
    upload_id: {
      type: Schema.Types.ObjectId,
      ref: 'PalmistryUpload',
      required: true,
      index: true,
    },
    image_type: {
      type: String,
      enum: IMAGE_TYPE,
      required: true,
    },
    image_url: {
      type: String,
      required: true,
      trim: true,
    },
  },
  { timestamps: true }
);

palmistryImageSchema.index({ upload_id: 1 });

module.exports = mongoose.model('PalmistryImage', palmistryImageSchema);
