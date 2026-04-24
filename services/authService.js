const User = require("../models/User");
const ThirdPartyIntegration = require("../models/ThirdPartyIntegration");

const { sendOTP } = require("../utils/CommunicationHelper");
const { OAuth2Client } = require("google-auth-library");
const jwtService = require("../utils/jwtService");
const Enums = require("../utils/constants");
const logger = require("../utils/logger");
const referralService = require("./referralService");
const bcrypt = require("bcryptjs");
const { createWallet } = require("./walletService");
const OTPService = require("../utils/redis/otpService");
const {
  NotFoundError,
  UnauthorizedError,
  BadRequestError,
  ApiError,
  ForbiddenError,
} = require("../errors");
const axios = require("axios");
const querystring = require("querystring");
const Setting = require("../models/Setting");
const crypto = require("crypto");
const { NOTFOUND } = require("dns");
const { getMyProfile } = require("./user/profileService");
const { sendWelcomeEmail } = require("./communication/welcomeMail");
const CacheService = require("../utils/redis/cacheService");
const Wallet = require("../models/Wallet");
const UserAstrology = require("../models/UserAstrology");
const redisClient = require("../utils/redis/redisClient");
const ASTROLOGER_CACHE_PREFIX = "astro:list";

const generateAuthTokens = (user, deviceId, onlyAccessToken = false) => {
  const payload = {
    _id: user._id.toString(),
    role: user.role,
    isAi: user.isAi,
    sessionId: user.currentSessionId,
    isOnboarded: user.isOnboarded,
    deviceId,
  };

  const accessToken = jwtService.generateAccessToken(payload);

  if (onlyAccessToken) {
    return { accessToken };
  }

  const refreshToken = jwtService.generateRefreshToken(payload);

  return { accessToken, refreshToken };
};
const TEST_NUMBERS = {
  "+911234567890": "999999",
  "+919876543210": "1111",
  "+919999999999": "9999",
  "+918888888888": "8888",
  "+917777777777": "7777",
  "+916666666666": "6666",
  "+915555555555": "5555",
};
const loginByOTP = async (identifier) => {
  const { mobileNumber, email, countryCode } = identifier;
  if (!mobileNumber && !email) {
    throw new Error("Mobile number or email required.");
  }

  let identifierValue;
  if (mobileNumber) {
    identifierValue = `${countryCode || ""}${mobileNumber}`;
  } else {
    identifierValue = email.toLowerCase();
  }

  // 🔹 Check if it's a test user
  if (TEST_NUMBERS[identifierValue]) {
    const otp = TEST_NUMBERS[identifierValue];
    await OTPService.storeOTP(identifierValue, otp);
    logger.info(`Static test OTP used for ${identifierValue}: ${otp}`);
    return { message: "OTP sent successfully" };
  }
  const otp = OTPService.generateOTP();
  await OTPService.storeOTP(identifierValue, otp);
  Promise.resolve()
    .then(() => sendOTP(identifierValue, otp))
    .catch((err) =>
      logger.error(
        `Background OTP send failed for ${identifierValue}: ${err.message}`,
      ),
    );
  logger.info(`OTP generated and send initiated for ${identifierValue}`);
  return { message: "OTP sent successfully" };
};
const verifyOtp = async (
  identifier,
  otp,
  referredByCode = null,
  deviceId,
  longitude,
  latitude,
  os,
  modelNumber,
  fcmToken,
) => {
  const { mobileNumber, email, countryCode } = identifier;
  let isNew = false;

  logger.info(
    `[OTP Verification] Starting process - mobileNumber: ${
      mobileNumber || "N/A"
    }, email: ${email || "N/A"}, countryCode: ${countryCode || "N/A"}`,
  );

  if (!otp || (!mobileNumber && !email)) {
    logger.info(`[OTP Verification] Missing OTP or identifier`);
    throw new BadRequestError("Mobile number or email and OTP are required.");
  }

  let identifierValue;
  let query;

  if (mobileNumber) {
    if (!countryCode) {
      throw new BadRequestError("Country code is required with mobile number.");
    }
    identifierValue = `${countryCode}${mobileNumber}`;
    query = { mobileNumber, countryCode };
  } else {
    identifierValue = email.toLowerCase();
    query = { email: identifierValue };
  }

  logger.info(`[OTP Verification] Validating OTP for: ${identifierValue}`);

  // --- OTP validation placeholder ---
  const isValid = await OTPService.validateOTP(identifierValue, otp);
  if (!isValid) {
    logger.error(`[OTP Verification] Invalid OTP for: ${identifierValue}`);
    throw new BadRequestError("Invalid or expired OTP");
  }
  // --- Check for existing user ---
  logger.info(
    `[OTP Verification] Looking for user with query: ${JSON.stringify(query)}`,
  );

  let user;
  try {
    user = await User.findOne(query);
    if (user) {
      logger.info(
        `[OTP Verification] Existing user found - userId: ${user._id}`,
      );
    } else {
      logger.info(
        `[OTP Verification] No existing user found for: ${identifierValue}`,
      );
    }
  } catch (err) {
    logger.error(`[OTP Verification] Error querying user: ${err.message}`, {
      stack: err.stack,
    });
    throw err;
  }

  // --- New user flow ---
  let referralCodeDoc = null;
  if (!user) {
    logger.info(`[OTP Verification] Entering new user registration flow`);

    const userData = {
      [mobileNumber ? "mobileNumber" : "email"]: mobileNumber
        ? mobileNumber
        : identifierValue,
      ...(mobileNumber && { countryCode }),
      loginMethod: Enums.USER.LOGIN_METHOD.OTP,
      role: Enums.USER.ROLE.USER,
      password: undefined,
    };

    logger.info(
      `[OTP Verification] Prepared new user data: ${JSON.stringify(userData)}`,
    );

    if (referredByCode) {
      logger.info(
        `[OTP Verification] Referral code provided: ${referredByCode}`,
      );
      referralCodeDoc =
        await referralService.validateReferralCode(referredByCode);
      if (referralCodeDoc) {
        userData.referredByCode = referralCodeDoc.code;
        logger.info(
          `[OTP Verification] Referral code validated: ${referralCodeDoc.code}`,
        );
      } else {
        logger.info(`[OTP Verification] Referral code invalid or not found`);
      }
    }

    user = new User(userData);

    try {
      await referralService.assignReferralCodeToUser(user);
      logger.info(`[OTP Verification] Referral code assigned to user`);
    } catch (err) {
      logger.error(
        `[OTP Verification] Failed assigning referral code: ${err.message}`,
        {
          stack: err.stack,
        },
      );
    }

    if (referralCodeDoc) {
      try {
        await referralService.handleReferralOnSignup(user, referralCodeDoc);
        logger.info(`[OTP Verification] Referral signup handled`);
      } catch (err) {
        logger.error(
          `[OTP Verification] Failed referral signup handling: ${err.message}`,
          {
            stack: err.stack,
          },
        );
      }
    }

    isNew = true;
  }

  if (user.isBlock) {
    logger.warn(`[OTP Verification] User is blocked - userId: ${user._id}`);
    throw new UnauthorizedError("User is Blocked");
  }

  user.lastLogin = new Date();
  await user.save();

  if (isNew) {
    await createWallet(user._id);
  }

  logger.info(`[OTP Verification] Updating last login for userId: ${user._id}`);
  await handleDeviceLogin(
    user,
    deviceId,
    longitude,
    latitude,
    os,
    modelNumber,
    fcmToken,
  );
  logger.info(`[OTP Verification] Device login handled`);

  const { accessToken, refreshToken } = generateAuthTokens(user, deviceId);

  logger.info(
    `[OTP Verification] Process completed successfully - userId: ${user._id}, isNew: ${isNew}`,
  );

  return {
    success: true,
    message: "OTP verified successfully",
    accessToken,
    refreshToken,
    role: user.role,
    isNew,
  };
};

const loginByPassword = async ({
  identifier,
  password,
  deviceId,
  longitude,
  latitude,
  requestOrigin,
  os,
  modelNumber,
  fcmToken,
}) => {
  logger.info(
    `[LOGIN] Attempting login for identifier: ${identifier}, device: ${deviceId}, FCM: ${fcmToken}, origin: ${requestOrigin}`,
  );
  if (!identifier || !password) {
    logger.warn(`[LOGIN] Missing identifier or password`);
    throw new BadRequestError(
      "Identifier (email or mobile) and password are required.",
    );
  }

  const isEmail = identifier.includes("@");
  const query = isEmail ? { email: identifier } : { mobileNumber: identifier };
  const user = await User.findOne(query).select("+password");

  if (!user) {
    logger.warn(`[LOGIN] User not found for identifier: ${identifier}`);
    throw new NotFoundError("User not found with provided credentials");
  }
  if (!user.isOnboarded && user.role === Enums.USER.ROLE.ASTROLOGER) {
    logger.info(
      `[LOGIN] User ${user._id} has not completed onboarding, issuing onboarding token`,
    );

    const { accessToken } = generateAuthTokens(user, { purpose: "onboarding" });

    return {
      message: "Your account setup is not complete. Please finish onboarding",
      onboardingToken: accessToken,
      role: user.role,
      isOnboarded: user.isOnboarded,
    };
  }
  if (user.verificationStatus !== Enums.USER.VERIFICATION_STATUS.APPROVED) {
    logger.warn(
      `[LOGIN] User ${user._id} not verified, status: ${user.verificationStatus}`,
    );
    throw new ForbiddenError(
      "Your account is not approved. Please complete verification before login",
    );
  }
  const adminOrigins = [
    "https://admin.astrovedvaani.com",
    "http://localhost:3000",
    "http://localhost:3001",
  ];

  if (
    adminOrigins.includes(requestOrigin) &&
    ![
      Enums.USER.ROLE.ADMIN,
      Enums.USER.ROLE.SUPER_ADMIN,
      Enums.USER.ROLE.VENDOR,
    ].includes(user.role)
  ) {
    logger.warn(
      `[LOGIN] Unauthorized origin access attempt by user ${user._id} from ${requestOrigin}`,
    );
    throw new UnauthorizedError(
      "This origin is reserved for admin, superadmin, or vendor logins only",
    );
  }

  const requireDeviceInfo =
    user.role !== Enums.USER.ROLE.ADMIN &&
    user.role !== Enums.USER.ROLE.SUPER_ADMIN &&
    user.role !== Enums.USER.ROLE.VENDOR;
  if (
    requireDeviceInfo &&
    (!deviceId || longitude === undefined || latitude === undefined)
  ) {
    logger.warn(`[LOGIN] Missing device info for user ${user._id}`);
    throw new BadRequestError(
      "Device ID, longitude and latitude are required for this user type",
    );
  }
  if (requireDeviceInfo && !fcmToken) {
    logger.warn(`[LOGIN] Missing FCM token for role 101 user ${user._id}`);
    throw new BadRequestError("FCM token is required for this user role");
  }

  // Password check (if needed)
  const isMatch = await bcrypt.compare(password, user.password);
  if (!isMatch) {
    logger.warn(`[LOGIN] Incorrect password for user ${user._id}`);
    throw new Error("Invalid credentials");
  }

  user.lastLogin = new Date();
  await user.save();
  logger.info(`[LOGIN] Updated last login for user ${user._id}`);

  if (requireDeviceInfo) {
    logger.info(
      `[LOGIN] Handling device login for user ${user._id} on device ${deviceId}`,
    );
    await handleDeviceLogin(
      user,
      deviceId,
      longitude,
      latitude,
      os,
      modelNumber,
      fcmToken,
    );
  }
  const { accessToken, refreshToken } = generateAuthTokens(user, deviceId);
  logger.info(
    `[LOGIN] Login successful for user ${user._id}, role: ${user.role}`,
  );

  return {
    message: "Login successful",
    accessToken,
    refreshToken,
    role: user.role,
  };
};

const updatePassword = async (userId, currentPassword, newPassword) => {
  const user = await User.findById(userId).select("+password");
  if (!user) throw new Error("User not found");

  const isMatch = await bcrypt.compare(currentPassword, user.password);
  if (!isMatch) throw new Error("Current password is incorrect");

  const salt = await bcrypt.genSalt(10);
  user.password = await bcrypt.hash(newPassword, salt);
  await user.save();
  return { message: "Password updated successfully" };
};

const setNewPassword = async (userId, newPassword) => {
  const user = await User.findById(userId);
  if (!user) throw new Error("User not found");

  const salt = await bcrypt.genSalt(10);
  user.password = await bcrypt.hash(newPassword, salt);
  await user.save();
  return { message: "Password reset successfully" };
};

const signUp = async ({ email, password, name, role, mobileNumber }) => {
  try {
    if (!email || !name || !mobileNumber) {
      throw new BadRequestError("Email, name, and mobile number are required");
    }

    let isExistiingAndNotOnboardedUser = false;

    let existingUser = await User.findOne({ email });
    if (existingUser) {
      if (existingUser.isOnboarded) {
        throw new ConflictError("User already exists with this email");
      }
      isExistiingAndNotOnboardedUser = true;
    }

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password || "password", salt);

    const validRoles = [Enums.USER.ROLE.ASTROLOGER, Enums.USER.ROLE.VENDOR];
    const userRole = validRoles.includes(role)
      ? role
      : Enums.USER.ROLE.ASTROLOGER;

    if (!isExistiingAndNotOnboardedUser) {
      existingUser = new User({
        mobileNumber,
        name,
        email,
        password: hashedPassword,
        loginMethod: Enums.USER.LOGIN_METHOD.PASSWORD,
        role: userRole,
        isActive: true,
        verificationStatus: Enums.USER.VERIFICATION_STATUS.PENDING,
        isOnboarded: false,
      });

      await existingUser.save();
      await createWallet(existingUser._id);
    }

    const { accessToken, refreshToken } = generateAuthTokens(existingUser);

    return {
      message: isExistiingAndNotOnboardedUser
        ? `${userRole} account onboarding is not completed`
        : `${userRole} account created successfully`,
      user: {
        id: existingUser._id,
        name: existingUser.name,
        email: existingUser.email,
        role: existingUser.role,
        mobileNumber: existingUser.mobileNumber,
        isOnboarded: existingUser.isOnboarded,
      },
      accessToken,
      refreshToken,
    };
  } catch (error) {
    logger.error("[signUp] Error processing signup", error);
    if (error instanceof ApiError) throw error;
    throw new ApiError("Failed to create account", 500);
  }
};

const refreshAccessToken = async (refreshToken) => {
  try {
    const decoded = await jwtService.verifyRefreshToken(refreshToken);
    logger.info(`decode ${decoded}`);
    const user = await User.findById(decoded._id);
    if (!user) {
      logger.warn("[AuthService] User not found for refresh token");
      throw new NotFoundError("User not found");
    }
    const { accessToken } = generateAuthTokens(user, true);
    logger.info("[AuthService] Access token refreshed for userId:", user._id);
    return { accessToken };
  } catch (error) {
    logger.error("[AuthService] Failed to refresh token", error);
    throw new Error("Invalid or expired refresh token");
  }
};

const getGoogleOAuthConfig = async () => {
  logger.info("Fetching Google OAuth config from DB");
  const integration = await ThirdPartyIntegration.findOne({
    provider: Enums.INTEGRATION.PROVIDER.GOOGLE,
    type: Enums.INTEGRATION.TYPE.OAUTH,
    is_active: true,
  });
  if (!integration) {
    logger.error("Google OAuth integration not found");
    throw new ApiError(500, "Google OAuth integration not found");
  }
  integration.redirect_uri = integration.base_url;
  logger.info(
    `Google OAuth config found: clientId=${integration.api_key}, redirectUri=${integration.redirect_uri}`,
  );

  return integration;
};

const handleGoogleCallback = async (code) => {
  if (!code) {
    throw new BadRequestError("Authorization code is required");
  }

  logger.info(`Handling Google callback with authorization code: ${code}`);
  const integration = await getGoogleOAuthConfig();

  let tokenResponse;
  try {
    tokenResponse = await axios.post(
      "https://oauth2.googleapis.com/token",
      querystring.stringify({
        code,
        client_id: integration.api_key,
        client_secret: integration.api_secret,
        redirect_uri: integration.redirect_uri,
        grant_type: "authorization_code",
      }),
      {
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
      },
    );
  } catch (err) {
    logger.error(
      `Failed to exchange code with Google: ${
        err.response?.data || err.message
      }`,
    );
    throw new UnauthorizedError(
      "Failed to exchange authorization code with Google",
    );
  }

  const { id_token } = tokenResponse.data;
  if (!id_token) {
    logger.error("ID token missing in Google response");
    throw new UnauthorizedError("Failed to retrieve ID token from Google");
  }

  logger.info("Successfully retrieved ID token from Google");
  return loginByGoogle({ idToken: id_token });
};

const loginByGoogle = async ({ idToken }) => {
  if (!idToken) {
    throw new Error("Google ID token is required");
  }

  logger.info("Verifying Google ID token");
  const integration = await getGoogleOAuthConfig();

  let payload;
  try {
    const client = new OAuth2Client(integration.api_key);
    const ticket = await client.verifyIdToken({
      idToken,
      audience: integration.api_key,
    });
    payload = ticket.getPayload();
  } catch (err) {
    logger.error(`Google ID token verification failed: ${err.message}`);
    throw new Error("Invalid Google ID token");
  }

  if (!payload) {
    logger.error("Google token payload is empty");
    throw new Error("Invalid Google token payload");
  }

  const { email, name, picture, email_verified } = payload;
  if (!email || !email_verified) {
    throw new Error("A valid and verified Google email is required");
  }

  let user = await User.findOne({ email });
  let isNew = false;

  if (!user) {
    user = await User.create({
      name,
      email,
      profilePicture: picture,
      loginMethod: Enums.USER.LOGIN_METHOD.GOOGLE,
      role: Enums.USER.ROLE.USER,
      isActive: true,
      isEmailVerified: true,
    });
    isNew = true;
  }
  if (user.role !== Enums.USER.ROLE.USER) {
    throw new Error("Google login is allowed only for User role accounts");
  }
  user.currentSessionId = crypto.randomBytes(16).toString("hex");
  user.lastLogin = new Date();
  await user.save();

  try {
    const walletExists = await checkWalletExists(user._id);
    if (!walletExists) {
      await createWallet(user._id);
    }
  } catch (err) {
    logger.error(
      `Error checking/creating wallet for user ${user._id}: ${err.message}`,
    );
  }
  const userAstrology = await UserAstrology.findOne(
    { userId: user._id, relationshipToOwner: "self" },
    "birthDate birthTime birthPlace",
  ).lean();
  const isOnboard =
    !userAstrology ||
    !userAstrology.birthDate ||
    !userAstrology.birthTime ||
    !userAstrology.birthPlace;
  const { accessToken, refreshToken } = generateAuthTokens(user);
  return {
    message: "Google login successful",
    accessToken,
    refreshToken,
    role: user.role,
    isNew,
    isOnboard,
    user: {
      id: user._id,
      name: user.name,
      email: user.email,
      profilePicture: user.profilePicture,
      astrology: {
        birthDate: userAstrology?.birthDate || null,
        birthTime: userAstrology?.birthTime || null,
        birthPlace: userAstrology?.birthPlace || null,
      },
    },
  };
};

const checkWalletExists = async (userId) => {
  try {
    const wallet = await Wallet.findOne({ userId });
    return !!wallet;
  } catch (err) {
    logger.error(`Error checking wallet for user ${userId}: ${err.message}`);
    throw new Error("Failed to check wallet existence");
  }
};
async function handleDeviceLogin(
  user,
  deviceId,
  longitude,
  latitude,
  os = "web",
  modelNumber = null,
  fcmToken = null,
) {
  logger.info(
    `[DEVICE LOGIN] User ${user._id} logging in from device ${deviceId}`,
  );
  const setting = await Setting.findOne({});
  const maxThreshold = setting?.maxDeviceThreshold || 3;
  if (!Array.isArray(user.devices)) user.devices = [];
  const isAstrologer = user.role === Enums.USER.ROLE.ASTROLOGER;
  const existingDeviceIndex = user.devices.findIndex(
    (d) => d.deviceId === deviceId,
  );
  logger.info(
    `[DEVICE LOGIN] Existing devices: ${user.devices
      .map((d) => d.deviceId)
      .join(", ")}`,
  );
  if (
    isAstrologer &&
    existingDeviceIndex === -1 &&
    user.devices.length >= maxThreshold
  ) {
    logger.warn(
      `[DEVICE LOGIN] Astrologer ${user._id} exceeded max device limit`,
    );
    const deviceList = user.devices.map((d) => ({
      deviceId: d.deviceId,
      loginAt: d.loginAt,
      longitude: d.longitude,
      latitude: d.latitude,
      os: d.os,
      modelNumber: d.modelNumber,
    }));
    const error = new UnauthorizedError(
      "Max device limit reached. Cannot login from a new device.",
    );
    error.deviceList = deviceList;
    throw error;
  }
  if (existingDeviceIndex !== -1) {
    user.devices[existingDeviceIndex] = {
      ...user.devices[existingDeviceIndex]._doc,
      longitude,
      latitude,
      loginAt: new Date(),
      os,
      modelNumber,
    };
    logger.info(`[DEVICE LOGIN] Updated device ${deviceId}`);
  } else {
    user.devices.push({
      deviceId,
      longitude,
      latitude,
      loginAt: new Date(),
      os,
      modelNumber,
    });
    logger.info(`[DEVICE LOGIN] Added new device ${deviceId}`);
  }
  if (fcmToken) {
    user.fcmToken = fcmToken;
    logger.info(`[DEVICE LOGIN] Updated FCM token for user ${user._id}`);
  }
  user.currentSessionId = crypto.randomBytes(16).toString("hex");
  logger.info(`[DEVICE LOGIN] Generated new session ID for user ${user._id}`);
  await user.save();
  logger.info(
    `[DEVICE LOGIN] User ${user._id} devices + FCM saved successfully`,
  );
}

const deleteOwnAccount = async (userId) => {
  const user = await User.findById(userId);
  if (!user || user.isDeleted) {
    throw new NotFoundError("Account not found or already deleted");
  }
  const timestamp = Date.now();
  user.email = user.email
    ? `${user.email}__deleted_${timestamp}`
    : `deleted_${timestamp}@deleted.com`;
  user.mobileNumber = user.mobileNumber
    ? `${user.mobileNumber}__deleted_${timestamp}`
    : `deleted_${timestamp}`;
  if (user.myReferralCode) {
    user.myReferralCode = `${user.myReferralCode}__deleted_${timestamp}`;
  }
  user.isDeleted = true;
  user.deletedAt = new Date();
  await user.save();
  await CacheService.clearUserRelatedCaches?.(userId);
  await CacheService.clearMatchingKeys(ASTROLOGER_CACHE_PREFIX);
  return { message: "Your account has been deleted successfully" };
};
const loginByGoogleMobile = async ({ idToken }) => {
  if (!idToken) throw new Error("Google ID token is required");

  logger.info(`[GOOGLE_MOBILE_LOGIN] Starting login for Mobile (Android)`);

  // Step 1: Fetch integration config
  const integration = await ThirdPartyIntegration.findOne({
    provider: Enums.INTEGRATION.PROVIDER.GOOGLE,
    type: 4008, // Android OAuth type
    is_active: true,
  });

  if (!integration) {
    logger.error(
      `[GOOGLE_MOBILE_LOGIN] No active Google integration found for Android`,
    );
    throw new Error("Google Android OAuth integration not found");
  }

  const clientId = integration.api_key;
  logger.debug(`[GOOGLE_MOBILE_LOGIN] Using Google Client ID: ${clientId}`);

  // Step 2: Verify ID Token
  let payload;
  try {
    const client = new OAuth2Client(clientId);
    const ticket = await client.verifyIdToken({ idToken, audience: clientId });
    payload = ticket.getPayload();
    logger.debug(`[GOOGLE_MOBILE_LOGIN] Token verified successfully.`);
  } catch (err) {
    logger.error(
      `[GOOGLE_MOBILE_LOGIN] Token verification failed: ${err.message}`,
    );
    throw new Error("Invalid Google ID token");
  }

  if (!payload) {
    logger.error(
      `[GOOGLE_MOBILE_LOGIN] Empty payload received after token verification`,
    );
    throw new Error("Google token payload is empty");
  }

  const { email, name, picture, email_verified } = payload;
  logger.debug(
    `[GOOGLE_MOBILE_LOGIN] Extracted payload - email=${email}, verified=${email_verified}`,
  );

  if (!email || !email_verified) {
    logger.error(`[GOOGLE_MOBILE_LOGIN] Email missing or not verified`);
    throw new Error("A valid and verified Google email is required");
  }

  // Step 3: Find or create user
  logger.info(
    `[GOOGLE_MOBILE_LOGIN] Checking existing user for email: ${email}`,
  );
  let user = await User.findOne({ email });
  let isNew = false;

  if (user) {
    logger.info(`[GOOGLE_MOBILE_LOGIN] Existing user found: ${user._id}`);
  } else {
    logger.info(`[GOOGLE_MOBILE_LOGIN] No user found. Creating new user...`);
    try {
      user = await User.create({
        name,
        email,
        profilePicture: picture,
        loginMethod: Enums.USER.LOGIN_METHOD.GOOGLE,
        role: Enums.USER.ROLE.USER,
        isActive: true,
        isEmailVerified: true,
        mobileNumber: undefined,
      });
      isNew = true;
      logger.info(
        `[GOOGLE_MOBILE_LOGIN]  New user created successfully: ${user._id}`,
      );
    } catch (createErr) {
      logger.error(
        `[GOOGLE_MOBILE_LOGIN]  Failed to create user: ${createErr.message}`,
      );
      logger.error(`[GOOGLE_MOBILE_LOGIN] Stack: ${createErr.stack}`);
      throw new Error("Error creating user in database");
    }
  }

  if (user.role !== Enums.USER.ROLE.USER) {
    logger.warn(
      `[GOOGLE_MOBILE_LOGIN] Role mismatch for user ${user._id}: ${user.role}`,
    );
    throw new Error("Google login is allowed only for User role accounts");
  }

  // Step 4: Session update
  try {
    user.currentSessionId = crypto.randomBytes(16).toString("hex");
    user.lastLogin = new Date();
    await user.save();
    logger.info(
      `[GOOGLE_MOBILE_LOGIN] User session updated successfully (${user._id})`,
    );
  } catch (saveErr) {
    logger.error(
      `[GOOGLE_MOBILE_LOGIN] Failed to save user session: ${saveErr.message}`,
    );
    logger.error(`[GOOGLE_MOBILE_LOGIN] Stack: ${saveErr.stack}`);
    throw new Error("Error updating user session");
  }

  // Step 5: Wallet check
  try {
    const walletExists = await checkWalletExists(user._id);
    if (!walletExists) {
      logger.info(
        `[GOOGLE_MOBILE_LOGIN] Wallet not found, creating new wallet...`,
      );
      await createWallet(user._id);
      logger.info(`[GOOGLE_MOBILE_LOGIN] Wallet created successfully`);
    } else {
      logger.debug(`[GOOGLE_MOBILE_LOGIN] Wallet already exists`);
    }
  } catch (err) {
    logger.error(
      `[GOOGLE_MOBILE_LOGIN] Wallet operation failed: ${err.message}`,
    );
  }

  // Step 6: Astrology check
  let userAstrology = null;
  try {
    userAstrology = await UserAstrology.findOne(
      { userId: user._id, relationshipToOwner: "self" },
      "birthDate birthTime birthPlace",
    ).lean();
    logger.debug(
      `[GOOGLE_MOBILE_LOGIN] Astrology check: ${
        userAstrology ? "found" : "none"
      }`,
    );
  } catch (astroErr) {
    logger.error(
      `[GOOGLE_MOBILE_LOGIN] Astrology lookup failed: ${astroErr.message}`,
    );
  }

  const isOnboard =
    !userAstrology ||
    !userAstrology.birthDate ||
    !userAstrology.birthTime ||
    !userAstrology.birthPlace;

  // Step 7: Token generation
  let accessToken, refreshToken;
  try {
    logger.info(`[GOOGLE_MOBILE_LOGIN] Generating tokens for user ${user._id}`);
    ({ accessToken, refreshToken } = generateAuthTokens(user));
  } catch (tokenErr) {
    logger.error(
      `[GOOGLE_MOBILE_LOGIN] Token generation failed: ${tokenErr.message}`,
    );
    throw new Error("Token generation failed");
  }

  logger.info(
    `[GOOGLE_MOBILE_LOGIN] Google Mobile login successful for ${email}`,
  );

  return {
    message: "Google Mobile login successful",
    accessToken,
    refreshToken,
    role: user.role,
    isNew,
    isOnboard,
    user: {
      id: user._id,
      name: user.name,
      email: user.email,
      profilePicture: user.profilePicture,
      astrology: {
        birthDate: userAstrology?.birthDate || null,
        birthTime: userAstrology?.birthTime || null,
        birthPlace: userAstrology?.birthPlace || null,
      },
    },
  };
};

module.exports = {
  loginByOTP,
  loginByPassword,
  verifyOtp,
  updatePassword,
  setNewPassword,
  signUp,
  refreshAccessToken,
  loginByGoogle,
  handleGoogleCallback,
  getGoogleOAuthConfig,
  deleteOwnAccount,
  loginByGoogleMobile,
};
