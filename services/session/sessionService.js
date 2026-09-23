const {
  getAstrologerDetails,
  validateAstrologerAvailability,
} = require("./astrologerService");
const userService = require("./userService");
const Enums = require("../../utils/constants");
const ConsultationSession = require("../../models/ConsultationSession");
const {
  checkFreeSessionEligibility,
} = require("../admin/session/sessionSetting");
const User = require("../../models/User");
const logger = require("../../utils/logger");
const { applyOffersOnRates } = require("../astrologer/astrologerOfferService");
const Promotion = require("../../models/AstrologerPromotion");
const WalletLedger = require("../../models/Ledger");

async function getActivePromotion(astrologerId, serviceType) {
  const now = new Date();

  const promotion = await Promotion.findOne({
    astrologers: astrologerId,
    isActive: true,
    startDate: { $lte: now },
    endDate: { $gte: now },
    "services.service_type": serviceType,
  }).lean();

  if (!promotion) return null;

  const promoService = promotion.services.find(
    (s) => s.service_type === serviceType,
  );

  if (!promoService) return null;

  return { promotion, promoService };
}

function isUserEligibleForPromotion(user) {
  if (!user) return false;

  if (user.promotionalSessionUsed) return false;
  return true;
}

async function claimPromotionalEligibility(userId) {
  const claimed = await User.findOneAndUpdate(
    {
      _id: userId,
      promotionalSessionUsed: { $ne: true },
    },
    { $set: { promotionalSessionUsed: true } },
    { new: false },
  ).lean();

  return !!claimed;
}

async function releasePromotionalEligibility(userId) {
  try {
    await User.updateOne(
      { _id: userId },
      { $set: { promotionalSessionUsed: false } },
    );

    logger.info(
      `[Promotion] Released promotional eligibility for userId=${userId}`,
    );
  } catch (err) {
    logger.error(
      `[Promotion] Failed to release promotional eligibility for userId=${userId}: ${err.message}`,
    );
  }
}

async function reconcilePromotionalUsage({
  userId,
  isPromotional,
  freeDuration,
  elapsedMinutes,
  sessionId,
}) {
  if (!isPromotional) return;

  const freeDur = freeDuration || 0;
  const consumedPromoMinutes = (elapsedMinutes ?? 0) - freeDur;

  if (consumedPromoMinutes <= 0) {
    await releasePromotionalEligibility(userId);

    logger.info(
      `[Promotion] sessionId=${sessionId} userId=${userId} only consumed free minutes (${elapsedMinutes}/${freeDur}) -> promo rate never actually used -> released eligibility`,
    );
  } else {
    logger.info(
      `[Promotion] sessionId=${sessionId} userId=${userId} consumed ${consumedPromoMinutes} promotional minute(s) -> promo eligibility stays used`,
    );
  }
}

async function createChatSession({
  userId,
  astrologerUserId,
  mode = Enums.SERVICE.TYPE.CHAT,
}) {
  let promoClaimed = false;

  try {
    await validateAstrologerAvailability(astrologerUserId, mode);

    logger.info(
      `[createChatSession] Start: userId=${userId}, astrologerUserId=${astrologerUserId}`,
    );

    const astrologerDetails = await getAstrologerDetails(astrologerUserId, {
      service_type: mode,
    });

    if (!astrologerDetails) {
      throw new Error("Astrologer not found or service not available");
    }

    const { astrologer, serviceRate } = astrologerDetails;

    if (!astrologer || !serviceRate?.rate) {
      throw new Error("Astrologer service rate not configured");
    }

    const user = await User.findById(userId).lean();

    if (!user) throw new Error("User not found");

    const freeEligibility = await checkFreeSessionEligibility(user);

    let freeDuration = 0;
    let free = false;

    if (freeEligibility.eligible) {
      logger.info(
        `User eligible for free session of ${freeEligibility.duration} minutes`,
      );

      freeDuration = freeEligibility.duration;
      free = true;
    }

    let rate;
    let commission_pct = serviceRate.commission_pct;
    let isPromotional = false;
    let promotionId = null;
    let walletEligibility = null;
    let promotionalDuration = 0;

    const promoEligible = isUserEligibleForPromotion(user);

    logger.info(
      `[Promotion] userId=${userId} promotionalSessionUsed=${user.promotionalSessionUsed} promoEligible=${promoEligible}`,
    );

    const latestRecharge = await WalletLedger.findOne({
      user: userId,
      type: "RECHARGE",
      status: "SUCCESS",
    }).sort({ createdAt: -1 });

    const rechargeAmount = Number(latestRecharge?.amount || 0);

    logger.info(
      `[Promotion] userId=${userId} latestSuccessfulRecharge=${rechargeAmount}`,
    );

    let activePromo = null;

    if (promoEligible && rechargeAmount <= 50) {
      activePromo = await getActivePromotion(astrologer._id, mode);
    } else if (rechargeAmount > 50) {
      logger.info(
        `[Promotion] Skipped for userId=${userId} because latest recharge ₹${rechargeAmount} > ₹50`,
      );
    }

    if (activePromo) {
      const promoRate = Number(activePromo.promoService.promotional_rate);

      promotionalDuration = Number(
        activePromo.promoService.promotional_minutes || 0,
      );

      if (promotionalDuration <= 0) {
        logger.info(
          `[Promotion] Invalid promotional duration for promotionId=${activePromo.promotion._id}`,
        );

        promotionalDuration = 0;
        activePromo = null;
      } else {
        const promoWalletEligibility =
          await userService.getWalletSessionEligibility(userId, promoRate);

        logger.info(
          `[Promotion] userId=${userId} promoRate=${promoRate} configuredPromotionalMinutes=${promotionalDuration} promoWalletFundedMinutes=${promoWalletEligibility?.maxDuration ?? 0}`,
        );

        const claimed = await claimPromotionalEligibility(userId);

        if (claimed) {
          promoClaimed = true;
          isPromotional = true;
          rate = promoRate;
          commission_pct = Number(
            activePromo.promoService.commission_pct,
          );
          promotionId = activePromo.promotion._id;
          walletEligibility = promoWalletEligibility;

          logger.info("[Promotion] Promotional pricing applied & claimed", {
            userId,
            astrologerId: astrologer._id,
            promotionId,
            rate,
            promotionalDuration,
            promoMaxDuration: promoWalletEligibility?.maxDuration ?? 0,
          });
        } else {
          promotionalDuration = 0;

          logger.info(
            `[Promotion] userId=${userId} lost claim race / already used -> falling back to normal pricing`,
          );
        }
      }
    }

    if (!isPromotional) {
      const [pricing] = await applyOffersOnRates(astrologer._id, [serviceRate]);

      console.log("pricing is ", pricing);

      if (!pricing) {
        throw new Error("Failed to resolve pricing");
      }

      rate = Number(pricing.final_rate);

      logger.info(`[Pricing] Rate resolved`, {
        astrologer_id: astrologer._id,
        service_type: serviceRate.service_type,
        base_rate: serviceRate.rate,
        final_rate: rate,
        discount_applied: pricing.discount_applied,
      });

      walletEligibility = await userService.getWalletSessionEligibility(
        userId,
        rate,
      );
    }

    if (isNaN(rate) || rate <= 0) {
      throw new Error("Invalid final rate after applying offer");
    }

    logger.info(
      `Found astrologer: ${astrologer._id}, rate: ₹${rate}, isPromotional=${isPromotional}`,
    );

    if (!walletEligibility && !freeEligibility.duration) {
      throw new Error("Could not verify wallet eligibility");
    }

    const { eligible, maxDuration, reason } = walletEligibility || {};

    logger.info(`maxuduration is ${maxDuration}`);

    let realDuration;

    if (isPromotional) {
      realDuration = freeDuration + promotionalDuration;

      logger.info(
        `[Promotion] realDuration = freeDuration(${freeDuration}) + promotionalDuration(${promotionalDuration}) = ${realDuration}`,
      );
    } else {
      realDuration = (maxDuration ?? 0) + freeDuration;

      logger.info(
        `[Normal] realDuration = freeDuration(${freeDuration}) + walletDuration(${maxDuration ?? 0}) = ${realDuration}`,
      );
    }

    if (!eligible && !freeEligibility.eligible) {
      throw new Error(reason || "Not eligible for chat session");
    }

    logger.info(`realduration is ${realDuration}`);

    if (!realDuration || realDuration <= 0) {
      throw new Error("Invalid session duration calculated");
    }

    logger.info(`Creating paid session for ${realDuration} minutes`);

    return await createPaidSession({
      userId,
      astrologer,
      astrologerUserId,
      rate,
      minutes: realDuration,
      mode,
      commission_pct,
      free,
      freeDuration,
      isPromotional,
      promotionId,
      promotionalDuration,
    });
  } catch (error) {
    logger.error(`[createChatSession] Failed: ${error.message}`, {
      userId,
      astrologerUserId,
      error: error.stack,
    });

    if (promoClaimed) {
      await releasePromotionalEligibility(userId);

      logger.info(
        `[Promotion] Released claimed promo eligibility for userId=${userId} due to session creation failure`,
      );
    }

    return {
      success: false,
      error: error.message,
      code: error.code || "SESSION_CREATION_FAILED",
    };
  }
}

async function createPaidSession({
  userId,
  astrologer,
  astrologerUserId,
  rate,
  minutes,
  mode,
  commission_pct,
  free,
  freeDuration,
  isPromotional = false,
  promotionId = null,
  promotionalDuration = 0,
}) {
  const { saveSession } = require("../../utils/redis/sessionCacheService");

  if (!rate || rate <= 0) {
    throw new Error("Invalid rate provided for paid session");
  }

  if (!minutes || minutes <= 0) {
    throw new Error("Invalid duration requested for paid session");
  }

  const now = new Date();
  const end = new Date(now.getTime() + minutes * 60000);
  const chatId = `chat_${userId}_${astrologerUserId}_${Date.now()}`;
  const totalAmount = Number((rate * minutes).toFixed(2));

  const astrologerShareAmount = Number(
    ((totalAmount * commission_pct) / 100).toFixed(2),
  );

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
    freeDuration,
    total_buffer_time: 0,
    is_promotional: isPromotional,
    promotion_id: promotionId,
    promotionalDuration,
  });

  logger.info(
    `Paid session created: ${session._id}, mode: ${mode}, isPromotional: ${isPromotional}`,
  );

  const sessionCacheObject = {
    ...session.toObject(),
    success: true,
  };

  const timestamp = Date.now();

  console.log("timestamp is ", timestamp);

  await saveSession(session._id, {
    ...session.toObject(),
    timestamp,
    astrologer_display_name: astrologer.display_name || "Astrologer",
  });

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
    astrologer_display_name: astrologer?.display_name || "Astrologer",
    is_promotional: isPromotional,
    promotion_id: promotionId,
  };
}

async function handleAstroShareProcessing({ sessionId, astroShare, isFree }) {
  try {
    const session = await ConsultationSession.findById(sessionId);

    if (!session) {
      throw new Error("Session not found");
    }

    logger.info(
      `[AstroShare] Processing astro share for session: ${sessionId}`,
    );

    if (isFree) {
      logger.info("[AstroShare]  astro share — session is free.");
      session.astrologer_share_amount = 0;
    } else {
      session.astrologer_share_amount = astroShare;
    }

    await session.save();
  } catch (err) {
    logger.error(
      `[AstroShare] Failed to process astro share for session ${sessionId}: ${err.message}`,
      err,
    );
  }
}

async function isPromotionStillValid(promotionId) {
  if (!promotionId) return false;

  const now = new Date();

  const promo = await Promotion.findOne({
    _id: promotionId,
    isActive: true,
    startDate: { $lte: now },
    endDate: { $gte: now },
  }).lean();

  return !!promo;
}

module.exports = {
  createChatSession,
  handleAstroShareProcessing,
  claimPromotionalEligibility,
  releasePromotionalEligibility,
  reconcilePromotionalUsage,
  isPromotionStillValid,
};