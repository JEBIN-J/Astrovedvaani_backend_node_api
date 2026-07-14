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

/**
 * Promotional pricing is a ONE-TIME offer for brand-new users, granted
 * right after their free session — mirrors free-session eligibility:
 *   - user.isNewUser must still be true
 *   - user must not have already consumed their promotional session
 * Wallet-balance sufficiency (user must recharge at least the promo rate)
 * is naturally enforced later by userService.getWalletSessionEligibility,
 * so no separate wallet check is needed here.
 */
function isUserEligibleForPromotion(user) {
  if (!user) return false;

  if (user.promotionalSessionUsed) return false;
  return true;
}

/**
 * Atomically "claims" the one-time promotional session for a user.
 * Ensures that EVEN IF the user disconnects after using just a few minutes,
 * or two requests race each other, promo pricing can never be applied twice.
 * Returns true only if THIS call successfully claimed it.
 */
async function claimPromotionalEligibility(userId) {
  const claimed = await User.findOneAndUpdate(
    {
      _id: userId,
      promotionalSessionUsed: { $ne: true },
    },
    { $set: { promotionalSessionUsed: true } },
    { new: false }, // we only care whether a matching doc existed
  ).lean();

  return !!claimed;
}

/**
 * Rollback used only when session creation genuinely fails AFTER we
 * already claimed the promo — so the user doesn't lose their one-time
 * eligibility because of a system/wallet error, not because they used it.
 */
async function releasePromotionalEligibility(userId) {
  try {
    await User.updateOne(
      { _id: userId },
      { $set: { promotionalSessionUsed: false } },
    );
  } catch (err) {
    logger.error(
      `[Promotion] Failed to release promotional eligibility for userId=${userId}: ${err.message}`,
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

    // Fetch user once — used for free-session eligibility AND promo eligibility
    const user = await User.findById(userId).lean();
    if (!user) throw new Error("User not found");

    // ─────────────────────────────────────────────────────────────
    // FR-008..FR-014: Promotional pricing resolution.
    // Only new users who haven't yet used their one-time promotional
    // session are checked against active promotions. Promotional
    // pricing (if found) takes precedence over regular offer pricing.
    //
    // IMPORTANT: eligibility is CLAIMED atomically the moment we decide
    // to apply promo pricing — NOT after the session ends and NOT
    // proportional to minutes consumed. So even a session ended after
    // just 1-2 minutes permanently consumes the one-time promo.
    // ─────────────────────────────────────────────────────────────
    let rate;
    let commission_pct = serviceRate.commission_pct;
    let isPromotional = false;
    let promotionId = null;

    const promoEligible = isUserEligibleForPromotion(user);
    logger.info(
      `[Promotion] userId=${userId} promotionalSessionUsed=${user.promotionalSessionUsed} promoEligible=${promoEligible}`,
    );

    let activePromo = null;
    if (promoEligible) {
      activePromo = await getActivePromotion(astrologer._id, mode);
    }

    if (activePromo) {
      // Try to atomically claim the promo BEFORE using it.
      promoClaimed = await claimPromotionalEligibility(userId);

      if (promoClaimed) {
        rate = Number(activePromo.promoService.promotional_rate);
        commission_pct = Number(activePromo.promoService.commission_pct);
        isPromotional = true;
        promotionId = activePromo.promotion._id;

        logger.info(`[Promotion] Applying promotional rate (claimed)`, {
          astrologer_id: astrologer._id,
          promotion_id: promotionId,
          service_type: mode,
          promotional_rate: rate,
          commission_pct,
        });
      } else {
        // Someone/something already claimed it (race condition, or flag
        // was set a moment ago) -> fall back to normal pricing.
        logger.info(
          `[Promotion] Claim failed (already used) for userId=${userId}, falling back to normal pricing`,
        );
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
    }

    if (isNaN(rate) || rate <= 0) {
      throw new Error("Invalid final rate after applying offer");
    }

    logger.info(
      `Found astrologer: ${astrologer._id}, rate: ₹${rate}, isPromotional=${isPromotional}`,
    );

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

    // Wallet must cover at least the resolved rate (promotional or normal)
    // for the user to get any paid minutes — this naturally enforces
    // "recharge at least ₹<promo rate>" without extra logic.
    const walletEligibility = await userService.getWalletSessionEligibility(
      userId,
      rate,
    );
    if (!walletEligibility && !freeEligibility.duration) {
      throw new Error("Could not verify wallet eligibility");
    }
    const { eligible, wallet, maxDuration, reason } = walletEligibility;
    logger.info(`maxuduration is ${maxDuration}`);
    let realDuration = (maxDuration ?? 0) + freeDuration;
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
    });
  } catch (error) {
    logger.error(`[createChatSession] Failed: ${error.message}`, {
      userId,
      astrologerUserId,
      error: error.stack,
    });

    // If we had claimed the one-time promo but the session was never
    // actually created (some downstream failure), give the eligibility
    // back to the user — they didn't actually get to use it.
    if (promoClaimed) {
      await releasePromotionalEligibility(userId);
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
}) {
  const { saveSession } = require("../../utils/redis/sessionCacheService"); // <- require inside function

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
  // const astrologerShareAmount = Number((totalAmount * ((100 - commission_pct) / 100)).toFixed(2));
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

module.exports = {
  createChatSession,
  handleAstroShareProcessing,
};
