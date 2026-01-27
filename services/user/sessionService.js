const ConsultationSession = require('../../models/ConsultationSession');
const WalletLedger = require('../../models/Ledger');
const LiveSession = require('../../models/LiveSession');
const Astrologer = require('../../models/Astrologer');
const logger = require('../../utils/logger');
const { buildPaginationResponse } = require('../../utils/pagination');
const Enums = require("../../utils/constants");

// exports.fetchSessionHistory = async (userId, page = 1, limit = 10, filters = {}) => {
//   logger.info('[fetchSessionHistory] Called with', { userId, page, limit, filters });
//   const skip = (page - 1) * limit;
//   const query = { user_id: userId };
//   if (filters.mode !== undefined) query.mode = filters.mode;
//   if (filters.status !== undefined) query.status = filters.status;
//   if (filters.paymentStatus !== undefined) query.payment_status = filters.paymentStatus;
//   const astrologerName = filters.astrologerName?.trim();

//   let astrologerUserIds = [];
//   if (astrologerName) {
//     const matchedAstrologers = await Astrologer.find({
//       $or: [
//         { display_name: { $regex: astrologerName, $options: 'i' } },
//       ],
//     }).select('user_id').lean();

//     if (matchedAstrologers.length === 0) {
//       return {
//         sessions: [],
//         pagination: buildPaginationResponse({
//           totalDocs: 0,
//           totalPages: 0,
//           page,
//           limit,
//         }),
//       };
//     }

//     astrologerUserIds = matchedAstrologers.map(a => a.user_id);
//     query.astrologer_user_id = { $in: astrologerUserIds };
//   }
//   const [sessions, totalDocs] = await Promise.all([
//     ConsultationSession.find(query)
//       .sort({ start_time: -1 })
//       .skip(skip)
//       .limit(limit)
//       .populate('astrologer_user_id', 'name email profilePicture')
//       .lean(),
//     ConsultationSession.countDocuments(query),
//   ]);

//   logger.info(`[fetchSessionHistory] Sessions found: ${sessions.length}`);

//   const sessionIds = sessions.map(s => s._id);
//   const allAstrologerUserIds = [...new Set(sessions.map(s => s.astrologer_user_id?._id?.toString()).filter(Boolean))];
//   const astrologers = await Astrologer.find({ user_id: { $in: allAstrologerUserIds } })
//     .select('user_id display_name')
//     .lean();

//   const displayNameMap = new Map(
//     astrologers.map(a => [a.user_id.toString(), a.display_name])
//   );
//   const ledgers = await WalletLedger.find({
//     related_entity: { $in: sessionIds },
//     transaction_type: 1,
//   }).lean();

//   const ledgerMap = new Map(
//     ledgers.map(entry => [entry.related_entity.toString(), entry])
//   );
//   const sessionHistory = sessions.map(session => {
//     const astro = session.astrologer_user_id;
//     const transaction = ledgerMap.get(session._id.toString());
//     const displayName = displayNameMap.get(astro?._id?.toString()) || null;

//     return {
//       sessionId: session._id,
//       mode: session.mode,
//       astrologer: {
//         id: astro?._id,
//         name: astro?.name,
//         email: astro?.email,
//         profilePicture: astro?.profilePicture || null,
//         displayName,
//       },
//       startTime: session.start_time,
//       endTime: session.end_time,
//       duration: session.duration_minutes,
//       ratePerMinute: session.rate_per_minute,
//       totalAmount: session.total_amount,
//       status: session.status,
//       paymentStatus: session.payment_status,
//       transaction: transaction ? {
//         amount: transaction.amount,
//         method: transaction.payment_method,
//         provider: transaction.payment_provider,
//         externalTxnId: transaction.external_transaction_id,
//         finalAmount: transaction.final_amount,
//         time: transaction.timestamp,
//       } : null,
//     };
//   });
//   return {
//     sessions: sessionHistory,
//     pagination: buildPaginationResponse({
//       totalDocs,
//       totalPages: Math.ceil(totalDocs / limit),
//       page,
//       limit,
//     }),
//   };
// };
exports.fetchSessionHistory = async (userId, page = 1, limit = 10, filters = {}) => {
  logger.info('[fetchSessionHistory] Called with', { userId, page, limit, filters });

  const skip = (page - 1) * limit;
  const query = { user_id: userId };

  // Mode filter
  if (filters.mode !== undefined) query.mode = filters.mode;

  // Status filter (Exclude PENDING = 500 by default)
  if (filters.status !== undefined) {
    query.status = filters.status;
  } else {
    query.status = { $ne: Enums.SERVICE.STATUS.PENDING };  // exclude pending sessions
  }

  // payment status filter
  if (filters.paymentStatus !== undefined)
    query.payment_status = filters.paymentStatus;

  const astrologerName = filters.astrologerName?.trim();

  let astrologerUserIds = [];
  if (astrologerName) {
    const matchedAstrologers = await Astrologer.find({
      $or: [
        { display_name: { $regex: astrologerName, $options: 'i' } },
      ],
    }).select('user_id').lean();

    if (matchedAstrologers.length === 0) {
      return {
        sessions: [],
        pagination: buildPaginationResponse({
          totalDocs: 0,
          totalPages: 0,
          page,
          limit,
        }),
      };
    }

    astrologerUserIds = matchedAstrologers.map(a => a.user_id);
    query.astrologer_user_id = { $in: astrologerUserIds };
  }

  const [sessions, totalDocs] = await Promise.all([
    ConsultationSession.find(query)
      .sort({ start_time: -1 })
      .skip(skip)
      .limit(limit)
      .populate('astrologer_user_id', 'name email profilePicture')
      .lean(),
    ConsultationSession.countDocuments(query),
  ]);

  logger.info(`[fetchSessionHistory] Sessions found: ${sessions.length}`);

  const sessionIds = sessions.map(s => s._id);
  const allAstrologerUserIds = [
    ...new Set(
      sessions
        .map(s => s.astrologer_user_id?._id?.toString())
        .filter(Boolean)
    ),
  ];

  const astrologers = await Astrologer.find({ user_id: { $in: allAstrologerUserIds } })
    .select('user_id display_name')
    .lean();

  const displayNameMap = new Map(
    astrologers.map(a => [a.user_id.toString(), a.display_name])
  );

  const ledgers = await WalletLedger.find({
    related_entity: { $in: sessionIds },
    transaction_type: 1,
  }).lean();

  const ledgerMap = new Map(
    ledgers.map(entry => [entry.related_entity.toString(), entry])
  );

  const sessionHistory = sessions.map(session => {
    const astro = session.astrologer_user_id;
    const transaction = ledgerMap.get(session._id.toString());
    const displayName = displayNameMap.get(astro?._id?.toString()) || null;

    return {
      sessionId: session._id,
      mode: session.mode,
      astrologer: {
        id: astro?._id,
        name: astro?.name,
        email: astro?.email,
        profilePicture: astro?.profilePicture || null,
        displayName,
      },
      startTime: session.start_time,
      endTime: session.end_time,
      duration: session.duration_minutes,
      ratePerMinute: session.rate_per_minute,
      totalAmount: session.total_amount,
      status: session.status,
      paymentStatus: session.payment_status,
      transaction: transaction
        ? {
            amount: transaction.amount,
            method: transaction.payment_method,
            provider: transaction.payment_provider,
            externalTxnId: transaction.external_transaction_id,
            finalAmount: transaction.final_amount,
            time: transaction.timestamp,
          }
        : null,
    };
  });

  return {
    sessions: sessionHistory,
    pagination: buildPaginationResponse({
      totalDocs,
      totalPages: Math.ceil(totalDocs / limit),
      page,
      limit,
    }),
  };
};

exports.getAvailableLiveSessions = async (status, page = 1, limit = 10) => {
  try {
    logger.info(
      `[LIVE] Fetching available live sessions with status=${status}, page=${page}, limit=${limit}`
    );

    const thirtyMinutesAgo = new Date(Date.now() - 30 * 60 * 1000);

    const matchStage = {};

    // filter by status if provided
    if (status) {
      if (Array.isArray(status)) {
        matchStage.status = { $in: status };
      } else {
        matchStage.status = status;
      }
    }

    // only sessions started within last 30 mins or not yet started
    matchStage.$or = [
      { actual_start_time: { $exists: false } },
      { actual_start_time: { $gte: thirtyMinutesAgo } },
    ];

    const skip = (page - 1) * limit;

    // 🧠 aggregation pipeline
    const pipeline = [
      { $match: matchStage },
      { $sort: { actual_start_time: -1, scheduled_start_time: -1 } }, // latest first
      {
        $group: {
          _id: "$astrologer_user_id",
          lastSession: { $first: "$$ROOT" }, // pick latest per astrologer
        },
      },
      { $replaceRoot: { newRoot: "$lastSession" } },
      { $sort: { scheduled_start_time: 1 } },
      { $skip: skip },
      { $limit: limit },
      {
        $lookup: {
          from: "users",
          localField: "astrologer_user_id",
          foreignField: "_id",
          as: "astrologer_user_id",
        },
      },
      { $unwind: "$astrologer_user_id" },
      {
        $project: {
          "astrologer_user_id.name": 1,
          "astrologer_user_id.profilePicture": 1,
          title: 1,
          description: 1,
          scheduled_start_time: 1,
          actual_start_time: 1,
          status: 1,
          is_live: 1,
          total_viewers: 1,
          live_link: 1,
        },
      },
    ];

    const [sessions, totalDocsArr] = await Promise.all([
      LiveSession.aggregate(pipeline),
      LiveSession.aggregate([
        { $match: matchStage },
        { $group: { _id: "$astrologer_user_id" } },
        { $count: "total" },
      ]),
    ]);

    const totalDocs = totalDocsArr.length > 0 ? totalDocsArr[0].total : 0;
    const totalPages = Math.ceil(totalDocs / limit);

    logger.info(
      `[LIVE] Found ${sessions.length} active sessions (unique astrologers=${totalDocs})`
    );

    return {
      sessions,
      pagination: buildPaginationResponse({ totalDocs, totalPages, page, limit }),
    };
  } catch (err) {
    logger.error(`[LIVE] Failed to fetch available sessions: ${err.message}`, { stack: err.stack });
    throw err;
  }
};