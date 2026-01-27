const { buildPaginationResponse } = require('../../utils/pagination');
const Feedback = require('../../models/Feedback');
const logger = require('../../utils/logger');
const { ENTITY } = require('../../utils/constants');
const mongoose = require('mongoose');

exports.getAllFeedbacksForAdmin = async (page = 1, limit = 20, filters = {}) => {
  logger.info('[getAllFeedbacksForAdmin] Called', { page, limit, filters });
  const skip = (page - 1) * limit;
  const match = {};
  if (filters.source_type !== undefined) match.source_type = parseInt(filters.source_type);
  if (filters.rating !== undefined) match.rating = parseInt(filters.rating);
  if (filters.is_visible !== undefined) match.is_visible = filters.is_visible === 'true';
  if (filters.user_id) match.user_id = mongoose.Types.ObjectId(filters.user_id);
  if (filters.astrologer_user_id) match.astrologer_user_id = mongoose.Types.ObjectId(filters.astrologer_user_id);
  if (filters.from || filters.to) {
    match.reviewed_at = {};
    if (filters.from) match.reviewed_at.$gte = new Date(filters.from);
    if (filters.to) match.reviewed_at.$lte = new Date(filters.to);
  }
  const pipeline = [
    { $match: match },
    { $lookup: {
        from: "users",
        localField: "user_id",
        foreignField: "_id",
        as: "user"
    }},
    { $unwind: "$user" },
    { $lookup: {
        from: "astrologers",
        localField: "astrologer_user_id",
        foreignField: "user_id",
        as: "astrologer"
    }},
    { $unwind: { path: "$astrologer", preserveNullAndEmptyArrays: true } },
    { $lookup: {
        from: "users",
        localField: "astrologer_user_id",
        foreignField: "_id",
        as: "astrologerUser"
    }},
    { $unwind: { path: "$astrologerUser", preserveNullAndEmptyArrays: true } },

    { $addFields: {
        "astrologer.name": "$astrologerUser.name"
    }},
    { $project: { astrologerUser: 0 } }
  ];
  if (filters.search) {
    const regex = new RegExp(filters.search, 'i');
    pipeline.push({
      $match: {
        $or: [
          { "user.name": regex },
          { "astrologer.display_name": regex },
          { "astrologer.name": regex }
        ],
      },
    });
  }
  const totalDocsPipeline = [...pipeline, { $count: "count" }];
  const totalDocsResult = await Feedback.aggregate(totalDocsPipeline);
  const totalDocs = totalDocsResult[0]?.count || 0;
  pipeline.push({ $sort: { reviewed_at: -1 } });
  pipeline.push({ $skip: skip });
  pipeline.push({ $limit: limit });
  const data = await Feedback.aggregate(pipeline);
  return {
    data,
    pagination: buildPaginationResponse({
      totalDocs,
      totalPages: Math.ceil(totalDocs / limit),
      page,
      limit,
    }),
  };
};

exports.getFeedBackBySourceId = async (source_id) => {
  try {
    const userFeedback = await Feedback.findOne({ source_id });
    if (!userFeedback) {
      return null;
    }
    return {
      rating: userFeedback.rating,
      review: userFeedback.review,
    };
  } catch (err) {
    console.error("Error fetching feedback:", err);
    throw err;
  }
};
exports.updateFeedbackVisibility = async (feedbackId, isVisible) => {
  const result = await Feedback.findByIdAndUpdate(
    feedbackId,
    { is_visible: isVisible },
    { new: true }
  ).lean();

  return result;
};

exports.bulkUpdateFeedbackVisibility = async (days, isVisible) => {
  const sinceDate = new Date();
  sinceDate.setDate(sinceDate.getDate() - days);
  logger.info(`Updating visibility for feedback since ${sinceDate.toISOString()}`);
  logger.info(`Setting is_visible to: ${isVisible}`);

  const result = await Feedback.updateMany(
    {
      reviewed_at: { $gte: sinceDate },
      is_visible: { $ne: isVisible },
    },
    {
      $set: { is_visible: isVisible },
    }
  );

  return result;
};

exports.deleteFeedbackById = async (feedbackId) => {
  if (!mongoose.Types.ObjectId.isValid(feedbackId)) {
    throw new Error('Invalid feedbackId');
  }
  const result = await Feedback.findByIdAndDelete(feedbackId).lean();
  return result;
};
