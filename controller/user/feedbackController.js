const feedbackService = require('../../services/user/feedbackService');

exports.addMyFeedback = async (req, res, next) => {
  try {
    const userId = req.user._id;
    const feedback = await feedbackService.addFeedback(userId, req.body);

    res.status(201).json({
      success: true,
      message: 'Feedback added successfully',
      data: feedback
    });
  } catch (err) {
    next(err);
  }
};

exports.updateMyFeedback = async (req, res, next) => {
  try {
    const userId = req.user._id;
    const feedbackId = req.query.id;
    const updatedFeedback = await feedbackService.updateFeedback(userId, feedbackId, req.body);

    res.status(200).json({
      success: true,
      message: 'Feedback updated successfully',
      data: updatedFeedback
    });
  } catch (err) {
    next(err);
  }
};

exports.deleteMyFeedback = async (req, res, next) => {
  try {
    const userId = req.user._id;
    const feedbackId = req.query.id;

    await feedbackService.deleteFeedback(userId, feedbackId);

    res.status(200).json({
      success: true,
      message: 'Feedback deleted successfully'
    });
  } catch (err) {
    next(err);
  }
};

exports.getMyFeedbacks = async (req, res, next) => {
  try {
    const userId = req.user._id;
    const { page = 1, limit = 20, ...filters } = req.query;

    const response = await feedbackService.fetchUserFeedbacks(userId, parseInt(page), parseInt(limit), filters);

    res.status(200).json({ success: true, data: response });
  } catch (err) {
    next(err);
  }
};
