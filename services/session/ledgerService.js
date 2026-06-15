const Wallet = require("../../models/Wallet");
const WalletLedger = require("../../models/Ledger");
const ConsultationSession = require("../../models/ConsultationSession");
const User = require("../../models/User");
const Enums = require("../../utils/constants");
const logger = require("../../utils/logger");
const { getAdminUserId, updateUser } = require("./userService");
const { getAstrologerDetails } = require("./astrologerService");
const { handleAstroShareProcessing } = require("./sessionService");
const walletNotification = require("../../services/socket/walletNotification");
const {
  getSessionExtendedCount,
  clearSessionExtendedCount,
} = require("../../utils/redis/sessionExtend");
const tagService = require("../user/tagService");

async function createLedgerEntriesForSession(sessionId) {
  try {
    logger.info(`[Ledger] Processing session ID: ${sessionId}`);
    const session = await ConsultationSession.findById(sessionId);
    if (!session) throw new Error("Session not found");
    if (session.status !== Enums.SERVICE.STATUS.COMPLETED) {
      throw new Error(`Session is not completed. Status: ${session.status}`);
    }
    const {
      user_id,
      astrologer_user_id,
      duration_minutes,
      freeDuration = 0,
      rate_per_minute,
      chat_id,
      _id: sessionObjectId,
    } = session;
    const freeUsed = Math.min(duration_minutes, freeDuration);
    const billableMinutes = Math.max(0, duration_minutes - freeUsed);
    const ratePerMin = rate_per_minute || 0;
    const finalAmount = Number((billableMinutes * ratePerMin).toFixed(2));
    console.log(
      `[Ledger] Session ${sessionId} - Duration: ${duration_minutes}min, Free used: ${freeUsed}min, Billable: ${billableMinutes}min, Rate/min: ${ratePerMin}, Final amount: ${finalAmount}`,
    );
    const [userWallet, astroWallet] = await Promise.all([
      Wallet.findOne({ user_id }),
      Wallet.findOne({ user_id: astrologer_user_id }),
    ]);
    const superAdminUserId = await getAdminUserId();
    const superAdminWallet = await Wallet.findOne({
      user_id: superAdminUserId,
    });
    if (!userWallet || !astroWallet || !superAdminWallet) {
      throw new Error("Wallet not found");
    }
    const remarks = `Chat session ID: ${chat_id}`;
    const timestamp = new Date();
    if (billableMinutes === 0) {
      const zeroLedger = (wallet, direction) => ({
        wallet_id: wallet._id,
        transaction_type: Enums.TRANSACTION.TYPE.SESSION,
        direction,
        amount: 0,
        final_amount: 0,
        opening_balance: wallet.balance,
        closing_balance: wallet.balance,
        payment_method: Enums.PAYMENT.METHOD.WALLET,
        payment_provider: Enums.PAYMENT.PROVIDER.ASTROVEDVANNI,
        payment_status: Enums.PAYMENT.STATUS.PAID,
        related_entity_id: sessionObjectId.toString(),
        related_entity_type: Enums.ENTITY.TYPE.SESSION,
        remarks,
        timestamp,
      });
      await WalletLedger.create([
        zeroLedger(userWallet, Enums.TRANSACTION.DIRECTION.DEBIT),
        zeroLedger(astroWallet, Enums.TRANSACTION.DIRECTION.CREDIT),
        zeroLedger(superAdminWallet, Enums.TRANSACTION.DIRECTION.CREDIT),
      ]);
      return { success: true, message: "Ledger created for free session" };
    }
    const { serviceRate } = await getAstrologerDetails(astrologer_user_id);
    const commissionPct = serviceRate?.commission_pct ?? 0;
    const astrologerAmount = Number(
      ((commissionPct / 100) * finalAmount).toFixed(2),
    );
    const superAdminAmount = Number(
      (finalAmount - astrologerAmount).toFixed(2),
    );
    const userOpen = userWallet.balance;
    const astroOpen = astroWallet.balance;
    const superAdminOpen = superAdminWallet.balance;
    const userClose = Number((userOpen - finalAmount).toFixed(2));
    console.log(
      `[Ledger] User wallet - Open: ${userOpen}, Debit: ${finalAmount}, Close: ${userClose}`,
    );
    if (userClose < 0) throw new Error("Insufficient wallet balance");
    const astroClose = Number((astroOpen + astrologerAmount).toFixed(2));
    const superAdminClose = Number(
      (superAdminOpen + superAdminAmount).toFixed(2),
    );
    userWallet.balance = userClose;
    astroWallet.balance = astroClose;
    superAdminWallet.balance = superAdminClose;
    await Promise.all([
      userWallet.save(),
      astroWallet.save(),
      superAdminWallet.save(),
    ]);
    const entries = [
      {
        wallet_id: userWallet._id,
        transaction_type: Enums.TRANSACTION.TYPE.SESSION,
        direction: Enums.TRANSACTION.DIRECTION.DEBIT,
        amount: finalAmount,
        final_amount: finalAmount,
        opening_balance: userOpen,
        closing_balance: userClose,
        payment_method: Enums.PAYMENT.METHOD.WALLET,
        payment_provider: Enums.PAYMENT.PROVIDER.ASTROVEDVANNI,
        payment_status: Enums.PAYMENT.STATUS.PAID,
        related_entity_id: sessionObjectId.toString(),
        related_entity_type: Enums.ENTITY.TYPE.SESSION,
        remarks,
        timestamp,
      },
      {
        wallet_id: astroWallet._id,
        transaction_type: Enums.TRANSACTION.TYPE.SESSION,
        direction: Enums.TRANSACTION.DIRECTION.CREDIT,
        amount: astrologerAmount,
        final_amount: astrologerAmount,
        opening_balance: astroOpen,
        closing_balance: astroClose,
        payment_method: Enums.PAYMENT.METHOD.WALLET,
        payment_provider: Enums.PAYMENT.PROVIDER.ASTROVEDVANNI,
        payment_status: Enums.PAYMENT.STATUS.PAID,
        related_entity_id: sessionObjectId.toString(),
        related_entity_type: Enums.ENTITY.TYPE.SESSION,
        remarks: `${remarks} (Astrologer share ${commissionPct}%)`,
        timestamp,
      },
      {
        wallet_id: superAdminWallet._id,
        transaction_type: Enums.TRANSACTION.TYPE.SESSION,
        direction: Enums.TRANSACTION.DIRECTION.CREDIT,
        amount: superAdminAmount,
        final_amount: superAdminAmount,
        opening_balance: superAdminOpen,
        closing_balance: superAdminClose,
        payment_method: Enums.PAYMENT.METHOD.WALLET,
        payment_provider: Enums.PAYMENT.PROVIDER.ASTROVEDVANNI,
        payment_status: Enums.PAYMENT.STATUS.PAID,
        related_entity_id: sessionObjectId.toString(),
        related_entity_type: Enums.ENTITY.TYPE.SESSION,
        remarks: `${remarks} (Admin share)`,
        timestamp,
      },
    ];
    await WalletLedger.create(entries);
    await Promise.all([
      walletNotification.emitWalletUpdate(
        user_id,
        finalAmount,
        userOpen,
        userClose,
        "success",
        "service",
        100,
      ),
      walletNotification.emitWalletUpdate(
        astrologer_user_id,
        astrologerAmount,
        astroOpen,
        astroClose,
        "success",
        "service",
        101,
      ),
    ]);
    logger.info("[Ledger] Wallets updated and ledger created successfully.");
    return { success: true };
  } catch (error) {
    logger.error(`[Ledger] Failed to create entries: ${error.message}`, error);
    return { success: false, error: error.message };
  }
}
async function finalizeSession(
  sessionId,
  endedBy,
  statusReason,
  forcedEndReason = null,
) {
  logger.info(
    `[Session] Starting finalizeSession for sessionId=${sessionId}, endedBy=${endedBy}, statusReason=${statusReason} forcedEndReason=${forcedEndReason}`,
  );

  if (!sessionId) {
    logger.warn("[Session] No sessionId provided, aborting finalizeSession");
    return null;
  }

  const session = await ConsultationSession.findById(sessionId);
  logger.info(`[Session] Fetched session: ${JSON.stringify(session, null, 2)}`);

  if (!session || session.status !== Enums.SERVICE.STATUS.ONGOING) {
    logger.warn(
      `[Session] Cannot finalize session ${sessionId}. Invalid status or not found.`,
    );
    return null;
  }
  const extensionCount = 0;
  logger.info(`[Session] Session extension count: ${extensionCount}`);
  const adjustedEndTime = new Date(
    session.end_time.getTime() - extensionCount * 60000,
  );
  logger.info(
    `[Session] Adjusted end time (after subtracting extensions): ${adjustedEndTime.toISOString()}`,
  );
  const startTime = session.start_time;
  const endTime = adjustedEndTime || new Date();
  logger.info(
    `[Session] Start time: ${startTime.toISOString()}, End time for calculation: ${endTime.toISOString()}`,
  );

  console.log(
    `Session times - start: ${startTime}, end: ${endTime}, buffer time: ${session.total_buffer_time || 0}ms`,
  );
  const actualDurationMs =
    endTime - startTime - (session.total_buffer_time || 0);
  const totalConsumedMinutes = Math.ceil(actualDurationMs / 60000);
  logger.info(
    `[Session] Actual duration in ms: ${actualDurationMs}, totalConsumedMinutes (rounded): ${totalConsumedMinutes}`,
  );
  const freeDuration = session.freeDuration ?? 0;
  const freeUsed = Math.min(totalConsumedMinutes, freeDuration);
  const billableMinutes = Math.max(0, totalConsumedMinutes - freeUsed);
  logger.info(
    `[Session] Free duration: ${freeDuration}min, Free used: ${freeUsed}min, Billable minutes: ${billableMinutes}min`,
  );

  // --- Financial calculations ---
  const ratePerMin = session.rate_per_minute || 0;
  const commissionPct = session.commission_pct || 0;
  const finalAmount = Number((billableMinutes * ratePerMin).toFixed(2));
  const astroShare = Number(((finalAmount * commissionPct) / 100).toFixed(2));

  logger.info(
    `[Session] Rate per minute: ${ratePerMin}, Commission %: ${commissionPct}`,
  );
  logger.info(
    `[Session] Final amount to charge: ${finalAmount}, Astrologer share: ${astroShare}`,
  );

  // --- Update session ---
  await session.updateOne({
    status: Enums.SERVICE.STATUS.COMPLETED,
    status_reason: statusReason,
    completed_at: new Date(),
    end_time: endTime,
    duration_minutes: totalConsumedMinutes,
    total_amount: finalAmount,
    astrologer_share_amount: astroShare,
    payment_status: Enums.PAYMENT.STATUS.PAID,
    forced_end_reason: forcedEndReason,
  });
  logger.info(`[Session] Session updated in DB with completed status`);

  await clearSessionExtendedCount(sessionId);
  logger.info(
    `[Session] Cleared session extension count for sessionId=${sessionId}`,
  );

  // --- Trigger ledger entry asynchronously ---
  setImmediate(async () => {
    try {
      if (typeof createLedgerEntriesForSession === "function") {
        await createLedgerEntriesForSession(sessionId);
        logger.info(`[Ledger] Done for sessionId=${sessionId}`);
      }
      await tagService.handleSessionCompletion(session.user_id);
    } catch (err) {
      logger.error(`[AsyncTasks] Error for sessionId=${sessionId}`, err);
    }
  });
  logger.info(`[Session] finalizeSession completed for sessionId=${sessionId}`);
  return {
    session,
    totalConsumedMinutes,
    freeUsed,
    billableMinutes,
    finalAmount,
    endedBy,
  };
}
module.exports = {
  createLedgerEntriesForSession,
  finalizeSession,
};
