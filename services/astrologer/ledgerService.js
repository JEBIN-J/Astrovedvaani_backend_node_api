const Astrologer = require("../../models/Astrologer");
const ConsultationSession = require("../../models/ConsultationSession");
const WalletLedger = require("../../models/Ledger");
const PoojaBooking = require("../../models/PoojaBooking");
const Wallet = require("../../models/Wallet");
const WithDrawRequest = require("../../models/WithDrawRequest");
const Enums = require("../../utils/constants");
const logger = require("../../utils/logger");
const mongoose = require("mongoose");
const { BadRequestError, InsufficientBalanceError } = require("../../errors");
const { buildPaginationResponse } = require("../../utils/pagination");
const LiveSession = require("../../models/LiveSession");
const roundOff = (value) => Number(Number(value).toFixed(2));
async function getAstrologerEarnings(userId, filters = {}) {
  try {
    const wallet = await Wallet.findOne({
      user_id: userId,
    }).lean();

    if (!wallet) {
      return {
        currentMonthEarnings: 0,
        totalEarnings: 0,
      };
    }

    const now = new Date();

    // ==============================
    // CURRENT MONTH RANGE
    // ==============================
    const currentMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    const nextMonthStart = new Date(now.getFullYear(), now.getMonth() + 1, 1);

    const baseMatch = {
      wallet_id: wallet._id,

      direction: Enums.TRANSACTION.DIRECTION.CREDIT,

      payment_status: Enums.PAYMENT.STATUS.PAID,
    };

    // ==============================
    // CURRENT MONTH EARNINGS
    // ==============================
    const currentMonthAgg = await WalletLedger.aggregate([
      {
        $match: {
          ...baseMatch,

          createdAt: {
            $gte: currentMonthStart,
            $lt: nextMonthStart,
          },
        },
      },
      {
        $group: {
          _id: null,

          total: {
            $sum: "$amount",
          },
        },
      },
    ]);

    // ==============================
    // TOTAL / FILTERED EARNINGS
    // ==============================
    const totalMatch = {
      ...baseMatch,
    };

    if (filters.startDate || filters.endDate) {
      totalMatch.createdAt = {};

      if (filters.startDate) {
        totalMatch.createdAt.$gte = new Date(filters.startDate);
      }

      if (filters.endDate) {
        totalMatch.createdAt.$lte = new Date(filters.endDate);
      }
    }

    const totalAgg = await WalletLedger.aggregate([
      {
        $match: totalMatch,
      },
      {
        $group: {
          _id: null,

          total: {
            $sum: "$amount",
          },
        },
      },
    ]);

    return {
      currentMonthEarnings: Number(currentMonthAgg[0]?.total || 0),

      totalEarnings: Number(totalAgg[0]?.total || 0),
    };
  } catch (error) {
    console.error("getAstrologerEarnings Error:", error);

    return {
      currentMonthEarnings: 0,
      totalEarnings: 0,
    };
  }
}

exports.getMyLedger = async (userId, page = 1, limit = 10, filters = {}) => {
  const wallet = await Wallet.findOne({
    user_id: userId,
  });

  if (!wallet) {
    logger.warn("No wallet found for user", {
      userId,
    });

    return {
      bookings: [],
      total: 0,
      currentMonthEarnings: 0,
      totalEarnings: 0,
    };
  }

  const query = {
    wallet_id: wallet._id,
  };

  // ==============================
  // DATE FILTER
  // ==============================
  if (filters.startDate || filters.endDate) {
    query.createdAt = {};

    if (filters.startDate) {
      query.createdAt.$gte = new Date(filters.startDate);
    }

    if (filters.endDate) {
      query.createdAt.$lte = new Date(filters.endDate);
    }
  }

  // ==============================
  // OTHER FILTERS
  // ==============================
  if (filters.transaction_type) {
    query.transaction_type = parseInt(filters.transaction_type);
  }

  if (filters.direction) {
    query.direction = parseInt(filters.direction);
  }

  if (filters.payment_status) {
    query.payment_status = parseInt(filters.payment_status);
  }

  if (filters.payment_method) {
    query.payment_method = parseInt(filters.payment_method);
  }

  if (filters.payment_provider) {
    query.payment_provider = parseInt(filters.payment_provider);
  }

  if (filters.related_entity_type) {
    query.related_entity_type = filters.related_entity_type;
  }

  if (filters.external_transaction_id) {
    query.external_transaction_id = filters.external_transaction_id;
  }

  if (filters.order_id) {
    query.order_id = filters.order_id;
  }

  const skip = (page - 1) * limit;

  logger.info("Fetching wallet ledger", {
    userId,
    walletId: wallet._id,
    page,
    limit,
    filters,
    query,
    skip,
  });

  const [bookings, total, { currentMonthEarnings, totalEarnings }] =
    await Promise.all([
      WalletLedger.find(query)
        .sort({
          createdAt: -1,
        })
        .skip(skip)
        .limit(limit)
        .lean(),

      WalletLedger.countDocuments(query),

      getAstrologerEarnings(userId, filters),
    ]);

  return {
    bookings,

    total,

    currentMonthEarnings,

    totalEarnings,
  };
};
exports.getAstrologerAnalytics = async (astrologerUserId, dateFilter = {}) => {
  const dateCondition = getDateCondition(dateFilter);
  const wallet = await Wallet.findOne({ user_id: astrologerUserId });
  const astrologer = await Astrologer.findOne({ user_id: astrologerUserId });
  const [sessionData, poojaData, liveCount, liveGiftStats] = await Promise.all([
    getSessionAnalytics(astrologerUserId, dateCondition),
    getPoojaAnalytics(astrologer._id, dateCondition),
    getLiveSessionCount(astrologerUserId, dateCondition),
    getLiveGiftStats(astrologerUserId, dateCondition),
  ]);

  const [sessionLedgerStats, poojaLedgerStats] = wallet
    ? await Promise.all([
        getLedgerStats(
          wallet._id,
          dateCondition,
          Enums.TRANSACTION.TYPE.SESSION,
        ),
        getLedgerStats(
          wallet._id,
          dateCondition,
          Enums.TRANSACTION.TYPE.ORDER,
          Enums.ORDER.TYPE.POOJA,
        ),
      ])
    : [[], []];

  const sessionEarnings = processEarnings(
    sessionData.totalAmount,
    sessionLedgerStats,
  );

  const poojaEarnings = processEarnings(
    poojaData.totalAmount,
    poojaLedgerStats,
  );

  return {
    sessions: {
      counts: sessionData.counts,
      live: {
        count: liveCount,
        earnings: liveGiftStats,
      },
      earnings: {
        total: sessionEarnings.total + liveGiftStats.giftAmount,
        settled: sessionEarnings.settled,
        unsettled: sessionEarnings.unsettled,
      },
    },
    poojas: {
      counts: poojaData.counts,
      total: poojaData.totalCount,
      earnings: poojaEarnings,
    },
    totalEarnings: {
      session: roundOff(sessionEarnings.total + liveGiftStats.giftAmount),
      pooja: roundOff(poojaEarnings.total),
      combined: roundOff(
        sessionEarnings.total + liveGiftStats.giftAmount + poojaEarnings.total,
      ),
    },
  };
};
async function getSessionAnalytics(astrologerUserId, dateCondition) {
  const match = {
    astrologer_user_id: new mongoose.Types.ObjectId(astrologerUserId),
    status: Enums.SERVICE.STATUS.COMPLETED,
  };
  if (Object.keys(dateCondition).length) {
    match.createdAt = dateCondition;
  }
  logger.info("[SessionAnalytics] Match condition", { match });
  const [sessionStats, liveCount] = await Promise.all([
    ConsultationSession.aggregate([
      { $match: match },
      {
        $group: {
          _id: "$mode",
          count: { $sum: 1 },
          totalDuration: { $sum: "$duration_minutes" },
          totalAmount: { $sum: "$astrologer_share_amount" },
        },
      },
    ]),
    ConsultationSession.countDocuments({
      ...match,
      mode: Enums.SERVICE.TYPE.VIDEO,
    }),
  ]);
  logger.info("[SessionAnalytics] Aggregated stats", {
    sessionStats,
    liveCount,
  });
  const counts = {
    CHAT: { count: 0, duration: 0, amount: 0 },
    VIDEO: { count: 0, duration: 0, amount: 0 },
    CALL: { count: 0, duration: 0, amount: 0 },
  };

  sessionStats.forEach((item) => {
    const key =
      item._id === Enums.SERVICE.TYPE.CHAT
        ? "CHAT"
        : item._id === Enums.SERVICE.TYPE.VIDEO
          ? "VIDEO"
          : item._id === Enums.SERVICE.TYPE.CALL
            ? "CALL"
            : null;

    if (key) {
      counts[key] = {
        count: item.count,
        duration: item.totalDuration || 0,
        amount: item.totalAmount || 0,
      };
    }
  });

  logger.info("[SessionAnalytics] Counts after processing", { counts });

  return {
    counts,
    liveCount,
    totalAmount: Object.values(counts).reduce((sum, s) => sum + s.amount, 0),
  };
}
async function getLiveSessionCount(astrologerUserId, dateCondition) {
  const match = {
    astrologer_user_id: new mongoose.Types.ObjectId(astrologerUserId),
    status: Enums.SERVICE.STATUS.COMPLETED,
  };

  if (Object.keys(dateCondition).length) {
    match.createdAt = dateCondition;
  }

  return LiveSession.countDocuments(match);
}
async function getLiveGiftStats(astrologerUserId, dateCondition) {
  logger.info(`[LiveGiftStats] START astrologerUserId=${astrologerUserId}`);
  const wallet = await Wallet.findOne({ user_id: astrologerUserId });
  if (!wallet) {
    logger.info(
      `[LiveGiftStats] Wallet NOT found for user=${astrologerUserId}`,
    );
    return { giftAmount: 0, giftCount: 0 };
  }
  logger.info(`[LiveGiftStats] Wallet found walletId=${wallet._id}`);
  const sessionMatch = {
    astrologer_user_id: new mongoose.Types.ObjectId(astrologerUserId),
  };
  if (Object.keys(dateCondition).length) {
    sessionMatch.createdAt = dateCondition;
  }
  logger.info(
    `[LiveGiftStats] LiveSession match=${JSON.stringify(sessionMatch)}`,
  );
  const liveSessions = await LiveSession.find(sessionMatch, { _id: 1 }).lean();
  logger.info(`[LiveGiftStats] LiveSessions count=${liveSessions.length}`);
  if (!liveSessions.length) {
    logger.info(`[LiveGiftStats] No live sessions found`);
    return { giftAmount: 0, giftCount: 0 };
  }
  const liveSessionIds = liveSessions.map((s) => s._id.toString());
  logger.info(`[LiveGiftStats] LiveSessionIds=${liveSessionIds.join(",")}`);
  const ledgerMatch = {
    wallet_id: wallet._id,
    transaction_type: Enums.TRANSACTION.TYPE.EARNING,
    direction: Enums.TRANSACTION.DIRECTION.CREDIT,
    related_entity_type: Enums.ENTITY.TYPE.SESSION,
    related_entity_id: { $in: liveSessionIds },
  };
  if (Object.keys(dateCondition).length) {
    ledgerMatch.createdAt = dateCondition;
  }
  logger.info(`[LiveGiftStats] Ledger match=${JSON.stringify(ledgerMatch)}`);
  const ledgerRows = await WalletLedger.find(ledgerMatch).lean();
  logger.info(`[LiveGiftStats] Ledger rows count=${ledgerRows.length}`);
  if (!ledgerRows.length) {
    logger.info(`[LiveGiftStats] No ledger rows found`);
    return { giftAmount: 0, giftCount: 0 };
  }
  let giftAmount = 0;
  let giftCount = 0;
  ledgerRows.forEach((row) => {
    giftAmount += Number(row.final_amount || 0);
    giftCount += 1;
  });
  logger.info(
    `[LiveGiftStats] RESULT giftAmount=${giftAmount}, giftCount=${giftCount}`,
  );
  return { giftAmount, giftCount };
}
async function getPoojaAnalytics(astrologerId, dateCondition) {
  const match = { astrologer_id: new mongoose.Types.ObjectId(astrologerId) };
  if (Object.keys(dateCondition).length) {
    match.createdAt = dateCondition;
  }
  logger.info("[PoojaAnalytics] Match condition", { match });

  const [poojaStats, totalCount] = await Promise.all([
    PoojaBooking.aggregate([
      { $match: match },
      {
        $group: {
          _id: "$booking_status",
          count: { $sum: 1 },
          totalAmount: { $sum: "$astrologer_share_amount" },
        },
      },
    ]),
    PoojaBooking.countDocuments(match),
  ]);

  logger.info("[PoojaAnalytics] Aggregated stats", { poojaStats, totalCount });

  const counts = {
    PENDING: { count: 0, amount: 0 },
    COMPLETED: { count: 0, amount: 0 },
    CANCELLED: { count: 0, amount: 0 },
  };

  poojaStats.forEach((item) => {
    const key =
      item._id === Enums.ORDER.STATUS.PENDING
        ? "PENDING"
        : item._id === Enums.ORDER.STATUS.DELIVERED
          ? "COMPLETED"
          : item._id === Enums.ORDER.STATUS.CANCELLED
            ? "CANCELLED"
            : null;

    if (key) {
      counts[key] = {
        count: item.count,
        amount: item.totalAmount || 0,
      };
    }
  });

  logger.info("[PoojaAnalytics] Counts after processing", { counts });

  return {
    counts,
    totalCount,
    totalAmount: Object.values(counts).reduce((sum, s) => sum + s.amount, 0),
  };
}
async function getLedgerStats(
  walletId,
  dateCondition,
  transactionType,
  orderType,
) {
  const match = {
    wallet_id: walletId,
    direction: Enums.TRANSACTION.DIRECTION.CREDIT,
    transaction_type: transactionType,
  };

  if (Object.keys(dateCondition).length) {
    match.createdAt = dateCondition;
  }
  if (orderType) {
    match["metadata.order_type"] = orderType;
  }

  logger.info("[LedgerStats] Match condition", { match });

  const ledgerStats = await WalletLedger.aggregate([
    { $match: match },
    {
      $group: {
        _id: "$payment_status",
        totalAmount: { $sum: "$final_amount" },
      },
    },
  ]);

  logger.info("[LedgerStats] Aggregated ledger stats", { ledgerStats });
  return ledgerStats;
}
function processEarnings(aggregateTotal, ledgerStats) {
  logger.info("[ProcessEarnings] Inputs", { aggregateTotal, ledgerStats });
  const earnings = {
    total: aggregateTotal,
    settled: 0,
    unsettled: 0,
  };

  ledgerStats.forEach((ledger) => {
    if (ledger._id === Enums.PAYMENT.STATUS.PAID) {
      earnings.settled = ledger.totalAmount;
    } else {
      earnings.unsettled += ledger.totalAmount;
    }
  });

  logger.info("[ProcessEarnings] Output earnings", earnings);
  return earnings;
}
function getDateCondition(dateFilter) {
  logger.info("[GetDateCondition] Input dateFilter", { dateFilter });

  const { today, yesterday, last5days, customRange } = dateFilter;
  let dateCondition = {};

  if (today) {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const end = new Date();
    end.setHours(23, 59, 59, 999);
    dateCondition = { $gte: start, $lte: end };
  } else if (yesterday) {
    const start = new Date();
    start.setDate(start.getDate() - 1);
    start.setHours(0, 0, 0, 0);
    const end = new Date();
    end.setDate(end.getDate() - 1);
    end.setHours(23, 59, 59, 999);
    dateCondition = { $gte: start, $lte: end };
  } else if (last5days) {
    const end = new Date();
    end.setHours(23, 59, 59, 999);
    const start = new Date();
    start.setDate(start.getDate() - 5);
    start.setHours(0, 0, 0, 0);
    dateCondition = { $gte: start, $lte: end };
  } else if (customRange?.start && customRange?.end) {
    const start = new Date(customRange.start);
    start.setHours(0, 0, 0, 0);
    const end = new Date(customRange.end);
    end.setHours(23, 59, 59, 999);
    dateCondition = { $gte: start, $lte: end };
  }

  logger.info("[GetDateCondition] Output dateCondition", { dateCondition });
  return dateCondition;
}

exports.createWithdrawalRequest = async (userId, amount, remarks) => {
  try {
    const wallet = await Wallet.findOne({ user_id: userId });
    if (!wallet) {
      throw new BadRequestError("Wallet not found for this user");
    }
    if (wallet.balance < amount) {
      throw new InsufficientBalanceError("Insufficient wallet balance");
    }
    wallet.balance = Number((wallet.balance - amount).toFixed(2));
    wallet.last_updated = new Date();
    await wallet.save();
    const withdrawalRequest = new WithDrawRequest({
      user: userId,
      wallet: wallet._id,
      amount,
      remarks,
      status: Enums.SERVICE.STATUS.PENDING,
      requestedAt: new Date(),
    });

    await withdrawalRequest.save();
    return withdrawalRequest;
  } catch (error) {
    logger.error("Error creating withdrawal request", {
      userId,
      amount,
      error,
    });
    throw error;
  }
};

exports.myWithdrawalRequest = async ({
  userId,
  status,
  startDate,
  endDate,
  page,
  limit,
}) => {
  try {
    const filters = { user: userId };

    if (status !== undefined) {
      filters.status = Number(status);
    }

    if (startDate || endDate) {
      filters.requestedAt = {};
      if (startDate) filters.requestedAt.$gte = new Date(startDate);
      if (endDate) filters.requestedAt.$lte = new Date(endDate);
    }

    const skip = (page - 1) * limit;

    // Fetch requests for list
    const [withdrawalRequests, totalDocs, wallet] = await Promise.all([
      WithDrawRequest.find(filters)
        .sort({ requestedAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      WithDrawRequest.countDocuments(filters),
      Wallet.findOne({ user_id: userId }).lean(),
    ]);

    // Fetch all requests for balance calc
    const allRequests = await WithDrawRequest.find({ user: userId }).lean();

    const pendingBalance = allRequests
      .filter((r) => r.status === Enums.SERVICE.STATUS.PENDING)
      .reduce((sum, r) => sum + r.amount, 0);

    const receivedBalance = allRequests
      .filter((r) => r.status === Enums.SERVICE.STATUS.COMPLETED)
      .reduce((sum, r) => sum + r.amount, 0);

    const currentBalance = wallet?.balance || 0;

    const pagination = buildPaginationResponse({
      totalDocs,
      totalPages: Math.ceil(totalDocs / limit),
      page,
      limit,
    });

    return {
      walletSummary: {
        currentBalance,
        pendingBalance,
        receivedBalance,
      },
      withdrawalRequests,
      pagination,
    };
  } catch (error) {
    logger.error("Error fetching withdrawal requests", { userId, error });
    throw error;
  }
};
