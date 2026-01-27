const mongoose = require('mongoose');
const ReferralCode = require('../models/ReferralCode');
const ReferralUsage = require('../models/ReferralUsage');
const ReferralReward = require('../models/ReferralReward');
const { REFERRAL } = require('../utils/constants');
const logger = require('../utils/logger');

/**
 * Validate referral code
 */
const validateReferralCode = async (code) => {
  logger.info('[ReferralService] Validating referral code', { code });
  const refCode = await ReferralCode.findOne({ code: code.toUpperCase(), isActive: true });
  if (!refCode) {
    logger.warn('[ReferralService] Referral code not found or inactive', { code });
  } else {
    logger.info('[ReferralService] Valid referral code found', { referralCodeId: refCode._id });
  }
  return refCode;
};

/**
 * Generate and assign referral code to a user
 */
const assignReferralCodeToUser = async (user) => {
  if (user.myReferralCode) {
    logger.info('[ReferralService] User already has referral code', { userId: user._id });
    return user.myReferralCode;
  }
  const code = await ReferralCode.generateUniqueCode(user.name || 'XX');
  await ReferralCode.create({ userId: user._id, code });
  user.myReferralCode = code;
  await user.save();
  logger.info('[ReferralService] Referral code generated and assigned', { userId: user._id, code });
  return code;
};

/**
 * Process referral logic if referral code is used
 */
const handleReferralOnSignup = async (user, referralCodeDoc) => {
  logger.info('[ReferralService] Handling referral on signup', {
    newUserId: user._id,
    referredByCode: referralCodeDoc.code,
  });
  try {
    const referralUsage = await ReferralUsage.create({
      referral_code_id: referralCodeDoc._id,
      referred_user_id: user._id,
    });
    logger.info('[ReferralService] Referral usage record created', {
      referralUsageId: referralUsage._id,
    });
    const rewards = await ReferralReward.insertMany([
      {
        user_id: referralCodeDoc.userId,
        referral_usage_id: referralUsage._id,
        reward_type: REFERRAL.REWARD_TYPE.REFERRER,
        amount: 100,
        status: REFERRAL.REWARD_STATUS.PENDING,
      },
      {
        user_id: user._id,
        referral_usage_id: referralUsage._id,
        reward_type: REFERRAL.REWARD_TYPE.REFERRED,
        amount: 50,
        status: REFERRAL.REWARD_STATUS.PENDING,
      }
    ]);
    logger.info('[ReferralService] Referral rewards created', {
      rewardIds: rewards.map(r => r._id),
    });
    return { success: true, referralUsage, rewards };
  } catch (err) {
    logger.error('[ReferralService] Error in handleReferralOnSignup', {
      error: err.message,
      stack: err.stack,
    });
    throw err;
  }
};

module.exports = {
  validateReferralCode,
  assignReferralCodeToUser,
  handleReferralOnSignup,
};