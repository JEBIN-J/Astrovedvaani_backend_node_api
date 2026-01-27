const Astrologer = require('../../models/Astrologer');
const AstrologerServiceRates = require('../../models/AstrologerServiceRates');
const Enums = require('../../utils/constants');
const logger = require('../../utils/logger');

async function getAstrologerDetails(userId, options = {}) {
  const {
    service_type = Enums.SERVICE.TYPE.CHAT,
    is_online,
  } = options;
  const astrologer = await Astrologer.findOne({ user_id: userId });
  if (!astrologer) {
    throw new Error('Astrologer not found for given user ID');
  }
  if (typeof is_online === 'boolean' && astrologer.is_online !== is_online) {
    return null;
  }
  const serviceRate = await AstrologerServiceRates.findOne({
    astrologer_id: astrologer._id,
    service_type,
  });
  return {
    astrologer: astrologer.toObject(),
    serviceRate: serviceRate ? serviceRate.toObject() : null,
  };
}
async function updateAstrologerBusyStatus(astrologer_id) {
  try {
    logger.info(`[updateAstrologerBusyStatus] Called with ID: ${astrologer_id}`);
    const astrologer = await Astrologer.findById(astrologer_id);
    if (!astrologer) {
      logger.warn(`[updateAstrologerBusyStatus] Astrologer not found: ${astrologer_id}`);
      throw new Error('Astrologer not found');
    }
    logger.info(`[updateAstrologerBusyStatus] Current is_busy: ${astrologer.is_busy}`);
    const newBusyStatus = !astrologer.is_busy;

    const updatedAstrologer = await Astrologer.findByIdAndUpdate(
      astrologer_id,
      { is_busy: newBusyStatus },
      { new: true }
    );
    logger.info(`[updateAstrologerBusyStatus] Updated is_busy from ${astrologer.is_busy} to ${newBusyStatus} for astrologer ${astrologer_id}`);
    return updatedAstrologer.toObject();
  } catch (err) {
    logger.error(`[updateAstrologerBusyStatus] Error toggling busy status for ${astrologer_id}:`, err);
    throw err;
  }
}

async function validateAstrologerAvailability(astrologerUserId, mode = Enums.SERVICE.TYPE.CHAT) {
  const astrologer = await Astrologer.findOne({ user_id: astrologerUserId }).lean();
  if (!astrologer) throw new Error("Astrologer not found");
  if (!astrologer.is_online) throw new Error("Astrologer is offline");
  switch (mode) {
    case Enums.SERVICE.TYPE.CHAT:
      if (!astrologer.isChat) throw new Error("Chat service not enabled");
      break;
    case Enums.SERVICE.TYPE.CALL:
      if (!astrologer.isCall) throw new Error("Call service not enabled");
      break;
    case Enums.SERVICE.TYPE.VIDEO:
      if (!astrologer.isVideo) throw new Error("Video service not enabled");
      break;
    default:
      break;
  }

  return true;
}

module.exports = {
  getAstrologerDetails,
  updateAstrologerBusyStatus,
  validateAstrologerAvailability
};
