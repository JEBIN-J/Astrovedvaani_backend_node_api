const Enums = require("../../utils/constants");
const asyncHandler = require("../../middlewares/asyncHandler");
const {ForbiddenError, NotFoundError } = require("../../errors");
const userService = require("../../services/admin/adminUserService");

exports.updateUser = asyncHandler(async (req, res) => {
  const { userId } = req.query;
  const { _id, id, createdAt, updatedAt, role, ...safeBody } = req.body;
  const requester = req.user;
  if (!requester) throw new ForbiddenError("Unauthorized request");
  const targetUserId = userId || requester._id;
  const isSelf = requester._id.toString() === targetUserId.toString();
  if (isSelf) {
  } else {
    const targetUser = await userService.getUserById(targetUserId);
    if (!targetUser) throw new NotFoundError("Target user not found");
    switch (requester.role) {
      case Enums.USER.ROLE.SUPER_ADMIN:
        break;
      case Enums.USER.ROLE.ADMIN:
        if (
          ![Enums.USER.ROLE.VENDOR, Enums.USER.ROLE.ASTROLOGER].includes(targetUser.role)
        ) {
          throw new ForbiddenError(
            "Admin can only update vendors or astrologers, not other admins or super admins"
          );
        }
        break;
      case Enums.USER.ROLE.VENDOR:
      case Enums.USER.ROLE.ASTROLOGER:
        throw new ForbiddenError("You are not allowed to update other users");
      default:
        throw new ForbiddenError("Invalid role access");
    }
  }
  const updatedUser = await userService.updateUserById(targetUserId, safeBody);
  return res.status(200).json({
    success: true,
    message: isSelf
      ? "Profile updated successfully"
      : "User details updated successfully",
    data: updatedUser,
  });
});