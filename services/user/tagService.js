
const ConsultationSession = require('../../models/ConsultationSession');
const User = require('../../models/User');
const Enums = require('../../utils/constants');
const logger = require('../../utils/logger');

async function handleSessionCompletion(userId) {
  try {
    const totalDuration = await getTotalSessionDuration(userId);
    await evaluateTags(userId, totalDuration);
  } catch (err) {
    logger.error("[TagService] handleSessionCompletion error:", err);
  }
}
async function getTotalSessionDuration(userId) {
  const result = await ConsultationSession.aggregate([
    {
      $match: {
        user_id: userId,
        status: Enums.SERVICE.STATUS.COMPLETED
      }
    },
    {
      $group: {
        _id: "$user_id",
        totalMinutes: { $sum: "$duration_minutes" }
      }
    }
  ]);
  const totalMinutes = result?.[0]?.totalMinutes || 0;
  logger.info(`[TagService] Total session minutes for user=${userId} → ${totalMinutes}`);
  return totalMinutes;
}
async function evaluateTags(userId, totalMinutes) {
  await evaluateLoyalCustomer(userId, totalMinutes);
}
async function evaluateLoyalCustomer(userId, totalMinutes) {
  const THRESHOLD = 2;
  if (totalMinutes < THRESHOLD) return;
  await assignSingleTagIfNeeded(
    userId,
    Enums.USER.TAGS.LOYAL_CUSTOMER
  );
}
async function assignSingleTagIfNeeded(userId, newTag) {
  try {
    const user = await User.findById(userId).select("currentTag");
    if (!user) {
      logger.warn(`[TagService] User not found: ${userId}`);
      return;
    }
    if (user.currentTag?.tag === newTag) return;
    const now = new Date();
    await User.updateOne(
      { _id: userId },
      {
        $set: {
          currentTag: {
            tag: newTag,
            assignedAt: now
          }
        },
        $push: {
          userTags: {
            tag: newTag,
            assignedAt: now,
            source: Enums.USER.TAG_SOURCE.SYSTEM
          }
        }
      }
    );
    logger.info(
      `[TagService] Assigned tag=${newTag} user=${userId}`
    );
  } catch (err) {
    logger.error("[TagService] assignSingleTagIfNeeded error:", err);
  }
}
module.exports = {
  handleSessionCompletion
};