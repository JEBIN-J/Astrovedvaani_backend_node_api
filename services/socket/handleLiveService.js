const Astrologer = require("../../models/Astrologer");
const FollowRequest = require("../../models/FollowRequest");
const Enums = require("../../utils/constants");
const logger = require("../../utils/logger");

exports.notifyFollowers = async (socketManager, astrologerUserId, liveSession) => {
  try {
    logger.info(`[LIVE] Preparing to notify followers for astrologer=${astrologerUserId}, sessionId=${liveSession._id}`);
    const astrologerId= await Astrologer.find({user_id:astrologerUserId})
    const followers = await FollowRequest.find({
      astrologer_id: astrologerId,
      status: Enums.SERVICE.FOLLOW.ACCEPTED,
    }).select("user_id");

    const followerIds = followers.map(f => f.user_id.toString());

    if (!followerIds.length) {
      logger.info(`[LIVE] No followers found for astrologer=${astrologerId}`);
      return;
    }

    let notifiedCount = 0;
    followerIds.forEach(userId => {
      if (socketManager.userSockets.has(userId)) {
        logger.info(`[LIVE] Emitting 'astro_live_notification' to userId=${userId}, socketCount=${socketManager.userSockets.get(userId)?.size || 0}`);

        socketManager.io.to(`user_${userId}`).emit("astro_live_notification", {
          astrologerId,
          sessionId: liveSession._id,
          title: liveSession.title,
          description: liveSession.description,
          scheduledStartTime: liveSession.scheduled_start_time,
          isLiveNow: liveSession.is_live,
          message: `${liveSession.is_live ? "Live Now" : "Upcoming"}: ${liveSession.title}`,
          timestamp: Date.now()
        });

        notifiedCount++;
      } else {
        logger.debug(`[LIVE] Skipped userId=${userId}, no active sockets`);
      }
    });

    logger.info(`[LIVE] Finished notifying followers. Success=${notifiedCount}, Skipped=${followerIds.length - notifiedCount}`);
  } catch (err) {
    logger.error(`[LIVE] Failed to notify followers: ${err.message}`, { stack: err.stack });
  }
};
