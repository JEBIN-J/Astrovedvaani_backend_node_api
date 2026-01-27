const asyncHandler = require("../../middlewares/asyncHandler");
const { completeProfile, getMyProfile } = require("../../services/user/profileService");
const logger = require("../../utils/logger");

// exports.completeProfile = asyncHandler(async (req, res) => {
//   const userId = req.user._id;
//   const profileData = req.body;
//   const updatedUser = await completeProfile(userId, profileData);

//   return res.status(200).json({
//     success: true,
//     message: "Profile updated successfully",
//     user: updatedUser,
//   });
// });
exports.completeProfile = asyncHandler(async (req, res) => {
  const userId = req.user._id;

  // Sanitize request: remove empty, null, or undefined fields
  const profileData = {};
  Object.keys(req.body).forEach((key) => {
    const val = req.body[key];
    if (val !== "" && val !== null && val !== undefined) {
      profileData[key] = val;
    }
  });

  const updatedUser = await completeProfile(userId, profileData);

  return res.status(200).json({
    success: true,
    message: "Profile updated successfully",
    user: updatedUser,
  });
});




exports.getMyProfile = async (req, res) => {
  try {
    const userId = req.user._id;
    const userProfile = await getMyProfile(userId);
    if (!userProfile) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    return res.status(200).json({
      success: true,
      message: "User profile fetched successfully",
      user: userProfile,
    });
  } catch (error) {
    logger.error("User getMyProfile failed", error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

