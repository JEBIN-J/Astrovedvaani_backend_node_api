const FollowRequest = require("../../models/FollowRequest");
const User = require("../../models/User");
const UserAstrology = require("../../models/UserAstrology");
const Enums = require("../../utils/constants");
const logger = require("../../utils/logger");
const CacheService = require("../../utils/redis/cacheService");
const {
  getKundliData,
  getDasha,
  getKundliDetailsData,
  getKPDetails,
  getAscendantReport,
  getFullNumerology,
} = require("../kundli/kundliService");

// const completeProfile = async (userId, profileData) => {
//   logger.info(`Starting profile completion for userId: ${userId}`);
//   logger.debug(`Raw profileData received: ${JSON.stringify(profileData)}`);
//   const allowedFields = [
//     "name",
//     "email",
//     "birthDate",
//     "birthTime",
//     "birthPlace",
//     "profilePicture",
//     "gender",
//     "relationship_status",
//     "latitude",
//     "longitude",
//     "mobileNumber",
//     "countryCode",
//   ];
//   const updatePayload = {};
//   for (const field of allowedFields) {
//     if (Object.prototype.hasOwnProperty.call(profileData, field)) {
//       updatePayload[field] = profileData[field];
//     }
//   }
//   if (Object.keys(updatePayload).length === 0) {
//     logger.warn(
//       `No valid profile fields provided for update by userId: ${userId}`,
//     );
//     throw new Error("No valid fields provided for profile update.");
//   }
//   logger.info(`Filtered update payload: ${JSON.stringify(updatePayload)}`);
//   const updatedUser = await User.findOneAndUpdate(
//     { _id: userId, role: { $ne: Enums.USER.ROLE.AI_ASTROLOGER } },
//     { $set: updatePayload },
//     { new: true },
//   ).lean();
//   updatePayload.relationshipToOwner = "self";

//   const updatedUserAstrology = await UserAstrology.findOneAndUpdate(
//     { userId: userId, relationshipToOwner: "self" },
//     { $set: updatePayload },
//     { new: true, upsert: true },
//   ).lean();
//   logger.info(`Profile successfully updated for userId: ${userId}`);
//   try {
//     const kundliBasicKey = CacheService.generateKey(
//       CacheService.CACHE_PREFIXES.USER_DETAILS,
//       "kundli-basic",
//       userId,
//     );
//     const kundliDetailsKey = CacheService.generateKey(
//       CacheService.CACHE_PREFIXES.USER_DETAILS,
//       "kundli-details",
//       userId,
//     );
//     await CacheService.del(kundliBasicKey);
//     await CacheService.del(kundliDetailsKey);
//     logger.info(`Cleared cached Kundli data for userId=${userId}`);
//   } catch (err) {
//     logger.error(
//       `Error clearing cached Kundli data for userId=${userId}:`,
//       err,
//     );
//   }
//    setImmediate(() => {
//     try {
//       performPostProfileTasks(userId);
//     } catch (err) {
//       logger.error(`Error in background task for userId=${userId}:`, err);
//     }
//   });
//   return updatedUser;
// };
const completeProfile = async (userId, profileData) => {
  logger.info(`Starting profile completion for userId: ${userId}`);
  logger.debug(`Raw profileData received: ${JSON.stringify(profileData)}`);

  const allowedFields = [
    "name",
    "email",
    "birthDate",
    "birthTime",
    "birthPlace",
    "profilePicture",
    "gender",
    "relationship_status",
    "latitude",
    "longitude",
    "mobileNumber",
    "countryCode",
  ];

  const updatePayload = {};

  for (const field of allowedFields) {
    if (
      Object.prototype.hasOwnProperty.call(profileData, field) &&
      profileData[field] !== "" &&
      profileData[field] !== null &&
      profileData[field] !== undefined
    ) {
      updatePayload[field] = profileData[field];
    }
  }

  if (Object.keys(updatePayload).length === 0) {
    logger.warn(
      `No valid profile fields provided for update by userId: ${userId}`,
    );
    throw new Error("No valid fields provided for profile update.");
  }

  logger.info(`Filtered update payload: ${JSON.stringify(updatePayload)}`);
  const updatedUser = await User.findOneAndUpdate(
    { _id: userId, role: { $ne: Enums.USER.ROLE.AI_ASTROLOGER } },
    {
      $set: {
        ...updatePayload,
        isOnboarded: true,
      },
    },
    { new: true },
  ).lean();
  console.log("updated_user", updatedUser);
  // Always set this for astrology collection
  updatePayload.relationshipToOwner = "self";
  const updatedUserAstrology = await UserAstrology.findOneAndUpdate(
    { userId: userId, relationshipToOwner: "self" },
    { $set: updatePayload },
    { new: true, upsert: true },
  ).lean();

  logger.info(`Profile successfully updated for userId: ${userId}`);

  // Clear cached Kundli data
  try {
    const kundliBasicKey = CacheService.generateKey(
      CacheService.CACHE_PREFIXES.USER_DETAILS,
      "kundli-basic",
      userId,
    );
    const kundliDetailsKey = CacheService.generateKey(
      CacheService.CACHE_PREFIXES.USER_DETAILS,
      "kundli-details",
      userId,
    );
    await CacheService.del(kundliBasicKey);
    await CacheService.del(kundliDetailsKey);
    logger.info(`Cleared cached Kundli data for userId=${userId}`);
  } catch (err) {
    logger.error(
      `Error clearing cached Kundli data for userId=${userId}:`,
      err,
    );
  }

  // Run background tasks
  setImmediate(() => {
    try {
      performPostProfileTasks(userId);
    } catch (err) {
      logger.error(`Error in background task for userId=${userId}:`, err);
    }
  });

  return updatedUser;
};

const formatDateDDMMYYYY = (date) => {
  if (!date) return null;
  const d = new Date(date);
  if (isNaN(d.getTime())) return null;
  const day = String(d.getDate()).padStart(2, "0");
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const year = d.getFullYear();
  return `${day}/${month}/${year}`;
};
const getMyProfile = async (userId) => {
  logger.info(`Fetching profile for userId: ${userId}`);

  const user = await User.findById(userId).lean();
  if (!user) {
    logger.warn(`No user found with userId: ${userId}`);
    return null;
  }

  const followersCount = await FollowRequest.countDocuments({
    astrologer_id: userId,
  });
  const followingCount = await FollowRequest.countDocuments({
    user_id: userId,
  });

  const astrology = await UserAstrology.findOne({
    userId,
    relationshipToOwner: "self",
  }).lean();

  const profile = {
    _id: user._id,
    name: user.name || (astrology ? astrology.name : null),
    email: user.email || null,
    gender: user.gender || (astrology ? astrology.gender : null),
    mobileNumber: user.mobileNumber || null,
    relationship_status: user.relationship_status || null,
    birthDate: formatDateDDMMYYYY(
      user.birthDate || (astrology ? astrology.birthDate : null),
    ),
    birthTime: user.birthTime || (astrology ? astrology.birthTime : null),
    birthPlace: user.birthPlace || (astrology ? astrology.birthPlace : null),
    profilePicture: user.profilePicture || null,
    followersCount,
    followingCount,
    isNewUser: user.isNewUser || false,
    role: user.role || null,
    isActive: user.isActive || null,
    lastLogin: user.lastLogin || null,
    referredByCode: user.referredByCode || null,
    myReferralCode: user.myReferralCode || null,
    verificationStatus: user.verificationStatus || null,
    description: user.description || null,
    // Astrology details
    isKundli: astrology ? astrology.isKundli : false,
    latitude: astrology ? astrology.latitude : null,
    longitude: astrology ? astrology.longitude : null,
    timezone: astrology ? astrology.timezone : 5.5,
    sunSign: astrology ? astrology.sunSign : null,
    ascendant: astrology ? astrology.ascendant : null,
    rasi: astrology ? astrology.rasi : null,
    rasiLord: astrology ? astrology.rasiLord : null,
    nakshatra: astrology ? astrology.nakshatra : null,
    nakshatraLord: astrology ? astrology.nakshatraLord : null,
    nakshatraPada: astrology ? astrology.nakshatraPada : null,
    manglikStatus: astrology ? astrology.manglikStatus : null,
    doshas: astrology ? astrology.doshas : [],
    gotra: astrology ? astrology.gotra : null,
    nadi: astrology ? astrology.nadi : null,
    varna: astrology ? astrology.varna : null,
    paya: astrology ? astrology.paya : null,
    tatva: astrology ? astrology.tatva : null,
    lifeStone: astrology ? astrology.lifeStone : null,
    luckyStone: astrology ? astrology.luckyStone : null,
    fortuneStone: astrology ? astrology.fortuneStone : null,
    nameStart: astrology ? astrology.nameStart : null,
    preferredAstrologySystem: astrology
      ? astrology.preferredAstrologySystem
      : "vedic",
    preferredLanguage: astrology ? astrology.preferredLanguage : "en",
    relationshipToOwner: astrology ? astrology.relationshipToOwner : "self",
  };

  logger.info(`Profile fetched successfully for userId: ${userId}`);
  return profile;
};
const performPostProfileTasks = async (userId) => {
  logger.info(`Starting post-profile tasks for userId=${userId}`);
  await getKundliData(userId);
  await getKundliDetailsData(userId);
  await getKPDetails(userId);
  await getDasha(userId);
  await getAscendantReport(userId);
  await getFullNumerology(userId);
  logger.info(`Completed post-profile tasks for userId=${userId}`);
};
module.exports = {
  completeProfile,
  getMyProfile,
};
