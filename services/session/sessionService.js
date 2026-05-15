const { getAstrologerDetails, validateAstrologerAvailability } = require('./astrologerService');
const userService = require('./userService');
const Enums = require('../../utils/constants');
const ConsultationSession = require('../../models/ConsultationSession');
const { checkFreeSessionEligibility } = require('../admin/session/sessionSetting');
const User = require('../../models/User');
const logger = require('../../utils/logger');
const { applyOffersOnRates } = require('../astrologer/astrologerOfferService');

async function createChatSession({ userId, astrologerUserId, mode = Enums.SERVICE.TYPE.CHAT }) {
  try {
    await validateAstrologerAvailability(astrologerUserId, mode);
    logger.info(`[createChatSession] Start: userId=${userId}, astrologerUserId=${astrologerUserId}`);
    const astrologerDetails = await getAstrologerDetails(astrologerUserId, {
      service_type:mode
    });
    if (!astrologerDetails) {
      throw new Error('Astrologer not found or service not available');
    }
    const { astrologer, serviceRate } = astrologerDetails;
    if (!astrologer || !serviceRate?.rate) {
      throw new Error('Astrologer service rate not configured');
    }

    const [pricing] = await applyOffersOnRates(astrologer._id, [serviceRate]);
    console.log('pricing is ', pricing);

    if (!pricing) {
      throw new Error('Failed to resolve pricing');
    }
    const rate = Number(pricing.final_rate);

    if (isNaN(rate) || rate <= 0) {
      throw new Error('Invalid final rate after applying offer');
    }

    logger.info(`[Pricing] Rate resolved`, {
      astrologer_id: astrologer._id,
      service_type: serviceRate.service_type,
      base_rate: serviceRate.rate,
      final_rate: rate,
      discount_applied: pricing.discount_applied
    });
    logger.info(`Found astrologer: ${astrologer._id}, rate: ₹${rate}`);
    const user = await User.findById(userId).lean();
    if (!user) throw new Error('User not found');
    const freeEligibility = await checkFreeSessionEligibility(user);
    let freeDuration=0;
    let free=false;
    if (freeEligibility.eligible) {
      logger.info(`User eligible for free session of ${freeEligibility.duration} minutes`);
      freeDuration= freeEligibility.duration;
      free=true;
    }
    const walletEligibility = await userService.getWalletSessionEligibility(userId, rate);
    if (!walletEligibility&&!freeEligibility.duration) {
      throw new Error('Could not verify wallet eligibility');
    }
    const { eligible, wallet, maxDuration, reason } = walletEligibility;
    logger.info(`maxuduration is ${maxDuration}`);
    let realDuration = (maxDuration ?? 0) + freeDuration;
    if (!eligible && !freeEligibility.eligible) {
      throw new Error(reason || 'Not eligible for chat session');
    }
    logger.info(`realduration is ${realDuration}`);

    if (!realDuration || realDuration <= 0) {
      throw new Error('Invalid session duration calculated');
    }
    logger.info(`Creating paid session for ${realDuration} minutes`);
    return await createPaidSession({
      userId,
      astrologer,
      astrologerUserId,
      rate,
      minutes: realDuration,
      mode,
      commission_pct: serviceRate.commission_pct,
      free,
      freeDuration
    });
  } catch (error) {
    logger.error(`[createChatSession] Failed: ${error.message}`, {
      userId,
      astrologerUserId,
      error: error.stack
    });
    return {
      success: false,
      error: error.message,
      code: error.code || 'SESSION_CREATION_FAILED'
    };
  }
}

async function createPaidSession({ userId, astrologer, astrologerUserId, rate, minutes,mode,commission_pct,free,freeDuration }) {
    const { saveSession } = require('../../utils/redis/sessionCacheService'); // <- require inside function

  if (!rate || rate <= 0) {
    throw new Error('Invalid rate provided for paid session');
  }

  if (!minutes || minutes <= 0) {
    throw new Error('Invalid duration requested for paid session');
  }

  const now = new Date();
  const end = new Date(now.getTime() + minutes * 60000);
  const chatId = `chat_${userId}_${astrologerUserId}_${Date.now()}`;
  const totalAmount = Number((rate * minutes).toFixed(2));
  // const astrologerShareAmount = Number((totalAmount * ((100 - commission_pct) / 100)).toFixed(2));
  const astrologerShareAmount = Number(((totalAmount * commission_pct) / 100).toFixed(2));

  const session = await ConsultationSession.create({
    user_id: userId,
    astrologer_user_id: astrologerUserId,
    astrologer_id: astrologer._id,
    mode: mode,
    start_time: now,
    end_time: end,
    duration_minutes: minutes,
    rate_per_minute: rate,
    total_amount: rate * minutes,
    status: Enums.SERVICE.STATUS.PENDING,
    payment_status: Enums.PAYMENT.STATUS.PENDING,
    chat_id: chatId,
    astrologer_share_amount: astrologerShareAmount,
    commission_pct,
    is_free: free,
    freeDuration
  });

  logger.info(`Paid session created: ${session._id} and mode :${mode}`);
   const sessionCacheObject = {
    ...session.toObject(),
    success: true
  };

   const timestamp = Date.now();

   console.log('timestamp is ',timestamp);
    await saveSession(session._id, {...session.toObject(),timestamp});

  
  return {
    success: true,
    session_id: session._id,
    chat_id: session.chat_id,
    duration: session.duration_minutes,
    astrologer_user_id: astrologerUserId,
    user_id: userId,
    start_time: session.start_time,
    total_amount: session.total_amount,
    rate_per_minute: session.rate_per_minute,
    timestamp,
  };
}

async function handleAstroShareProcessing({ sessionId, astroShare, isFree }) {
  try {
    const session = await ConsultationSession.findById(sessionId);
    if (!session) {
      throw new Error('Session not found');
    }
    logger.info(`[AstroShare] Processing astro share for session: ${sessionId}`);
    if (isFree) {
          logger.info('[AstroShare]  astro share — session is free.');
          session.astrologer_share_amount = 0;
    }
    else{
    session.astrologer_share_amount = astroShare;
    }
    await session.save();
  } catch (err) {
    logger.error(`[AstroShare] Failed to process astro share for session ${sessionId}: ${err.message}`, err);
  }
}

module.exports = {
  createChatSession,
  handleAstroShareProcessing
};