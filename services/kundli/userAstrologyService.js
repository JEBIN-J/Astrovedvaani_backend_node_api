const { default: axios } = require("axios");
const { NotFoundError } = require("../../errors");
const UserAstrology = require("../../models/UserAstrology");
const { default: API } = require("./api");
const logger = require("../../utils/logger");

const createKundli = async (userId, data) => {
  return await UserAstrology.create({
    userId: userId || null,
    ...data,
  });
};

const getMyKundlis = async (userId, isKundli, page = 1, limit = 10) => {
  const pageNum = Math.max(parseInt(page, 10) || 1, 1);
  const limitNum = Math.max(parseInt(limit, 10) || 10, 1);
  const selfProfile = await UserAstrology.findOne({
    userId,
    relationshipToOwner: "self",
  }).select("_id name gender rasi birthDate birthTime birthPlace zodiacSign");
  const filter = { userId };
  if (typeof isKundli === "boolean") {
    filter.isKundli = isKundli;
    if (isKundli === true) {
      filter.isPalmistry = false;
    }
  }
  if (selfProfile?._id) {
    filter._id = { $ne: selfProfile._id };
  }
  const totalDocs = await UserAstrology.countDocuments(filter);
  const relatives = await UserAstrology.find(filter)
    .select("_id name gender rasi birthDate birthTime birthPlace zodiacSign")
    .sort({ createdAt: -1 })
    .skip((pageNum - 1) * limitNum)
    .limit(limitNum);
  const totalPages = Math.ceil(totalDocs / limitNum);

  return {
    selfProfile,
    relatives,
    totalDocs,
    totalPages,
    page: pageNum,
    limit: limitNum,
  };
};
const getMyMatchMaking = async (
  userId,
  isMatchMaking,
  page = 1,
  limit = 10,
) => {
  const pageNum = Math.max(parseInt(page, 10) || 1, 1);
  const limitNum = Math.max(parseInt(limit, 10) || 10, 1);
  const selfProfile = await UserAstrology.findOne({
    userId,
    relationshipToOwner: "self",
  }).select("_id name gender rasi birthDate birthTime birthPlace zodiacSign");
  const filter = { userId };
  if (typeof isMatchMaking === "boolean") {
    filter.isKundli = !isMatchMaking;

    if (isMatchMaking === true) {
      filter.isPalmistry = false;
    }
  }

  console.log("Final filter:", filter);

  if (selfProfile?._id) {
    filter._id = { $ne: selfProfile._id };
  }
  const totalDocs = await UserAstrology.countDocuments(filter);
  const relatives = await UserAstrology.find(filter)
    .select("_id name gender rasi birthDate birthTime birthPlace zodiacSign")
    .sort({ createdAt: -1 })
    .skip((pageNum - 1) * limitNum)
    .limit(limitNum);
  const totalPages = Math.ceil(totalDocs / limitNum);

  return {
    selfProfile,
    relatives,
    totalDocs,
    totalPages,
    page: pageNum,
    limit: limitNum,
  };
};
const getMyPalmistry = async (userId, isPalmistry, page = 1, limit = 10) => {
  const pageNum = Math.max(parseInt(page, 10) || 1, 1);
  const limitNum = Math.max(parseInt(limit, 10) || 10, 1);
  const selfProfile = await UserAstrology.findOne({
    userId,
    relationshipToOwner: "self",
  }).select("_id name gender rasi birthDate birthTime birthPlace zodiacSign");
  const filter = { userId };
  if (typeof isPalmistry === "boolean") {
    filter.isPalmistry = isPalmistry;
    if (isPalmistry === true) {
      filter.isKundli = false;
    }
  }
  if (selfProfile?._id) {
    filter._id = { $ne: selfProfile._id };
  }
  const totalDocs = await UserAstrology.countDocuments(filter);
  const relatives = await UserAstrology.find(filter)
    .select("_id name gender rasi birthDate birthTime birthPlace zodiacSign")
    .sort({ createdAt: -1 })
    .skip((pageNum - 1) * limitNum)
    .limit(limitNum);
  const totalPages = Math.ceil(totalDocs / limitNum);

  return {
    selfProfile,
    relatives,
    totalDocs,
    totalPages,
    page: pageNum,
    limit: limitNum,
  };
};

const getKundliById = async (userId, kundliId) => {
  const kundli = await UserAstrology.findOne({ _id: kundliId, userId });
  if (!kundli) throw new NotFoundError("Kundli not found");
  return kundli;
};

const updateKundli = async (userId, kundliId, data) => {
  const kundli = await UserAstrology.findOneAndUpdate(
    { _id: kundliId, userId },
    { $set: data },
    { new: true },
  );
  if (!kundli) throw new NotFoundError("Kundli not found");
  return kundli;
};

const deleteKundli = async (userId, kundliId) => {
  const kundli = await UserAstrology.findOneAndDelete({
    _id: kundliId,
    userId,
  });
  if (!kundli) throw new NotFoundError("Kundli not found");
  return kundli;
};

const getCitySuggestion = async (key) => {
  try {
    logger.info(`Fetching city suggestions for key="${key}"`);
    const suggestionRes = await axios.get(API.LOCATION_SUGGESTIONS(key));
    const suggestionData = suggestionRes.data;
    if (!suggestionData.success) {
      logger.warn(`No suggestions found for key="${key}"`);
      return { success: false, data: [] };
    }

    const suggestions = suggestionData.data || [];
    logger.info(`Found ${suggestions.length} suggestions for key="${key}"`);
    const detailedSuggestions = await Promise.all(
      suggestions.map(async (s) => {
        try {
          logger.info(`Fetching location details for address="${s.address}"`);
          const locRes = await axios.get(API.LOCATION_BY_NAME(s.address));
          const locData = locRes.data;
          logger.info(
            `Got location: lat=${locData.data?.lat}, lon=${locData.data?.lon} for "${s.address}"`,
          );
          return {
            address: locData.data?.address || s.address,
            latitude: locData.data?.lat || null,
            longitude: locData.data?.lon || null,
          };
        } catch (err) {
          logger.error(
            `Failed to fetch location for "${s.address}": ${err.message}`,
          );
          return { address: s.address, latitude: null, longitude: null };
        }
      }),
    );
    logger.info(
      `Successfully built ${detailedSuggestions.length} detailed suggestions`,
    );
    return { success: true, data: detailedSuggestions };
  } catch (err) {
    logger.error(`getCitySuggestion error: ${err.message}`);
    return { success: false, data: [] };
  }
};

const updateUserAstrologyWithKundli = async (userId, kundliData, isQuery) => {
  logger.info(`updateUserAstrologyWithKundli called for userId=${userId}`);
  if (!kundliData || !kundliData.data) {
    logger.warn("No data provided to update user astrology");
    return null;
  }
  let profile;
  if (!isQuery) {
    profile = await UserAstrology.findOne({
      userId,
      relationshipToOwner: "self",
    });
  } else {
    profile = await UserAstrology.findById(userId);
  }
  if (!profile) {
    logger.error("Astrology profile not found for user");
    throw new Error("Astrology profile not found for user");
  }

  const { basicDetails, panchangDetails, avakhadaDetails } = kundliData.data;

  const updateFields = {};

  // Map response keys to model fields
  if (basicDetails) {
    if (basicDetails.sunSign) updateFields.sunSign = basicDetails.sunSign;
    if (basicDetails.ascendantSign)
      updateFields.ascendant = basicDetails.ascendantSign;
    if (basicDetails.rasi) updateFields.rasi = basicDetails.rasi;
    if (basicDetails.rasi_lord) updateFields.rasiLord = basicDetails.rasi_lord;
  }

  if (panchangDetails) {
    if (panchangDetails.nakshatra)
      updateFields.nakshatra = panchangDetails.nakshatra;
    if (panchangDetails.nakshatra_lord)
      updateFields.nakshatraLord = panchangDetails.nakshatra_lord;
    if (panchangDetails.nakshatra_pada)
      updateFields.nakshatraPada = panchangDetails.nakshatra_pada;
  }

  if (avakhadaDetails) {
    if (avakhadaDetails.nadi) updateFields.nadi = avakhadaDetails.nadi;
    if (avakhadaDetails.varna) updateFields.varna = avakhadaDetails.varna;
    if (avakhadaDetails.paya) updateFields.paya = avakhadaDetails.paya;
    if (avakhadaDetails.tatva) updateFields.tatva = avakhadaDetails.tatva;
    if (avakhadaDetails.life_stone)
      updateFields.lifeStone = avakhadaDetails.life_stone;
    if (avakhadaDetails.lucky_stone)
      updateFields.luckyStone = avakhadaDetails.lucky_stone;
    if (avakhadaDetails.fortune_stone)
      updateFields.fortuneStone = avakhadaDetails.fortune_stone;
    if (avakhadaDetails.name_start)
      updateFields.nameStart = avakhadaDetails.name_start;
    if (avakhadaDetails.sun_sign)
      updateFields.sunSign = avakhadaDetails.sun_sign;
  }

  if (Object.keys(updateFields).length === 0) {
    logger.info("No matching fields found to update for user astrology");
    return profile;
  }

  // Update profile
  Object.assign(profile, updateFields);
  await profile.save();
  logger.info(
    `User astrology updated successfully for userId=${userId}`,
    updateFields,
  );

  return profile;
};
module.exports = {
  createKundli,
  getMyKundlis,
  getKundliById,
  updateKundli,
  deleteKundli,
  getCitySuggestion,
  updateUserAstrologyWithKundli,
  getMyMatchMaking,
  getMyPalmistry,
};
