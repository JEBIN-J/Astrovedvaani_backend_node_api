const mongoose = require('mongoose');
const { Schema } = mongoose;

const questionSchema = new Schema({
  type: { type: String, enum: ['MCQ', 'UPI'], required: true },
  question: { type: String, required: true },
  options: [String],
  correct_answer: Schema.Types.Mixed,
}, { _id: false });

const quizSchema = new Schema({
  title: { type: String, required: true },
  category: { type: String, default: 'general' },
  questions: { type: [questionSchema], default: [] },
  is_active: { type: Boolean, default: true },
}, { timestamps: true });

module.exports = mongoose.model('Quiz', quizSchema);
