const consultationService = require('../../services/astrologer/sessionService');
const liveService = require('../../services/astrologer/liveService');
const { buildPaginationResponse } = require('../../utils/pagination');
const logger = require('../../utils/logger');
const Enums = require('../../utils/constants');
const { BadRequestError } = require('../../errors');

exports.getConsultationSessions = async (req, res, next) => {
  try {
    const astrologerUserId = req.user._id;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const { page: _p, limit: _l, ...otherFilters } = req.query;
    if (!otherFilters.status) {
      otherFilters.status = 501;
    }
    const filters = {
      astrologer_user_id: astrologerUserId,
      ...otherFilters,
    };
    const result = await consultationService.getSessionsForAstrologer(filters, page, limit);
    res.status(200).json({
      success: true,
      sessions: result.sessions,
      pagination: buildPaginationResponse({
        totalDocs: result.total,
        totalPages: Math.ceil(result.total / limit),
        page,
        limit,
      }),
    });
  } catch (error) {
    next(error);
  }
};
exports.scheduleLive = async (req, res, next) => {
  try {
    const astrologerUserId = req.user._id;
    const { title, description, scheduledStartTime } = req.body;
    logger.info(`[LIVE_CONTROLLER] Schedule request by astrologer ${astrologerUserId}`);
    const liveSession = await liveService.scheduleLive({
      astrologerUserId,
      title,
      description,
      scheduledStartTime
    });
    res.status(201).json({ success: true, data: liveSession });
  } catch (error) {
    logger.error(`[LIVE_CONTROLLER] scheduleLive error: ${error.message}`, { stack: error.stack });
    next(error);
  }
};
exports.startLive = async (req, res, next) => {
  try {
    const { liveSessionId } = req.query;
    const astrologerUserId = req.user._id;
    const { title, description } = req.body || {};
    logger.info(`[LIVE_CONTROLLER] Start live request. SessionId=${liveSessionId || 'NEW'}`);
    const { session, channelName, astroToken, astroUid } =
      await liveService.startLive(liveSessionId, astrologerUserId, title, description);
    res.status(200).json({
      success: true,
      data: { session, channelName, astroToken, astroUid }
    });
  } catch (error) {
    logger.error(`[LIVE_CONTROLLER] startLive error: ${error.message}`, { stack: error.stack });
    next(error);
  }
};
exports.endLive = async (req, res, next) => {
  try {
    const { liveSessionId } = req.query;
    const astrologerUserId = req.user._id;
    logger.info(`[LIVE_CONTROLLER] Start live request. SessionId=${liveSessionId || 'NEW'}`);
    const { session, channelName, astroToken, astroUid } =
      await liveService.endLive(liveSessionId, astrologerUserId);
    res.status(200).json({
      success: true,
      data: { session, channelName, astroToken, astroUid }
    });
  } catch (error) {
    logger.error(`[LIVE_CONTROLLER] startLive error: ${error.message}`, { stack: error.stack });
    next(error);
  }
};
exports.joinLive = async (req, res, next) => {
  try {
    const { liveSessionId } = req.query;
    const userId = req.user._id;
    logger.info(`[LIVE_CONTROLLER] User ${userId} joining live session ${liveSessionId}`);
    const { session, channelName, userToken, userUid } = await liveService.joinLive(liveSessionId, userId);
    res.status(200).json({
      success: true,
      data: {
        session,
        channelName,
        userToken,
        userUid
      }
    });
  } catch (error) {
    logger.error(`[LIVE_CONTROLLER] joinLive error: ${error.message}`, { stack: error.stack });
    next(error);
  }
};
exports.leaveLive = async (req, res, next) => {
  try {
    const { liveSessionId } = req.query;
    const userId = req.user._id;
    logger.info(`[LIVE_CONTROLLER] User ${userId} joining live session ${liveSessionId}`);
    const { session, channelName, userToken, userUid } = await liveService.leaveLive(liveSessionId, userId);
    res.status(200).json({
      success: true,
      data: {
        session,
        channelName,
        userToken,
        userUid
      }
    });
  } catch (error) {
    logger.error(`[LIVE_CONTROLLER] joinLive error: ${error.message}`, { stack: error.stack });
    next(error);
  }
};
exports.updateLive = async (req, res, next) => {
  try {
    const { liveSessionId } = req.query;
    const astrologerUserId = req.user._id;
    const { title, description, scheduledStartTime } = req.body;
    logger.info(`[LIVE_CONTROLLER] Update request. SessionId=${liveSessionId} by astrologer ${astrologerUserId}`);
    const updatedSession = await liveService.updateLive(liveSessionId, astrologerUserId, {
      title,
      description,
      scheduledStartTime
    });
    res.status(200).json({ success: true, data: updatedSession });
  } catch (error) {
    logger.error(`[LIVE_CONTROLLER] updateLive error: ${error.message}`, { stack: error.stack });
    next(error);
  }
};
exports.deleteLive = async (req, res, next) => {
  try {
    const { liveSessionId } = req.query;
    const astrologerUserId = req.user._id;
    logger.info(`[LIVE_CONTROLLER] Delete request. SessionId=${liveSessionId} by astrologer ${astrologerUserId}`);
    await liveService.deleteLive(liveSessionId, astrologerUserId);
    res.status(200).json({ success: true, message: 'Live session deleted successfully' });
  } catch (error) {
    logger.error(`[LIVE_CONTROLLER] deleteLive error: ${error.message}`, { stack: error.stack });
    next(error);
  }
};
exports.getMyLiveSessions = async (req, res, next) => {
  try {
    const astrologerUserId = req.user._id;
    const { status, page = 1, limit = 10 } = req.query;
    const filterStatus = status || Enums.SERVICE.STATUS.SCHEDULED;
    logger.info(
      `[LIVE_CONTROLLER] Fetch sessions request by astrologer ${astrologerUserId}, Status=${filterStatus}, Page=${page}, Limit=${limit}`
    );
    const { sessions, pagination } = await liveService.getMyLiveSessions(
      astrologerUserId,
      filterStatus,
      parseInt(page),
      parseInt(limit)
    );

    res.status(200).json({
      success: true,
      data: sessions,
      pagination,
    });
  } catch (error) {
    logger.error(`[LIVE_CONTROLLER] getMyLiveSessions error: ${error.message}`, { stack: error.stack });
    next(error);
  }
};
exports.commentOnLive = async (req, res, next) => {
  try {
    const { liveSessionId } = req.query;
    const userId = req.user._id;
    const comment = req.body;
    if (!comment?.text) {
      throw new BadRequestError('Comment is empty');
    }
    logger.info(`[LIVE_CONTROLLER] User ${userId} commenting on live session ${liveSessionId}`);
    const newComment = await liveService.commentOnLive(liveSessionId, userId, comment);
    res.status(200).json({ success: true, data: newComment });
  } catch (error) {
    logger.error(`[LIVE_CONTROLLER] commentOnLive error: ${error.message}`, { stack: error.stack });
    next(error);
  }
};