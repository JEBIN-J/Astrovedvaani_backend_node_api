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
    mode
  } = filters;

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

    const userIds = users.map((u) => u._id);

    query.user_id = { $in: userIds };
  }

    if (mode) {
      const modeValue = Number(mode);
      console.log("modeValue", modeValue);
    query.mode = modeValue;
  }

  // =========================================
  // USER FILTER
  // =========================================
  if (user_id && mongoose.Types.ObjectId.isValid(user_id)) {
    query.user_id = user_id;
  }

  // =========================================
  // ASTROLOGER USER FILTER
  // =========================================
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

  const [rawSessions, totalDocs] = await Promise.all([
    ConsultationSession.find(query)
      .populate({ path: "user_id" })
      .populate({ path: "astrologer_id" })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit))
      .lean(),

    ConsultationSession.countDocuments(query),
  ]);

  console.log("rawSessions", rawSessions);

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

    if (astrologerData?.user_id) {
      earningUserId = astrologerData.user_id;
    }
  }

  if (earningUserId) {
    const astrologerWallet = await Wallet.findOne({
      user_id: earningUserId,
    }).lean();

    if (astrologerWallet) {
      earningQuery.wallet_id = astrologerWallet._id;
    }
  }

  // =========================================
  // TOTAL EARNING
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
  // SESSION TRANSFORM
  // =========================================
  const sessions = await Promise.all(
    rawSessions.map(async (session) => {
      const isFree = session.is_free;

      let expected_user_debit = null;
      let expected_astrologer_credit = null;
      let expected_admin_earning = null;

      let actual_user_debit = null;
      let actual_astrologer_credit = null;
      let actual_admin_earning = null;

      // =========================================
      // PAID SESSION
      // =========================================
      if (!isFree && session.total_amount && session.astrologer_user_id) {
        const { serviceRate } = await getAstrologerDetails(
          session.astrologer_user_id,
        );

        const commissionPercent = serviceRate?.commission_pct ?? 0;

        expected_astrologer_credit = Math.round(
          (commissionPercent / 100) * session.total_amount,
        );

        expected_admin_earning =
          session.total_amount - expected_astrologer_credit;

        expected_user_debit = session.total_amount;

        // =====================================
        // LEDGER ENTRIES
        // =====================================
        const ledgerEntries = await WalletLedger.find({
          related_entity: session._id,

          transaction_type: Enums.TRANSACTION.TYPE.SESSION,
        }).lean();

        for (const entry of ledgerEntries) {
          // USER DEBIT
          if (entry.direction === Enums.TRANSACTION.DIRECTION.DEBIT) {
            actual_user_debit = (actual_user_debit || 0) + entry.final_amount;
          }

          // CREDIT
          else if (entry.direction === Enums.TRANSACTION.DIRECTION.CREDIT) {
            // ASTROLOGER
            if (entry.remarks?.includes("Astrologer")) {
              actual_astrologer_credit =
                (actual_astrologer_credit || 0) + entry.final_amount;
            }

            // ADMIN
            else if (entry.remarks?.includes("Admin")) {
              actual_admin_earning =
                (actual_admin_earning || 0) + entry.final_amount;
            }
          }
        }
      }

      // =========================================
      // FEEDBACK
      // =========================================
      const feedback = await getFeedBackBySourceId(session._id);

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
    }),
  );

  // =========================================
  // REMOVE EXTRA IDS
  // =========================================
  sessions.forEach((session) => {
    delete session.user_id;
    delete session.astrologer_id;
    delete session.astrologer_user_id;
  });

  // =========================================
  // PAGINATION
  // =========================================
  const totalPages = Math.ceil(totalDocs / limit);

  const pagination = buildPaginationResponse({
    totalDocs,
    totalPages,
    page: parseInt(page),
    limit: parseInt(limit),
  });

  // =========================================
  // FINAL RESPONSE
  // =========================================
  return {
    sessions,

    overall_earning,

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
