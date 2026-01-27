const mongoose = require("mongoose");

const kundliSchema = new mongoose.Schema({
  name: { type: String, required: true, unique: true },
  image: { type: String, required: true },
});

module.exports = mongoose.model("Kundli", kundliSchema);
