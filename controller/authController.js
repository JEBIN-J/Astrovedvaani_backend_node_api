const { BadRequestError, UnauthorizedError } = require("../errors");
const authService = require("../services/authService");
const logger = require("../utils/logger");
const asyncHandler = require("../middlewares/asyncHandler");
const User = require("../models/User");
const OTPService = require("../utils/redis/otpService");
const {
  getOtpEmailHtml,
} = require("../services/communication/resetPasswordMail");
const bcrypt = require("bcryptjs");
const EmailService = require("../services/communication/emailService");
const Astrologer = require("../models/Astrologer");
function normalizeMobileInput(mobileNumber, countryCode) {
  if (!countryCode) {
    countryCode = "+91"; // default
  }

  if (mobileNumber) {
    if (countryCode === "+91") {
      const cleanedNumber = mobileNumber.replace(/\D/g, ""); // strip non-digits
      if (!/^\d{10}$/.test(cleanedNumber)) {
        throw new BadRequestError(
          "For country code +91, mobile number must be exactly 10 digits.",
        );
      }
      mobileNumber = cleanedNumber;
    }
  }

  return { mobileNumber, countryCode };
}

exports.loginByOTP = asyncHandler(async (req, res) => {
  logger.info("AuthController: loginByOTP request", { body: req.body });

  let { mobileNumber, email, countryCode } = req.body;

  if (!mobileNumber && !email) {
    throw new BadRequestError("Mobile number or email is required.");
  }

  // normalize mobile & countryCode
  ({ mobileNumber, countryCode } = normalizeMobileInput(
    mobileNumber,
    countryCode,
  ));

  const result = await authService.loginByOTP({
    mobileNumber,
    email,
    countryCode,
  });

  logger.info("AuthController: loginByOTP successful", {
    user: result.user?.id,
  });

  res.status(200).json({ success: true, ...result });
});

exports.verifyOtp = asyncHandler(async (req, res) => {
  let {
    mobileNumber,
    email,
    otp,
    referredByCode,
    deviceId,
    longitude,
    latitude,
    os,
    modelNumber,
    fcmToken,
    countryCode,
  } = req.body;

  if (!otp || (!mobileNumber && !email)) {
    logger.info(
      `AuthController: verifyOtp missing identifier or OTP - mobileNumber: ${
        mobileNumber || "N/A"
      }, email: ${email || "N/A"}`,
    );
    throw new BadRequestError("Mobile number or email and OTP are required.");
  }

  // normalize mobile & countryCode
  ({ mobileNumber, countryCode } = normalizeMobileInput(
    mobileNumber,
    countryCode,
  ));

  logger.info(
    `AuthController: verifyOtp attempt - mobileNumber: ${
      mobileNumber || "N/A"
    }, email: ${email || "N/A"}, countryCode: ${
      countryCode || "N/A"
    }, referredByCode: ${referredByCode || "N/A"}`,
  );

  const result = await authService.verifyOtp(
    { mobileNumber, email, countryCode },
    otp,
    referredByCode,
    deviceId,
    longitude,
    latitude,
    os,
    modelNumber,
    fcmToken,
  );

  logger.info(`AuthController: verifyOtp successful`);
  res.status(200).json({ success: true, ...result });
});

exports.loginByPassword = asyncHandler(async (req, res) => {
  try {
    const {
      email,
      mobileNumber,
      password,
      deviceId,
      longitude,
      latitude,
      os,
      modelNumber,
      fcmToken,
    } = req.body;
    const identifier = email || mobileNumber;
    const requestOrigin = req.headers.origin;
    logger.info("AuthController: loginByPassword request", {
      identifier,
      requestOrigin,
    });
    const response = await authService.loginByPassword({
      identifier,
      password,
      deviceId,
      longitude,
      latitude,
      requestOrigin,
      os,
      modelNumber,
      fcmToken,
    });
    logger.info("AuthController: loginByPassword successful", {
      user: response.user?.id,
    });
    return res.json({ success: true, ...response });
  } catch (error) {
    logger.error("AuthController: loginByPassword failed", {
      error: error.message,
    });
    const responseBody = {
      success: false,
      message: error.message || "Login failed",
    };
    if (error.deviceList) {
      responseBody.deviceList = error.deviceList;
    }
    return res.status(400).json(responseBody);
  }
});

exports.updatePassword = async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    const result = await authService.updatePassword(
      req.user._id,
      currentPassword,
      newPassword,
    );
    logger.info(`Password updated for user ${req.user.userId}`);
    res.json({ success: true, ...result });
  } catch (error) {
    logger.error("Password update failed", error);
    res.status(400).json({ success: false, message: error.message });
  }
};

// exports.resetPassword = async (req, res) => {
//   try {
//     const { newPassword } = req.body;
//     if (!newPassword) {
//       return res
//         .status(400)
//         .json({ success: false, message: "New password is required" });
//     }
//     const result = await authService.setNewPassword(req.user._id, newPassword);
//     logger.info(`Password reset for user ${req.user.userId}`);
//     res.json({ success: true, ...result });
//   } catch (error) {
//     logger.error("Password reset failed", error);
//     res.status(400).json({ success: false, message: error.message });
//   }
// };
exports.resetPassword = asyncHandler(async (req, res) => {
  const { email, otp, newPassword } = req.body;

  if (!email || !otp || !newPassword) {
    throw new BadRequestError("Email, OTP and new password are required");
  }

  const identifier = email.toLowerCase();

  // Validate OTP directly with Redis
  const isValid = await OTPService.validateEmailOTP(identifier, otp);
  if (!isValid) {
    throw new UnauthorizedError("Invalid or expired OTP");
  }

  const user = await User.findOne({ email: identifier });
  if (!user) {
    throw new NotFoundError("User not found");
  }

  // Update password
  const salt = await bcrypt.genSalt(10);
  user.password = await bcrypt.hash(newPassword, salt);
  await user.save();

  return res.status(200).json({
    success: true,
    message: "Password reset successfully",
  });
});
exports.signUp = asyncHandler(async (req, res) => {
  logger.info("AuthController: signUpAstrologer request");

  const { email, password, name, role, mobileNumber } = req.body;

  const result = await authService.signUp({
    email,
    password,
    name,
    role,
    mobileNumber,
  });

  logger.info("AuthController: signUpAstrologer success");

  return res.status(201).json({
    success: true,
    ...result,
  });
});

exports.deleteAccount = asyncHandler(async (req, res) => {
  const userId = req.user._id;
  const result = await authService.deleteOwnAccount(userId);
  res.status(200).json(result);
});

exports.getAccssToken = async (req, res, next) => {
  try {
    const { refreshToken } = req.query;
    if (!refreshToken) {
      throw new BadRequestError("Refresh token is required");
    }

    const result = await authService.refreshAccessToken(refreshToken);

    return res.status(200).json({
      success: true,
      message: "Token refreshed successfully",
      ...result,
    });
  } catch (error) {
    logger.error("[AuthController] Refresh token error", error);
    return res.status(401).json({
      success: false,
      message: error.message || "Invalid or expired refresh token",
    });
  }
};

exports.googleLoginRedirect = asyncHandler(async (req, res) => {
  logger.info("Starting Google login redirect");

  const integration = await authService.getGoogleOAuthConfig();
  if (!integration) {
    throw new ApiError(500, "Google OAuth is not configured");
  }

  const { api_key: clientId, redirect_uri: redirectUri } = integration;

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: "openid email profile",
    access_type: "offline",
    prompt: "consent",
  });

  const googleAuthUrl = `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
  logger.info(`Redirecting user to Google OAuth URL: ${googleAuthUrl}`);

  return res.redirect(googleAuthUrl);
});

exports.googleCallback = asyncHandler(async (req, res) => {
  const code = req.query.code;
  if (!code) {
    throw new BadRequestError("Authorization code not provided");
  }

  logger.info(`Received Google callback with code: ${code}`);
  const result = await authService.handleGoogleCallback(code);

  if (!result?.user) {
    throw new UnauthorizedError("Google authentication failed");
  }

  return res.json({
    success: true,
    message: "Google login successful",
    accessToken: result.accessToken,
    refreshToken: result.refreshToken,
    user: result.user,
    role: result.role,
  });
});

exports.googleCodeExchange = asyncHandler(async (req, res) => {
  const { code } = req.body;
  if (!code) {
    throw new BadRequestError("Google ID token not provided");
  }

  logger.info(`Received ID token from client`);

  const result = await authService.loginByGoogle({ idToken: code });

  return res.json({
    success: true,
    ...result,
  });
});
exports.getGoogleClientId = asyncHandler(async (req, res) => {
  const integration = await authService.getGoogleOAuthConfig();
  if (!integration) {
    throw new ApiError(500, "Google OAuth is not configured");
  }

  const { api_key: clientId } = integration;

  return res.json({
    success: true,
    clientId,
  });
});

exports.googleMobileCodeExchange = asyncHandler(async (req, res) => {
  const { code } = req.body;
  if (!code) {
    throw new BadRequestError("Google ID token not provided");
  }

  logger.info(`Received ID token from Mobile client ${code}`);

  const result = await authService.loginByGoogleMobile({ idToken: code });

  return res.json({
    success: true,
    ...result,
  });
});

exports.sendEmailOtp = async (req, res) => {
  try {
    const { email } = req.body;

    logger.info(`[Email OTP] Request received for email: ${email || "N/A"}`);

    if (!email) {
      return res.status(400).json({
        success: false,
        message: "Email is required",
      });
    }

    const normalizedEmail = email.toLowerCase().trim();
    const user = await User.findOne({ email: normalizedEmail });

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "No account found with this email",
      });
    }

    logger.info(`[Email OTP] User found | userId: ${user._id}`);

    const otp = OTPService.generateOTP();
    await OTPService.storeEmailOTP(normalizedEmail, otp);

    logger.info(`[Email OTP] OTP stored successfully`);

    //  USE SEPARATE OTP EMAIL TEMPLATE
    const html = getOtpEmailHtml({ name: user.name, otp });

    await EmailService.sendMail({
      to: normalizedEmail,
      subject: "Your OTP Code - astrovedvanni",
      html,
    });

    logger.info(`[Email OTP] OTP email sent to ${normalizedEmail}`);

    return res.status(200).json({
      success: true,
      message: "OTP sent to your email",
    });
  } catch (error) {
    logger.error(`[Email OTP] Error: ${error.message}`, { stack: error.stack });
    return res.status(500).json({
      success: false,
      message: "Failed to send OTP",
    });
  }
};

exports.logout = asyncHandler(async (req, res, next) => {
  try {
    const userId = req.user._id;
    const { deviceId } = req.body;

    const user = await User.findById(userId);

    if (!user) {
      throw new UnauthorizedError("User not found");
    }
    const astrologerData = await Astrologer.findOne({ user_id: userId });
    if (astrologerData) {
      astrologerData.is_online = false;
      await astrologerData.save();
    }
    // Remove device from devices array
    if (deviceId) {
      user.devices = user.devices.filter(
        (device) => device.deviceId !== deviceId,
      );
    }
    user.fcmToken = null;
    // Clear session tracking
    user.currentSessionId = null;
    // Update last activity
    user.lastLogin = new Date();
    await user.save();
    // Remove Redis presence (if you maintain online state)
    try {
      const redis = require("../utils/redis/redisClient");
      await redis.del(`user_online:${userId}`);
    } catch (err) {
      logger.error("Redis cleanup failed:", err.message);
    }

    return res.json({
      success: true,
      message: "Logout successful",
    });
  } catch (err) {
    next(err);
  }
});
