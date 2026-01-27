const Enums = require("../utils/constants");
const User = require("../models/User");
const { UnauthorizedError } = require("../errors");
const logger = require("../utils/logger");

const validateUserStatus = async (userId, path) => {
  const user = await User.findById(userId).select(
    "role isBlock isDeleted verificationStatus",
  );

  if (!user) {
    throw new UnauthorizedError("User not found");
  }
  if (user.isBlock) {
    throw new UnauthorizedError("User is blocked");
  }
  if (user.isDeleted) {
    logger.info(`[validateUserStatus] User is deleted: userId=${userId}`);
    throw new UnauthorizedError("User not found");
  }
  if (
    user.role === Enums.USER.ROLE.ASTROLOGER &&
    user.verificationStatus !== Enums.USER.VERIFICATION_STATUS.APPROVED &&
    path != "/profile/create-or-update"
  ) {
    throw new UnauthorizedError("Astrologer is not verified");
  }
  return true;
};

module.exports = validateUserStatus;
