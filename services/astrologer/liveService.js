const Enums = require("../../utils/constants");
const logger = require("../../utils/logger");
const LiveSession = require("../../models/LiveSession");
const { notifyFollowers } = require("../socket/handleLiveService");
const socketManager = require("../../config/socket");
const { buildPaginationResponse } = require("../../utils/pagination");
const {
  generateChannelName,
  generateAgoraToken,
} = require("../agora/agoraService");
const {
  joinLiveRoom,
  leaveLiveRoom,
  emitUserJoined,
  emitLiveComment,
  emitUserLeft,
  emitLiveEnded,
} = require("../socket/liveSocket");
const User = require("../../models/User");

const scheduleLive = async ({
  astrologerUserId,
  title,
  description,
  scheduledStartTime,
}) => {
  try {
    logger.info(
      `[LIVE] Scheduling live session for astrologer ${astrologerUserId}`,
    );
    const liveSession = new LiveSession({
      astrologer_user_id: astrologerUserId,
      title,
      description,
      scheduled_start_time: scheduledStartTime || null,
      status: scheduledStartTime
        ? Enums.SERVICE.STATUS.PENDING
        : Enums.SERVICE.STATUS.PENDING,
      is_live: false,
    });
    await liveSession.save();
    await notifyFollowers(socketManager, astrologerUserId, liveSession);
    logger.info(
      `[LIVE] Live session scheduled successfully. SessionId=${liveSession._id}`,
    );
    return liveSession;
  } catch (err) {
    logger.error(`[LIVE] Failed to schedule live session: ${err.message}`, {
      stack: err.stack,
    });
    throw err;
  }
};

const AUTO_END_DELAY_MS = 3 * 60 * 1000;

//helper for auto end live
async function scheduleAutoEndLive(sessionId, astrologerUserId) {
  setTimeout(async () => {
    try {
      const session = await LiveSession.findById(sessionId);
      if (!session) return;

      // only end if still live and no attendees remain
      if (session.is_live && session.attendees.length === 0) {
        logger.warn(
          `[LIVE][AUTO-END] Session ${sessionId} still live after timeout. Ending now.`,
        );
        session.is_live = false;
        session.status = Enums.SERVICE.STATUS.COMPLETED;
        session.actual_end_time = new Date();
        await session.save();

        emitLiveEnded({ sessionId, attendees: [] });
        await notifyFollowers(socketManager, astrologerUserId, session);
      }
    } catch (err) {
      logger.error(
        `[LIVE][AUTO-END] Failed auto-ending session ${sessionId}: ${err.message}`,
      );
    }
  }, AUTO_END_DELAY_MS);
}

const startLive = async (
  liveSessionId,
  astrologerUserId,
  title,
  description,
) => {
  try {
    logger.info(
      `[LIVE] startLive called | liveSessionId=${liveSessionId} | astrologerUserId=${astrologerUserId}`,
    );

    let session;
    if (liveSessionId) {
      session = await LiveSession.findById(liveSessionId);
      if (!session) {
        logger.warn(
          `[LIVE] startLive failed: session not found | liveSessionId=${liveSessionId}`,
        );
        throw new Error("Live session not found");
      }
      logger.info(`[LIVE] Existing session fetched | sessionId=${session._id}`);
    } else {
      session = new LiveSession({
        astrologer_user_id: astrologerUserId,
        title,
        description,
        status: Enums.SERVICE.STATUS.ONGOING,
        is_live: true,
        actual_start_time: new Date(),
      });
      await session.save();
      logger.info(
        `[LIVE] New session created | sessionId=${session._id} | title=${title}`,
      );
    }

    const channelName = generateChannelName(
      Enums.SERVICE.TYPE.LIVE,
      session._id,
    );
    const astroUid = Math.floor(Math.random() * 100000) + 100000;
    const astroToken = await generateAgoraToken(
      channelName,
      astroUid,
      "publisher",
    );

    session.live_link = channelName;
    session.is_live = true;
    session.status = Enums.SERVICE.STATUS.ONGOING;
    session.actual_start_time = session.actual_start_time || new Date();
    await session.save();

    logger.info(
      `[LIVE] Session updated with live info | sessionId=${session._id} | channelName=${channelName} | astroUid=${astroUid}`,
    );

    await notifyFollowers(socketManager, astrologerUserId, session);
    logger.info(
      `[LIVE] Followers notified | astrologerUserId=${astrologerUserId} | sessionId=${session._id}`,
    );

    // 🔹 Schedule auto-end in case astrologer disconnects without ending
    scheduleAutoEndLive(session._id, astrologerUserId);

    return { session, channelName, astroToken, astroUid };
  } catch (err) {
    logger.error(`[LIVE] Failed to start live: ${err.message}`, {
      stack: err.stack,
    });
    throw err;
  }
};

const joinLive = async (liveSessionId, userId) => {
  logger.info(
    `[LIVE] joinLive called | liveSessionId=${liveSessionId} | userId=${userId}`,
  );

  const session = await LiveSession.findById(liveSessionId);
  if (!session?.is_live) {
    logger.warn(
      `[LIVE] joinLive failed: session not active | liveSessionId=${liveSessionId}`,
    );
    throw new Error("Live session not active");
  }

  let isNewJoin = false;
  if (
    !session.attendees.some((a) => a.user_id.toString() === userId.toString())
  ) {
    session.attendees.push({ user_id: userId });
    session.total_viewers += 1;
    await session.save();
    isNewJoin = true;
    logger.info(
      `[LIVE] New user joined session | userId=${userId} | totalViewers=${session.total_viewers}`,
    );
  } else {
    logger.info(`[LIVE] User already in session | userId=${userId}`);
  }

  const channelName = session.live_link;
  const userUid = Math.floor(Math.random() * 100000);
  const userToken = await generateAgoraToken(channelName, userUid, "audience");

  if (isNewJoin) {
    emitUserJoined({
      sessionId: liveSessionId,
      userId,
      astrologerUserId: session.astrologer_user_id,
      totalViewers: session.total_viewers,
    });
    logger.info(
      `[LIVE] emitUserJoined called | sessionId=${liveSessionId} | userId=${userId}`,
    );
  }

  return { session, channelName, userToken, userUid };
};

const leaveLive = async (liveSessionId, userId) => {
  logger.info(
    `[LIVE] leaveLive called | liveSessionId=${liveSessionId} | userId=${userId}`,
  );

  const session = await LiveSession.findById(liveSessionId);
  if (!session?.is_live) {
    logger.warn(
      `[LIVE] leaveLive failed: session not active | liveSessionId=${liveSessionId}`,
    );
    throw new Error("Live session not active");
  }

  const attendeeIndex = session.attendees.findIndex(
    (a) => a.user_id.toString() === userId.toString(),
  );
  if (attendeeIndex !== -1) {
    session.attendees.splice(attendeeIndex, 1);
    session.total_viewers = Math.max(0, session.total_viewers - 1);
    await session.save();
    logger.info(
      `[LIVE] User removed from session | userId=${userId} | totalViewers=${session.total_viewers}`,
    );
  } else {
    logger.info(`[LIVE] User not found in attendees | userId=${userId}`);
  }

  // Emit user left event
  emitUserLeft({
    sessionId: liveSessionId,
    userId,
    astrologerUserId: session.astrologer_user_id,
    totalViewers: session.total_viewers,
  });
  logger.info(
    `[LIVE] emitUserLeft called | sessionId=${liveSessionId} | userId=${userId}`,
  );

  return { success: true, session };
};

const endLive = async (sessionId, astrologerUserId) => {
  const session = await LiveSession.findById(sessionId);
  if (!session) throw new Error("Live session not found");
  if (session.astrologer_user_id.toString() !== astrologerUserId.toString())
    throw new Error("Unauthorized");

  session.status = Enums.SERVICE.STATUS.COMPLETED;
  session.is_live = false;
  session.actual_end_time = new Date();
  await session.save();

  emitLiveEnded({ sessionId, attendees: session.attendees });

  await notifyFollowers(socketManager, astrologerUserId, session);
  return { success: true, session };
};
const updateLive = async (liveSessionId, astrologerUserId, updates) => {
  try {
    logger.info(`[LIVE] Attempting to update live session ${liveSessionId}`);

    const session = await LiveSession.findById(liveSessionId);
    if (!session) {
      logger.warn(`[LIVE] Live session not found. SessionId=${liveSessionId}`);
      throw new Error("Live session not found");
    }

    if (session.astrologer_user_id.toString() !== astrologerUserId.toString()) {
      logger.warn(`[LIVE] Unauthorized update attempt by ${astrologerUserId}`);
      throw new Error("Not authorized to update this session");
    }

    // Prevent updating once it's live/finished
    if (session.is_live || session.status === Enums.SERVICE.STATUS.COMPLETED) {
      throw new Error("Cannot update a live or completed session");
    }

    if (updates.title) session.title = updates.title;
    if (updates.description) session.description = updates.description;
    if (updates.scheduledStartTime)
      session.scheduled_start_time = updates.scheduledStartTime;

    await session.save();
    logger.info(`[LIVE] Session ${liveSessionId} updated successfully`);

    return session;
  } catch (err) {
    logger.error(`[LIVE] Failed to update session: ${err.message}`, {
      stack: err.stack,
    });
    throw err;
  }
};
const deleteLive = async (liveSessionId, astrologerUserId) => {
  try {
    logger.info(`[LIVE] Attempting to delete live session ${liveSessionId}`);

    const session = await LiveSession.findById(liveSessionId);
    if (!session) {
      logger.warn(`[LIVE] Live session not found. SessionId=${liveSessionId}`);
      throw new Error("Live session not found");
    }

    if (session.astrologer_user_id.toString() !== astrologerUserId.toString()) {
      logger.warn(`[LIVE] Unauthorized delete attempt by ${astrologerUserId}`);
      throw new Error("Not authorized to delete this session");
    }

    if (session.is_live || session.status === Enums.SERVICE.STATUS.ONGOING) {
      throw new Error("Cannot delete a live session that is currently ongoing");
    }

    await LiveSession.findByIdAndDelete(liveSessionId);

    logger.info(`[LIVE] Session ${liveSessionId} deleted successfully`);
  } catch (err) {
    logger.error(`[LIVE] Failed to delete session: ${err.message}`, {
      stack: err.stack,
    });
    throw err;
  }
};
const getMyLiveSessions = async (
  astrologerUserId,
  status,
  page = 1,
  limit = 10,
) => {
  try {
    logger.info(
      `[LIVE] Fetching sessions for astrologer ${astrologerUserId} with status=${status}, page=${page}, limit=${limit}`,
    );
    const query = { astrologer_user_id: astrologerUserId };
    if (status) {
      query.status = status;
    }
    const skip = (page - 1) * limit;
    const [sessions, totalDocs] = await Promise.all([
      LiveSession.find(query)
        .sort({ scheduled_start_time: 1 })
        .skip(skip)
        .limit(limit),
      LiveSession.countDocuments(query),
    ]);
    const totalPages = Math.ceil(totalDocs / limit);
    logger.info(
      `[LIVE] Found ${sessions.length} sessions (total=${totalDocs}) for astrologer ${astrologerUserId}, Status=${status}`,
    );
    return {
      sessions,
      pagination: buildPaginationResponse({
        totalDocs,
        totalPages,
        page,
        limit,
      }),
    };
  } catch (err) {
    logger.error(`[LIVE] Failed to fetch sessions: ${err.message}`, {
      stack: err.stack,
    });
    throw err;
  }
};
async function commentOnLive(liveSessionId, userId, comment) {
  if (!comment?.text || comment.text.trim() === "") {
    throw new Error("Comment cannot be empty");
  }

  const session = await LiveSession.findById(liveSessionId).populate(
    "attendees.user_id",
  );
  if (!session || !session.is_live) {
    throw new Error("Live session not active");
  }

  const user = await User.findById(userId);
  if (!user) {
    throw new Error("User not found");
  }

  // Create new comment
  const newComment = {
    user_id: userId,
    text: comment.text,
    created_at: new Date(),
  };

  // Save comment in session
  session.comments.push(newComment);
  await session.save();

  // Prepare attendees array for emit
  const attendees = session.attendees.map((att) => ({
    user_id: att.user_id._id,
  }));

  // Emit comment to all attendees
  emitLiveComment({
    sessionId: liveSessionId,
    userId,
    text: comment.text,
    attendees,
    astrologerUserId: session.astrologer_user_id,
    name: user.name,
    profilePicture: user.profilePicture,
  });

  return newComment;
}
module.exports = {
  scheduleLive,
  startLive,
  joinLive,
  updateLive,
  deleteLive,
  getMyLiveSessions,
  leaveLive,
  endLive,
  commentOnLive,
};
