const sessionService = require("../../services/admin/session/sessionService");
const logger = require("../../utils/logger");
const CacheService = require("../../utils/redis/cacheService");
const {
  getAllLanguages,
  getAllSpecializations,
} = require("../../services/admin/AstrologerSkillsService");
const asyncHandler = require("../../middlewares/asyncHandler");
const { BadRequestError } = require("../../errors");
exports.getConsultationSessions = async (req, res, next) => {
  try {
    const filters = req.query;
    console.log("Received filters:", JSON.stringify(filters));
    const result = await sessionService.getConsultationSessions(filters);
    const { attempted_sessions_count, non_attempted_sessions_count, total_sessions_count, overall_earning } = result;
    const stats = {
      attempted_sessions_count,
      non_attempted_sessions_count,
      total_sessions_count,
      overall_earning,
    };
    let cachedSpecializations = await CacheService.get(
      "sessions:specializations",
    );
    if (!cachedSpecializations) {
      cachedSpecializations = await getAllSpecializations({
        page: 1,
        limit: 2000,
      });
      await CacheService.set("sessions:specializations", cachedSpecializations);
    }
    let cachedLanguages = await CacheService.get("sessions:languages");
    if (!cachedLanguages) {
      cachedLanguages = await getAllLanguages({ page: 1, limit: 2000 });
      await CacheService.set("sessions:languages", cachedLanguages);
    }
    const allSpecs = cachedSpecializations.data || [];
    const allLangs = cachedLanguages.data || [];
    const transformedSessions = result.sessions.map((session) => {
      const astrologer = session.astrologer || {};
      const mappedSpecs = (astrologer.specializations || [])
        .map(
          (id) =>
            allSpecs.find((s) => s._id.toString() === id.toString())?.name,
        )
        .filter(Boolean);
      const mappedLangs = (astrologer.languages_spoken || [])
        .map(
          (id) =>
            allLangs.find((l) => l._id.toString() === id.toString())?.name,
        )
        .filter(Boolean);
      return {
        ...session,
        astrologer: {
          ...astrologer,
          specializations: mappedSpecs,
          languages_spoken: mappedLangs,
        },
      };
    });
    logger.info(
      `Consultation sessions fetched with filters: ${JSON.stringify(filters)}`,
    );
    return res.status(200).json({
      success: true,
      stats,
      sessions: transformedSessions,
      pagination: result.pagination,
    });
  } catch (error) {
    logger.error("Error fetching consultation sessions:", error);
    next(error);
  }
};
exports.fetchMessages = asyncHandler(async (req, res) => {
  const {
    session_id,
    message_type,
    status,
    from,
    to,
    page = 1,
    limit = 20,
  } = req.query;

  if (!session_id) {
    throw new BadRequestError("session_id is required");
  }

  const response = await sessionService.fetchMessages({
    session_id,
    message_type,
    status,
    from,
    to,
    page: Number(page),
    limit: Number(limit),
  });

  return res.status(200).json({
    success: true,
    ...response,
  });
});
