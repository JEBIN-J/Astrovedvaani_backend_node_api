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

  console.log("limits received:", { page, limit });

  const query = {};

  // =========================================
  // SEARCH FILTER
  // =========================================

  if (search) {
    const users = await User.find({
      mobileNumber: {
        $regex: search,
        $options: "i",
      },
    }).select("_id");

    query.user_id = {
      $in: users.map((u) => u._id),
    };
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

  // =========================================
  // COUNTS + SESSIONS PARALLEL
  // =========================================

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

  // =========================================
  // EARNING QUERY
  // =========================================

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

  // =========================================
  // OVERALL EARNING
  // =========================================

  const earningResult = await WalletLedger.aggregate([
    {
      $match: earningQuery,
    },
    {
      $group: {
        _id: null,
        total_earning: {
          $sum: "$final_amount",
        },
      },
    },
  ]);

  const overall_earning = earningResult[0]?.total_earning || 0;

  // =========================================
  // BULK IDS
  // =========================================

  const sessionIds = rawSessions.map((s) => s._id);

  const astrologerUserIds = [
    ...new Set(
      rawSessions.map((s) => s.astrologer_user_id?.toString()).filter(Boolean),
    ),
  ];

  // =========================================
  // BULK FETCH
  // =========================================

  const [ledgerEntries, feedbacks, astrologerRates] = await Promise.all([
    WalletLedger.find({
      related_entity: {
        $in: sessionIds,
      },
      transaction_type: Enums.TRANSACTION.TYPE.SESSION,
    }).lean(),

    Feedback.find({
      source_id: {
        $in: sessionIds,
      },
    }).lean(),

    AstrologerServiceRates.find({
      astrologer_user_id: {
        $in: astrologerUserIds,
      },
    }).lean(),
  ]);

  // =========================================
  // MAPS
  // =========================================

  const ledgerMap = new Map();

  ledgerEntries.forEach((entry) => {
    const key = entry.related_entity.toString();

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

  // =========================================
  // TRANSFORM
  // =========================================

  const sessions = rawSessions.map((session) => {
    let expected_user_debit = null;
    let expected_astrologer_credit = null;
    let expected_admin_earning = null;

    let actual_user_debit = 0;
    let actual_astrologer_credit = 0;
    let actual_admin_earning = 0;

    const rate = rateMap.get(session.astrologer_user_id?.toString());

    if (!session.is_free && session.total_amount) {
      const commission = rate?.commission_pct ?? 0;

      expected_astrologer_credit = Math.round(
        (commission / 100) * session.total_amount,
      );

      expected_admin_earning =
        session.total_amount - expected_astrologer_credit;

      expected_user_debit = session.total_amount;
    }

    const entries = ledgerMap.get(session._id.toString()) || [];

    entries.forEach((entry) => {
      if (entry.direction === Enums.TRANSACTION.DIRECTION.DEBIT) {
        actual_user_debit += entry.final_amount;
      }

      if (entry.direction === Enums.TRANSACTION.DIRECTION.CREDIT) {
        if (entry.remarks?.includes("Astrologer")) {
          actual_astrologer_credit += entry.final_amount;
        } else if (entry.remarks?.includes("Admin")) {
          actual_admin_earning += entry.final_amount;
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

  console.log("limit:", limit);
  console.log("totalDocs:", totalDocs);

  const totalPages = Math.ceil(totalDocs / limit);

  const pagination = buildPaginationResponse({
    totalDocs,
    totalPages,
    page: Number(page),
    limit: Number(limit),
  });

  console.log("pagination:", pagination);

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
