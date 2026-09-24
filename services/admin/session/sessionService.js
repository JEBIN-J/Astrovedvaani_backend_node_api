const ConsultationSession = require("../../../models/ConsultationSession");
const WalletLedger = require("../../../models/Ledger");
const { buildPaginationResponse } = require("../../../utils/pagination");
const mongoose = require("mongoose");
const Enums = require("../../../utils/constants");
const { getAstrologerDetails } = require("../../session/astrologerService");
const { getFeedBackBySourceId } = require("../feedBackService");
const { NotFoundError, BadRequestError } = require("../../../errors");
const ChatMessage = require("../../../models/Chat");
const Astrologer = require("../../../models/Astrologer");
const Wallet = require("../../../models/Wallet");
const Feedback = require("../../../models/Feedback");
const User = require("../../../models/User");
const AstrologerServiceRates = require("../../../models/AstrologerServiceRates");
function sanitizeUser(user) {
  if (!user) return null;

  const { devices, fcmToken, apiKeys, birthTime, birthPlace, ...safeUser } =
    user;

  if (apiKeys && Array.isArray(apiKeys)) {
    safeUser.apiKeys = apiKeys.map((key) => ({
      key: key.key,
      name: key.name,
      createdAt: key.createdAt,
      lastUsed: key.lastUsed,
      isActive: key.isActive,
    }));
  }

  return safeUser;
}

const buildDateFilter = (start_date, end_date) => {
  if (!start_date && !end_date) return null;

  const dateFilter = {};

  if (start_date) {
    const start = new Date(start_date);
    start.setHours(0, 0, 0, 0); // start of day
    dateFilter.$gte = start;
  }

  if (end_date) {
    const end = new Date(end_date);
    end.setHours(23, 59, 59, 999); // end of day
    dateFilter.$lte = end;
  }

  return dateFilter;
};
exports.getConsultationSessions = async (filters) => {
  const {
    user_id,
    astrologer_user_id,
    astrologer_id,
    status,
    payment_status,
    start_date,
    end_date,
    page = 1,
    limit = 10,
    search,
    mode,
  } = filters;

  const query = {};

  if (search?.trim()) {
    const searchRegex = new RegExp(search.trim(), "i");

    const [matchedUsers, matchedAstrologers] = await Promise.all([
      User.find({
        $or: [
          { name: searchRegex },
          { mobileNumber: searchRegex },
          { email: searchRegex },
        ],
      }).select("_id"),

      Astrologer.find({
        display_name: searchRegex,
      }).select("_id"),
    ]);

    const userIds = matchedUsers.map((u) => u._id);
    const astrologerIds = matchedAstrologers.map((a) => a._id);

    query.$or = [
      ...(userIds.length
        ? [
            { user_id: { $in: userIds } },
            { astrologer_user_id: { $in: userIds } },
          ]
        : []),

      ...(astrologerIds.length
        ? [{ astrologer_id: { $in: astrologerIds } }]
        : []),
    ];

    // If nothing matched, return no records
    if (query.$or.length === 0) {
      query._id = null;
    }
  }

  if (mode) {
    query.mode = Number(mode);
  }

  if (user_id && mongoose.Types.ObjectId.isValid(user_id)) {
    query.user_id = user_id;
  }

  if (
    astrologer_user_id &&
    mongoose.Types.ObjectId.isValid(astrologer_user_id)
  ) {
    query.astrologer_user_id = astrologer_user_id;
  }

  if (astrologer_id && mongoose.Types.ObjectId.isValid(astrologer_id)) {
    query.astrologer_id = astrologer_id;
  }

  if (status !== undefined) {
    query.status = Number(status);
  } else {
    query.status = {
      $ne: Enums.SERVICE.STATUS.PENDING,
    };
  }

  if (payment_status !== undefined) {
    query.payment_status = Number(payment_status);
  }

  const dateFilter = buildDateFilter(start_date, end_date);

  if (dateFilter) {
    query.createdAt = dateFilter;
  }

  const skip = (parseInt(page) - 1) * parseInt(limit);

  const [
    rawSessions,
    totalDocs,
    attempted_sessions_count,
    non_attempted_sessions_count,
    revenueSessions,
  ] = await Promise.all([
    ConsultationSession.find(query)
      .populate("user_id")
      .populate("astrologer_id")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(Number(limit))
      .lean(),

    ConsultationSession.countDocuments(query),

    ConsultationSession.countDocuments({
      ...query,
      status: Enums.SERVICE.STATUS.COMPLETED,
    }),

    ConsultationSession.countDocuments({
      ...query,
      status: {
        $in: [Enums.SERVICE.STATUS.CANCELLED, Enums.SERVICE.STATUS.NO_SHOW],
      },
    }),

    ConsultationSession.find({
      ...query,
      status: Enums.SERVICE.STATUS.COMPLETED,
    })
      .select("total_amount astrologer_share_amount")
      .lean(),
  ]);

  const total_sessions_count =
    attempted_sessions_count + non_attempted_sessions_count;

  let total_earning = 0;
  let astrologer_earning = 0;
  let admin_earning = 0;

  for (const session of revenueSessions) {
    if (session.is_free !== true && session.total_amount) {
      const totalAmount = Number(session.total_amount || 0);
      const astrologerAmount = Number(session.astrologer_share_amount || 0);

      total_earning += totalAmount;
      astrologer_earning += astrologerAmount;
      admin_earning += totalAmount - astrologerAmount;
    }
  }

  const revenue = {
    total_earning: Number(total_earning.toFixed(2)),
    astrologer_earning: Number(astrologer_earning.toFixed(2)),
    admin_earning: Number(admin_earning.toFixed(2)),
  };

  const earningQuery = {
    transaction_type: Enums.TRANSACTION.TYPE.SESSION,
    direction: Enums.TRANSACTION.DIRECTION.CREDIT,
  };

  if (dateFilter) {
    earningQuery.timestamp = dateFilter;
  }

  let earningUserId = null;

  if (
    astrologer_user_id &&
    mongoose.Types.ObjectId.isValid(astrologer_user_id)
  ) {
    earningUserId = astrologer_user_id;
  } else if (astrologer_id && mongoose.Types.ObjectId.isValid(astrologer_id)) {
    const astrologerData = await Astrologer.findById(astrologer_id).lean();
    earningUserId = astrologerData?.user_id;
  }

  if (earningUserId) {
    const wallet = await Wallet.findOne({
      user_id: earningUserId,
    }).lean();

    if (wallet) {
      earningQuery.wallet_id = wallet._id;
    }
  }

  const earningResult = await WalletLedger.aggregate([
    { $match: earningQuery },
    {
      $group: {
        _id: null,
        total_earning: { $sum: "$final_amount" },
      },
    },
  ]);

  const overall_earning = earningResult[0]?.total_earning || 0;
  const sessionIds = rawSessions.map((s) => s._id);

  const sessionIdStrings = sessionIds.map((id) => id.toString());

  const astrologerUserIds = [
    ...new Set(
      rawSessions.map((s) => s.astrologer_user_id?.toString()).filter(Boolean),
    ),
  ];

  const [ledgerEntries, feedbacks, astrologerRates] = await Promise.all([
    WalletLedger.find({
      related_entity_id: { $in: sessionIdStrings },
      related_entity_type: Enums.ENTITY.TYPE.SESSION,
      transaction_type: Enums.TRANSACTION.TYPE.SESSION,
    }).lean(),

    Feedback.find({
      source_id: { $in: sessionIds },
    }).lean(),

    AstrologerServiceRates.find({
      astrologer_user_id: { $in: astrologerUserIds },
    }).lean(),
  ]);

  console.log(
    `[actual_debug] sessions=${sessionIds.length} ledgerEntriesFound=${ledgerEntries.length}`,
  );

  const walletIds = [
    ...new Set(
      ledgerEntries.map((e) => e.wallet_id?.toString()).filter(Boolean),
    ),
  ];

  const wallets = walletIds.length
    ? await Wallet.find({ _id: { $in: walletIds } })
        .select("user_id")
        .lean()
    : [];

  const walletOwnerMap = new Map(
    wallets.map((w) => [w._id.toString(), w.user_id?.toString()]),
  );

  const ledgerMap = new Map();

  ledgerEntries.forEach((entry) => {
    const key = entry.related_entity_id; // already a string

    if (!ledgerMap.has(key)) {
      ledgerMap.set(key, []);
    }

    ledgerMap.get(key).push(entry);
  });

  const feedbackMap = new Map(
    feedbacks.map((f) => [f.source_id.toString(), f]),
  );

  const rateMap = new Map(
    astrologerRates.map((r) => [r.astrologer_user_id.toString(), r]),
  );

  const sessions = rawSessions.map((session) => {
    let expected_user_debit = 0;
    let expected_astrologer_credit = 0;
    let expected_admin_earning = 0;

    let actual_user_debit = 0;
    let actual_astrologer_credit = 0;
    let actual_admin_earning = 0;

    const hasPersistedAmount =
      typeof session.total_amount === "number" && session.total_amount > 0;

    if (hasPersistedAmount) {
      expected_astrologer_credit = Number(session.astrologer_share_amount || 0);
      expected_user_debit = Number(session.total_amount);
      expected_admin_earning = expected_user_debit - expected_astrologer_credit;
    } else if (session.is_free !== true) {
      const durationMinutes = Number(session.duration_minutes || 0);
      const ratePerMinute = Number(session.rate_per_minute || 0);
      const commissionPct = Number(session.commission_pct || 0);

      if (durationMinutes > 0 && ratePerMinute > 0) {
        expected_user_debit = Number(
          (durationMinutes * ratePerMinute).toFixed(2),
        );
        expected_admin_earning = Number(
          ((expected_user_debit * commissionPct) / 100).toFixed(2),
        );
        expected_astrologer_credit = Number(
          (expected_user_debit - expected_admin_earning).toFixed(2),
        );
      }
    }
    // else: no persisted amount AND genuinely free -> expected stays 0,
    // which is correct (nothing was ever supposed to be charged).

    const entries = ledgerMap.get(session._id.toString()) || [];

    // session.user_id was populated (full User doc), so pull its _id.
    // session.astrologer_user_id was NOT populated, so it's already a raw id.
    const sessionUserId = session.user_id?._id?.toString();
    const sessionAstrologerUserId = session.astrologer_user_id?.toString();

    entries.forEach((entry) => {
      const amount = Number(entry.final_amount || 0);
      const walletOwnerId = walletOwnerMap.get(entry.wallet_id?.toString());

      if (entry.direction === Enums.TRANSACTION.DIRECTION.DEBIT) {
        // A debit from the session's own user's wallet = actual amount
        // the user was charged for this session.
        if (!sessionUserId || walletOwnerId === sessionUserId) {
          actual_user_debit += amount;
        }
      }

      if (entry.direction === Enums.TRANSACTION.DIRECTION.CREDIT) {
        if (walletOwnerId && walletOwnerId === sessionAstrologerUserId) {
          // Credit landed in the astrologer's own wallet.
          actual_astrologer_credit += amount;
        } else {
          // Any other credit tied to this session (e.g. platform/admin
          // wallet) is treated as the admin's share.
          actual_admin_earning += amount;
        }
      }
    });

    const feedback = feedbackMap.get(session._id.toString());

    return {
      ...session,

      user: sanitizeUser(session.user_id),
      astrologer: sanitizeUser(session.astrologer_id),

      expected_user_debit,
      expected_astrologer_credit,
      expected_admin_earning,

      actual_user_debit,
      actual_astrologer_credit,
      actual_admin_earning,

      rating: feedback?.rating ?? null,
      review: feedback?.review ?? null,
    };
  });

  sessions.forEach((session) => {
    delete session.user_id;
    delete session.astrologer_id;
    delete session.astrologer_user_id;
  });

  const totalPages = Math.ceil(totalDocs / limit);
  const pagination = buildPaginationResponse({
    totalDocs,
    totalPages,
    page: Number(page),
    limit: Number(limit),
  });

  return {
    sessions,
    revenue,
    overall_earning,
    attempted_sessions_count,
    non_attempted_sessions_count,
    total_sessions_count,
    pagination,
  };
};

exports.fetchMessages = async ({
  session_id,
  message_type,
  status,
  from,
  to,
  page,
  limit,
}) => {
  if (!mongoose.Types.ObjectId.isValid(session_id)) {
    throw new BadRequestError("Invalid session_id");
  }
  const session = await ConsultationSession.findById(session_id)
    .select("_id mode")
    .lean();
  if (!session) {
    throw new NotFoundError("Consultation session not found");
  }
  if (session.mode !== Enums.SERVICE.TYPE.CHAT) {
    throw new BadRequestError("Messages are allowed only for CHAT sessions");
  }
  const filter = { session_id: new mongoose.Types.ObjectId(session_id) };
  if (message_type !== undefined) filter.message_type = Number(message_type);
  if (status !== undefined) filter.status = Number(status);
  if (from || to) {
    filter.createdAt = {};
    if (from) filter.createdAt.$gte = new Date(from);
    if (to) filter.createdAt.$lte = new Date(to);
  }
  const skip = (page - 1) * limit;
  const [messages, totalDocs] = await Promise.all([
    ChatMessage.find(filter)
      .select(
        "sender_id receiver_id message_type content is_read read_at status createdAt",
      )
      .sort({ createdAt: 1 })
      .skip(skip)
      .limit(limit)
      .populate("sender_id", "_id name role")
      .populate("receiver_id", "_id name role")
      .lean(),
    ChatMessage.countDocuments(filter),
  ]);
  if (!messages.length) {
    throw new NotFoundError("No chat messages found for this session");
  }
  return {
    data: messages,
    pagination: buildPaginationResponse({
      totalDocs,
      totalPages: Math.ceil(totalDocs / limit),
      page,
      limit,
    }),
  };
};
