const mongoose = require('mongoose');
const { SUBJECT_RELATION } = require('../utils/constants');
const { Schema } = mongoose;


const palmistryUploadSchema = new Schema(
  {
    uploaded_by: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    subject_name: {
      type: String,
      required: true,
      trim: true,
    },
    subject_relation: {
      type: String,
      enum: SUBJECT_RELATION,
      required: true,
    },
    notes: {
      type: String,
      trim: true,
    },
    linked_session_id: {
      type: Schema.Types.ObjectId,
      ref: 'ConsultationSession',
      default: null,
    },
  },
  { timestamps: true }
);

palmistryUploadSchema.index({ uploaded_by: 1, createdAt: -1 });

module.exports = mongoose.model('PalmistryUpload', palmistryUploadSchema);
