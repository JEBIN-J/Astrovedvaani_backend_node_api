const mongoose = require('mongoose');
const Enums = require('../utils/constants');
const { Schema } = mongoose;

const mediaSchema = new Schema({
  type: {
    type: Number,
    enum: Object.values(Enums.PRODUCT.MEDIA_TYPE),
    required: true,
  },
  url: {
    type: String,
    required: true,
    trim: true,
  },
});

module.exports = mediaSchema;
