const logger = require("../../utils/logger");
const ConsultationSession = require("../../models/ConsultationSession");
const Enums = require("../../utils/constants");
const {
  releasePromotionalEligibility, // <-- FIX: needed to roll back a promo claim on auto-reject
} = require("../../services/session/sessionService");

function autoRejectSession(
  sessionId,
  astrologerId,
  socketManager,
  timeoutMs = 30000,
) {
  setTimeout(async () => {
    try {
      const {
        getSession,
        clearSession,
      } = require("../../utils/redis/sessionCacheService");
      const session = await getSession(sessionId);

      if (session && session.status === Enums.SERVICE.STATUS.PENDING) {
        const rejectionReason = "No response from astrologer";

        // ── FIX: session was PENDING and never got a response — nothing
        // was ever consumed. If a one-time promo was claimed for it, give
        // it back to the user, otherwise it's lost forever without ever
        // being used. ──
        if (session.is_promotional) {
          await releasePromotionalEligibility(session.user_id);
          logger.info(
            `[AUTO-REJECT] Released promo eligibility for userId=${session.user_id} — session ${sessionId} auto-rejected (no astrologer response)`,
          );
        }

        await ConsultationSession.findByIdAndUpdate(
          sessionId,
          {
            status: Enums.SERVICE.STATUS.NO_SHOW,
            status_reason:
              Enums.SERVICE.STATUS_REASON.NO_SHOW.ASTROLOGER_NO_SHOW,
            rejection_reason: rejectionReason,
          },
          { new: true },
        );

        socketManager.io
          .to(`user_${session.user_id}`)
          .emit("chat_request_rejected", {
            astrologerId,
            sessionId,
            reason: rejectionReason,
            timestamp: Date.now(),
            message: "Request auto-rejected due to no response",
          });

        await clearSession(sessionId);
        logger.info(
          `[AUTO-REJECT] Session ${sessionId} auto-rejected after ${timeoutMs}ms (no response)`,
        );
      }
    } catch (err) {
      logger.error(`[AUTO-REJECT] Failed for session ${sessionId}:`, err);
    }
  }, timeoutMs);
}

module.exports = { autoRejectSession };
