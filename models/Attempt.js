const mongoose = require('mongoose');
const { Schema } = mongoose;

const userAnswerSchema = new Schema({
  question_index: { type: Number, required: true },
  selected_answer: Schema.Types.Mixed,
  is_correct: { type: Boolean },
}, { _id: false });

const attemptSchema = new Schema({
  user_id: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  quiz_id: { type: Schema.Types.ObjectId, ref: 'Quiz', required: true },
  score: { type: Number, default: 0 },
  answers: { type: [userAnswerSchema], default: [] },
  attempted_at: { type: Date, default: Date.now },
}, { timestamps: true });

module.exports = mongoose.model('Attempt', attemptSchema);
