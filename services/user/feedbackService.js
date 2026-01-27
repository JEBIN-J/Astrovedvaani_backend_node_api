const { BadRequestError } = require('../../errors');
const Astrologer = require('../../models/Astrologer');
const Feedback = require('../../models/Feedback');
const Enums = require('../../utils/constants');
const logger = require('../../utils/logger');
const { buildPaginationResponse } = require('../../utils/pagination');
const { updateAstrologerRatingAvg } = require('../astrologer/astrologerService');
const { updateProductRatingAvg } = require('./astromall/productService');

exports.addFeedback = async (userId, feedbackData) => {
  logger.info('[addFeedback] Called', { userId, feedbackData });

  const { source_type, source_id, rating, review, astrologer_user_id } = feedbackData;

  if (!source_type || !source_id || !rating) {
    const error = new Error('source_type, source_id, and rating are required');
    error.statusCode = 400;
    throw error;
  }
  if(source_type==Enums.ENTITY.TYPE.SESSION || source_type==Enums.ENTITY.TYPE.POOJA)
  {
    let isValidate= await Astrologer.findOne({user_id:astrologer_user_id})
    if(!isValidate)
    {
      throw new BadRequestError("Provide Correct Astrologer User Id:");
    }
  }

  const newFeedback = await Feedback.create({
    user_id: userId,
    source_type,
    source_id,
    rating,
    review,
    astrologer_user_id,
    reviewed_at: new Date()
  });
   if (
    [Enums.ENTITY.TYPE.SESSION, Enums.ENTITY.TYPE.POOJA].includes(source_type) &&
    astrologer_user_id
  ) {
    // got issue 
    await updateAstrologerRatingAvg(astrologer_user_id);
  }
  else if (source_type === Enums.ENTITY.TYPE.PRODUCT){
    await updateProductRatingAvg(source_id);
  }

  return newFeedback;
};

exports.updateFeedback = async (userId, feedbackId, updateData) => {
  logger.info('[updateFeedback] Called', { userId, feedbackId, updateData });

  const feedback = await Feedback.findOne({ _id: feedbackId, user_id: userId });

  if (!feedback) {
    const error = new Error('Feedback not found or unauthorized');
    error.statusCode = 404;
    throw error;
  }

  const allowedFields = ['rating', 'review', 'astrologer_user_id'];
  for (let field of allowedFields) {
    if (updateData[field] !== undefined) {
      feedback[field] = updateData[field];
    }
  }

  feedback.reviewed_at = new Date();
  await feedback.save();
if (
    [Enums.ENTITY.TYPE.SESSION, Enums.ENTITY.TYPE.POOJA].includes(feedback.source_type) &&
    feedback.astrologer_user_id
  ) {
    await updateAstrologerRatingAvg(feedback.astrologer_user_id);
  }
  return feedback;
};

exports.deleteFeedback = async (userId, feedbackId) => {
  logger.info('[deleteFeedback] Called', { userId, feedbackId });

  const result = await Feedback.findOneAndDelete({ _id: feedbackId, user_id: userId });
    if (
    [Enums.ENTITY.TYPE.SESSION, Enums.ENTITY.TYPE.POOJA].includes(result.source_type) &&
    result.astrologer_user_id
  ) {
    await updateAstrologerRatingAvg(result.astrologer_user_id);
  }

  if (!result) {
    const error = new Error('Feedback not found or unauthorized');
    error.statusCode = 404;
    throw error;
  }
};

exports.fetchUserFeedbacks = async (userId, page = 1, limit = 20, filters = {}) => {
  logger.info('[fetchUserFeedbacks] Called', { userId, page, limit, filters });

  const skip = (page - 1) * limit;
  const query = { user_id: userId };

  if (filters.source_type !== undefined) {
    query.source_type = filters.source_type;
  }

  if (filters.source_id !== undefined) {
    query.source_id = filters.source_id;
  }

  if (filters.astrologer_user_id !== undefined) {
    query.astrologer_user_id = filters.astrologer_user_id;
  }

  const [feedbacks, totalDocs] = await Promise.all([
    Feedback.find(query).sort({ reviewed_at: -1 }).skip(skip).limit(limit).lean(),
    Feedback.countDocuments(query)
  ]);

  return {
    feedbacks,
    pagination: buildPaginationResponse({
      totalDocs,
      totalPages: Math.ceil(totalDocs / limit),
      page,
      limit
    })
  };
};