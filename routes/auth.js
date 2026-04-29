const express = require("express");
const router = express.Router();
const authController = require("../controller/authController");
const User = require("../models/User");
router.post("/login-via-otp", authController.loginByOTP);
router.post("/login-via-password", authController.loginByPassword);
router.get("/google/login", authController.googleLoginRedirect);
router.get("/google/callback", authController.googleCallback);
router.post("/google/exchange", authController.googleCodeExchange); //for app
router.get("/google/client-id", authController.getGoogleClientId); //for code
router.post("/google/mobile/exchange", authController.googleMobileCodeExchange);

router.post("/verify-otp", authController.verifyOtp);
router.post("/send-otp", authController.loginByOTP);
router.post("/signup", authController.signUp);
router.get("/get-access-token", authController.getAccssToken);
const authenticate = require("../middlewares/authMiddleware");

router.post("/update-password", authenticate, authController.updatePassword);
router.post("/reset-password", authController.resetPassword);
router.delete("/delete-account", authenticate, authController.deleteAccount);
router.get("/validate-token", authenticate, async (req, res) => {
  const user = req.user;

  const authHeader = req.headers.authorization;
  const token = authHeader.split(" ")[1];

  const dbUser = await User.findById(user._id).select("isOnboarded").lean();

  console.log(user);

  res.json({
    success: true,
    message: "Login successful",
    accessToken: token,
    role: user.role,
    isOnboarded: dbUser?.isOnboarded,
  });
});
router.post("/send-email-otp", authController.sendEmailOtp);

router.post("/logout", authenticate, authController.logout);
module.exports = router;
