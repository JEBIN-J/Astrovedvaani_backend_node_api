const asyncHandler = require('../../middlewares/asyncHandler');
const adminFeedbackService = require('../../services/admin/feedBackService');

exports.fetchAllFeedbacks = async (req, res, next) => {
  try {
    const {
      page = 1,
      limit = 20,
      rating,
      is_visible,
      source_type,
      user_id,
      astrologer_user_id,
      from,
      to,
      search,
    } = req.query;

    const filters = {
      rating,
      is_visible,
      source_type,
      user_id,
      astrologer_user_id,
      from,
      to,
      search,
    };
    const result = await adminFeedbackService.getAllFeedbacksForAdmin(
      parseInt(page),
      parseInt(limit),
      filters
    );

    return res.status(200).json({
      success: true,
      message: 'Feedback list fetched successfully',
      ...result,
    });
  } catch (err) {
    next(err);
  }
};
exports.updateSingleFeedback = async (req, res) => {
  try {
    const id  = req.query.id || req.query._id;
    const { is_visible } = req.body;

    if (typeof is_visible !== "boolean") {
      return res.status(400).json({ message: "Invalid is_visible value." });
    }

    const result = await adminFeedbackService.updateFeedbackVisibility(id, is_visible);

    if (!result) {
      return res.status(404).json({ message: "Feedback not found." });
    }

    res.json({ message: "Feedback updated", feedback: result });
  } catch (error) {
    console.error("Error updating feedback:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};
exports.bulkUpdateFeedbacks = async (req, res) => {
  try {
    const { days, is_visible } = req.body;

    if (typeof days !== "number" || days <= 0) {
      return res.status(400).json({ message: "Invalid days value." });
    }

    if (typeof is_visible !== "boolean") {
      return res.status(400).json({ message: "Invalid is_visible value." });
    }

    const result = await adminFeedbackService.bulkUpdateFeedbackVisibility(days, is_visible);

    res.json({
      message: `Updated ${result.modifiedCount} feedback(s) visibility`,
      result,
    });
  } catch (error) {
    console.error("Error bulk updating feedbacks:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};
exports.deleteFeedback = asyncHandler(async (req, res) => {
  const id = req.query.id || req.query._id;
  if (!id) {
    return res.status(400).json({
      success: false,
      message: 'feedbackId is required',
    });
  }

  try {
    const deleted = await adminFeedbackService.deleteFeedbackById(id);

    if (!deleted) {
      return res.status(404).json({
        success: false,
        message: 'Feedback not found or already deleted',
      });
    }

    return res.status(200).json({
      success: true,
      message: 'Feedback deleted successfully',
    });
  } catch (error) {
    console.error('[deleteFeedback] Error:', error);
    return res.status(500).json({
      success: false,
      message: 'Internal server error',
    });
  }
});
