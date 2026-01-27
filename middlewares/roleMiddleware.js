const Enums = require("../utils/constants");

module.exports = (...allowedRoles) => {
  return (req, res, next) => {
    const userRole = req.user?.role;
    if(userRole === Enums.USER.ROLE.SUPER_ADMIN || userRole === Enums.USER.ROLE.ADMIN ||userRole === Enums.USER.ROLE.VENDOR){
      return next();
    }
    const isOnboarded = req.user?.isOnboarded;
    if (!isOnboarded && req.path != "/profile/create-or-update") {
      return res.status(403).json({
        success: false,
        message: "Access denied: Complete onboarding",
      });
    }
    if (!userRole) {
      return res
        .status(403)
        .json({ success: false, message: "Access denied: No role assigned" });
    }
    if (!allowedRoles.includes(userRole)) {
      return res
        .status(403)
        .json({ success: false, message: "Access denied: Insufficient role" });
    }
    next();
  };
};
