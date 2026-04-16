const {
  createOrUpdateAstrologer,
  fetchAstrologerFromUser,
  createOrUpdateRate,
  fetchCompleteUserProfile,
  updateAvailabilityStatusService,
  getAvailabilityStatusService,
} = require("../../services/astrologer/astrologerService");
const logger = require("../../utils/logger");

exports.completeProfile = async (req, res) => {
  try {
    const userId = req.user._id;
    const profileData = req.body;
    const astrologer = await createOrUpdateAstrologer(userId, profileData);
    return res.status(200).json({
      success: true,
      message: "Astrologer profile saved successfully",
      data: astrologer,
    });
  } catch (error) {
    logger.error("Controller Error: Failed to save astrologer profile", error);
    return res.status(500).json({
      success: false,
      message: "Failed to save astrologer profile",
      error: error.message,
    });
  }
};

exports.updateServiceRate = async (req, res) => {
  try {
    const userId = req.user._id;
    const { service_type, rate, commission_pct } = req.body;

    if (
      service_type === undefined ||
      rate === undefined ||
      commission_pct === undefined
    ) {
      return res.status(400).json({
        success: false,
        message: "Missing required fields: service_type, rate, commission_pct",
      });
    }

    // Get astrologerId from userId
    const astrologer = await fetchAstrologerFromUser(userId);

    const result = await createOrUpdateRate(astrologer._id, {
      service_type,
      rate,
      commission_pct,
    });

    return res.status(200).json({
      success: true,
      message: "Service rate updated successfully",
      data: result,
    });
  } catch (error) {
    logger.error("Controller Error: Failed to update service rate", error);
    return res.status(500).json({
      success: false,
      message: "Failed to update service rate",
      error: error.message,
    });
  }
};

exports.getLoggedInUserProfile = async (req, res) => {
  try {
    console.log("hghghghhhghgh");
    const userId = req.user._id;
    const profile = await fetchCompleteUserProfile(userId);

    return res.status(200).json({
      success: true,
      message: "User profile fetched successfully",
      data: profile,
    });
  } catch (error) {
    logger.error("Controller Error: Failed to fetch user profile", error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch user profile",
      error: error.message,
    });
  }
};

exports.updateAvailabilityStatus = async (req, res) => {
  try {
    const userId = req.user._id;
    const { is_online, isChat, isCall, isVideo } = req.body;
    await updateAvailabilityStatusService(userId, {
      is_online,
      isChat,
      isCall,
      isVideo,
    });

    return res.status(200).json({
      success: true,
      message: "Availability status updated successfully",
    });
  } catch (error) {
    logger.error(
      "Controller Error: Failed to update availability status",
      error,
    );
    return res.status(500).json({
      success: false,
      message: "Failed to update availability status",
      error: error.message,
    });
  }
};

exports.getAvailabilityStatus = async (req, res) => {
  try {
    const userId = req.user._id;
    const result = await getAvailabilityStatusService(userId);

    return res.status(200).json({
      success: true,
      message: "Availability status fetched successfully",
      data: result,
    });
  } catch (error) {
    logger.error(
      "Controller Error: Failed to fetch availability status",
      error,
    );
    return res.status(500).json({
      success: false,
      message: "Failed to fetch availability status",
      error: error.message,
    });
  }
};
