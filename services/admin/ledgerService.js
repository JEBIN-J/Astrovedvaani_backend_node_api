const Wallet = require("../../models/Wallet");
const WalletLedger = require("../../models/Ledger");
const logger = require("../../utils/logger");
const ConsultationSession = require("../../models/ConsultationSession");
const PoojaBooking = require("../../models/PoojaBooking");
const Enums = require("../../utils/constants");
const { getAdminUserId } = require("../session/userService");
const Order = require("../../models/Order");
const WithdrawalRequest = require("../../models/WithDrawRequest");
const { buildPaginationResponse } = require("../../utils/pagination");

const ThirdPartyIntegration = require("../../models/ThirdPartyIntegration");
const Razorpay = require("razorpay");
const { randomUUID } = require("crypto");
const Astrologer = require("../../models/Astrologer");

const moment = require("moment");
const { notifyWalletAdjustment } = require("../../schedule/notificationWorker");
const { BadRequestError, NotFoundError } = require("../../errors");
const { emitWalletUpdate } = require("../socket/walletNotification");

// ✅ Build UTC date range safely
const buildUTCDateRange = (startDate, endDate) => {
  if (!startDate && !endDate) return null;

  const range = {};

  if (startDate) {
    const start = new Date(`${startDate}T00:00:00.000Z`);
    if (!isNaN(start)) range.$gte = start;
  }

  if (endDate) {
    const end = new Date(`${endDate}T23:59:59.999Z`);
    if (!isNaN(end)) range.$lte = end;
  }

  return Object.keys(range).length ? range : null;
};

exports.getUserLedger = async (userId, page = 1, limit = 10, filters = {}) => {
  const wallet = await Wallet.findOne({ user_id: userId });

  if (!wallet) {
    return {
      bookings: [],
      total: 0,
      total_credit_amount: 0,
      total_debit_amount: 0,
    };
  }

  const query = { wallet_id: wallet._id };

  // ✅ UTC SAFE DATE FILTER
  const dateRange = buildUTCDateRange(filters.startDate, filters.endDate);
  if (dateRange) {
    query.timestamp = dateRange;
  }

  // ✅ SAFE NUMERIC FILTERS (0 supported)
  if (filters.transaction_type !== undefined)
    query.transaction_type = Number(filters.transaction_type);

  if (filters.direction !== undefined)
    query.direction = Number(filters.direction);

  if (filters.payment_status !== undefined)
    query.payment_status = Number(filters.payment_status);

  if (filters.payment_method !== undefined)
    query.payment_method = Number(filters.payment_method);

  if (filters.payment_provider !== undefined)
    query.payment_provider = Number(filters.payment_provider);

  if (filters.related_entity_type)
    query.related_entity_type = filters.related_entity_type;

  if (filters.external_transaction_id)
    query.external_transaction_id = filters.external_transaction_id;

  if (filters.order_id) query.order_id = filters.order_id;

  const skip = (page - 1) * limit;

  const [bookings, total, totals] = await Promise.all([
    WalletLedger.find(query)
      .sort({ timestamp: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),

    WalletLedger.countDocuments(query),

    WalletLedger.aggregate([
      { $match: query },
      {
        $group: {
          _id: null,
          total_credit_amount: {
            $sum: {
              $cond: [
                { $eq: ["$direction", Enums.TRANSACTION.DIRECTION.CREDIT] },
                "$final_amount",
                0,
              ],
            },
          },
          total_debit_amount: {
            $sum: {
              $cond: [
                { $eq: ["$direction", Enums.TRANSACTION.DIRECTION.DEBIT] },
                "$final_amount",
                0,
              ],
            },
          },
        },
      },
    ]),
  ]);

  return {
    bookings,
    total,
    total_credit_amount: totals[0]?.total_credit_amount || 0,
    total_debit_amount: totals[0]?.total_debit_amount || 0,
  };
};

async function getSessionAnalytics(dateFilter = {}) {
  logger.info(`[Session Analytics] Start`, { dateFilter });

  const dateCondition = buildDateCondition(dateFilter);
  const matchDate = Object.keys(dateCondition).length
    ? { createdAt: dateCondition }
    : {};

  const [
    sessionStats,
    liveCount,
    userDebitSessions,
    astroCredits,
    adminCredits,
  ] = await Promise.all([
    ConsultationSession.aggregate([
      { $match: matchDate },
      {
        $group: {
          _id: "$mode",
          count: { $sum: 1 },
          totalDuration: { $sum: "$duration_minutes" },
          totalAmount: { $sum: "$total_amount" },
          totalAstroShare: { $sum: "$astrologer_share_amount" },
        },
      },
    ]),
    ConsultationSession.countDocuments({
      ...matchDate,
      mode: Enums.SERVICE.TYPE.VIDEO,
      status: Enums.SERVICE.STATUS.COMPLETED,
    }),
    WalletLedger.aggregate([
      {
        $match: {
          ...matchDate,
          direction: Enums.TRANSACTION.DIRECTION.DEBIT,
          transaction_type: Enums.TRANSACTION.TYPE.SESSION,
        },
      },
      {
        $group: {
          _id: "$payment_status",
          totalAmount: { $sum: "$final_amount" },
        },
      },
    ]),
    WalletLedger.aggregate([
      {
        $match: {
          ...matchDate,
          direction: Enums.TRANSACTION.DIRECTION.CREDIT,
          transaction_type: Enums.TRANSACTION.TYPE.SESSION,
        },
      },
      {
        $group: {
          _id: null,
          totalAmount: { $sum: "$final_amount" },
        },
      },
    ]),
    WalletLedger.aggregate([
      {
        $match: {
          ...matchDate,
          direction: Enums.TRANSACTION.DIRECTION.CREDIT,
          "metadata.is_admin_commission": true,
        },
      },
      {
        $group: {
          _id: "$payment_status",
          totalAmount: { $sum: "$final_amount" },
        },
      },
    ]),
  ]);

  const sessionCount = {
    CHAT: { count: 0, duration: 0, amount: 0, astroShare: 0 },
    VIDEO: { count: 0, duration: 0, amount: 0, astroShare: 0 },
    CALL: { count: 0, duration: 0, amount: 0, astroShare: 0 },
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
      sessionCount[key] = {
        count: item.count,
        duration: item.totalDuration || 0,
        amount: item.totalAmount || 0,
        astroShare: item.totalAstroShare || 0,
      };
    }
  });

  const totalSessionAmount = Object.values(sessionCount).reduce(
    (sum, s) => sum + s.amount,
    0,
  );
  const totalSessionAstroShare = Object.values(sessionCount).reduce(
    (sum, s) => sum + s.astroShare,
    0,
  );
  const totalSessionCommission = totalSessionAmount - totalSessionAstroShare;

  const settled =
    adminCredits.find((c) => c._id === Enums.PAYMENT.STATUS.PAID)
      ?.totalAmount || 0;
  const unsettled = totalSessionCommission - settled;

  const sessionEarnings = {
    total: totalSessionAmount,
    astroShare: totalSessionAstroShare,
    adminCommission: totalSessionCommission,
    settled,
    unsettled,
  };

  return { sessionCount, liveCount, sessionEarnings };
}
async function getPoojaAnalytics(dateFilter = {}) {
  logger.info(`[Pooja Analytics] Start`, { dateFilter });

  const dateCondition = buildDateCondition(dateFilter);
  const matchDate = Object.keys(dateCondition).length
    ? { createdAt: dateCondition }
    : {};

  const [poojaStats, poojaCount] = await Promise.all([
    PoojaBooking.aggregate([
      { $match: matchDate },
      {
        $group: {
          _id: "$booking_status",
          count: { $sum: 1 },
          totalAmount: { $sum: "$price_snapshot.final_price" },
          totalAstroShare: { $sum: "$astrologer_share_amount" },
        },
      },
    ]),
    PoojaBooking.countDocuments(matchDate),
  ]);

  const poojaStatus = {
    PENDING: { count: 0, amount: 0, astroShare: 0 },
    COMPLETED: { count: 0, amount: 0, astroShare: 0 },
    CANCELLED: { count: 0, amount: 0, astroShare: 0 },
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
      poojaStatus[key] = {
        count: item.count,
        amount: item.totalAmount || 0,
        astroShare: item.totalAstroShare || 0,
      };
    }
  });

  // Calculate totals from all statuses
  const totalAmount = Object.values(poojaStatus).reduce(
    (sum, s) => sum + s.amount,
    0,
  );
  const totalAstroShare = Object.values(poojaStatus).reduce(
    (sum, s) => sum + s.astroShare,
    0,
  );
  const adminCommission = totalAmount - totalAstroShare;

  // For settled/unsettled, we need to check actual wallet transactions
  const [settledCredits] = await Promise.all([
    WalletLedger.aggregate([
      {
        $match: {
          ...matchDate,
          direction: Enums.TRANSACTION.DIRECTION.CREDIT,
          "metadata.is_admin_commission": true,
          transaction_type: Enums.TRANSACTION.TYPE.ORDER,
          "metadata.order_type": Enums.ORDER.TYPE.POOJA,
          payment_status: Enums.PAYMENT.STATUS.PAID,
        },
      },
      { $group: { _id: null, totalAmount: { $sum: "$final_amount" } } },
    ]),
  ]);

  const settled = settledCredits.length ? settledCredits[0].totalAmount : 0;
  const unsettled = Math.max(0, adminCommission - settled);

  const poojaEarnings = {
    total: totalAmount,
    astroShare: totalAstroShare,
    adminCommission: adminCommission >= 0 ? adminCommission : 0,
    settled: settled,
    unsettled: unsettled,
  };

  return { poojaStatus, poojaCount, poojaEarnings };
}
exports.getAdminAstrologerAnalytics = async (dateFilter = {}, adminUserId) => {
  logger.info(`[Admin Analytics] Start`, { dateFilter });

  const [sessionData, poojaData, productEarnings] = await Promise.all([
    getSessionAnalytics(dateFilter),
    getPoojaAnalytics(dateFilter),
    getProductAnalytics(dateFilter),
  ]);

  // Calculate totals
  const totalSessionAmount = sessionData.sessionEarnings.total;
  const totalPoojaAmount = poojaData.poojaEarnings.total;
  const totalProductAmount = productEarnings.total;

  const totalAstroShare =
    sessionData.sessionEarnings.astroShare + poojaData.poojaEarnings.astroShare;

  const totalAdminCommission =
    sessionData.sessionEarnings.adminCommission +
    poojaData.poojaEarnings.adminCommission +
    productEarnings.adminCommission;

  const totalEarnings = {
    session: totalSessionAmount,
    pooja: totalPoojaAmount,
    product: totalProductAmount,
    combined: totalSessionAmount + totalPoojaAmount + totalProductAmount,
    totalAstroShare: totalAstroShare,
    totalAdminCommission: totalAdminCommission,
  };

  const result = {
    sessions: {
      counts: sessionData.sessionCount,
      liveCount: sessionData.liveCount,
      earnings: sessionData.sessionEarnings,
    },
    poojas: {
      counts: poojaData.poojaStatus,
      total: poojaData.poojaCount,
      earnings: {
        total: poojaData.poojaEarnings.total,
        astroShare: poojaData.poojaEarnings.astroShare,
        adminCommission: poojaData.poojaEarnings.adminCommission,
        settled: poojaData.poojaEarnings.settled,
        unsettled: poojaData.poojaEarnings.unsettled,
      },
    },
    products: {
      earnings: productEarnings,
    },
    totalEarnings,
  };

  logger.info(`[Admin Analytics] Final result: ${JSON.stringify(result)}`);
  return result;
};
async function getProductAnalytics(dateFilter = {}) {
  logger.info(`[Product Analytics] Start`, { dateFilter });

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

  const matchDate = Object.keys(dateCondition).length
    ? { createdAt: dateCondition }
    : {};
  const adminUserId = await getAdminUserId();

  const [productDebits, adminCredits] = await Promise.all([
    WalletLedger.aggregate([
      {
        $match: {
          ...matchDate,
          direction: Enums.TRANSACTION.DIRECTION.DEBIT,
          transaction_type: Enums.TRANSACTION.TYPE.PURCHASE,
          related_entity_type: Enums.ENTITY.TYPE.PRODUCT,
        },
      },
      { $group: { _id: null, totalAmount: { $sum: "$final_amount" } } },
    ]),
    WalletLedger.aggregate([
      {
        $match: {
          ...matchDate,
          direction: Enums.TRANSACTION.DIRECTION.CREDIT,
          transaction_type: Enums.TRANSACTION.TYPE.PURCHASE,
          related_entity_type: Enums.ENTITY.TYPE.PRODUCT,
          user_id: adminUserId,
          payment_status: Enums.PAYMENT.STATUS.PAID,
        },
      },
      { $group: { _id: null, totalAmount: { $sum: "$final_amount" } } },
    ]),
  ]);

  let totalAmount = productDebits.length ? productDebits[0].totalAmount : 0;
  let settledAmount = adminCredits.length ? adminCredits[0].totalAmount : 0;

  if (totalAmount === 0 && settledAmount === 0) {
    logger.warn(
      `[Product Analytics] No WalletLedger data for products, falling back to Orders`,
    );

    const orderMatch = {
      ...matchDate,
      order_type: Enums.ORDER.TYPE.PRODUCT,
      payment_status: Enums.PAYMENT.STATUS.PAID,
    };

    const ordersAgg = await Order.aggregate([
      { $match: orderMatch },
      { $group: { _id: null, totalAmount: { $sum: "$total_payable" } } },
    ]);

    totalAmount = ordersAgg.length ? ordersAgg[0].totalAmount : 0;
    settledAmount = totalAmount;
  }

  const unsettledAmount = Math.max(0, totalAmount - settledAmount);

  const productEarnings = {
    total: totalAmount,
    adminCommission: totalAmount,
    settled: settledAmount,
    unsettled: unsettledAmount,
  };

  return productEarnings;
}
function buildDateCondition(dateFilter = {}) {
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

  return dateCondition;
}

exports.getWithdrawalRequests = async ({
  status,
  startDate,
  endDate,
  astrologerId,
  page,
  limit,
  search,
}) => {
  try {
    const match = {};

    if (status !== undefined) match.status = Number(status);
    if (astrologerId) match.user = mongoose.Types.ObjectId(astrologerId);

    if (startDate || endDate) {
      match.requestedAt = {};
      if (startDate) {
        const start = new Date(startDate);
        start.setHours(0, 0, 0, 0);
        match.requestedAt.$gte = start;
      }
      if (endDate) {
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
        match.requestedAt.$lte = end;
      }
    }

    const skip = (page - 1) * limit;

    const pipeline = [
      { $match: match },
      // Join User collection
      {
        $lookup: {
          from: "users",
          localField: "user",
          foreignField: "_id",
          as: "user",
        },
      },
      { $unwind: "$user" },
      // Join Astrologer collection
      {
        $lookup: {
          from: "astrologers",
          localField: "user._id",
          foreignField: "user_id",
          as: "astrologer",
        },
      },
      { $unwind: { path: "$astrologer", preserveNullAndEmptyArrays: true } },
    ];

    // Create search match stage
    let searchMatch = null;
    if (search) {
      const regex = new RegExp(search, "i");
      searchMatch = {
        $match: {
          $or: [
            { "user.name": regex },
            { "user.email": regex },
            { "user.mobileNumber": regex },
            { "astrologer.display_name": regex },
          ],
        },
      };
      pipeline.push(searchMatch);
    }

    // Count total docs for pagination - include search filter
    const totalDocsPipeline = [...pipeline];
    totalDocsPipeline.push({ $count: "count" });

    const totalDocsResult =
      await WithdrawalRequest.aggregate(totalDocsPipeline);
    const totalDocs = totalDocsResult[0]?.count || 0;

    // Add sorting, skip, limit to main pipeline
    pipeline.push({ $sort: { requestedAt: -1 } });
    pipeline.push({ $skip: skip });
    pipeline.push({ $limit: limit });

    const withdrawalRequests = await WithdrawalRequest.aggregate(pipeline);

    const pagination = buildPaginationResponse({
      totalDocs,
      totalPages: Math.ceil(totalDocs / limit),
      page,
      limit,
    });

    return { withdrawalRequests, pagination };
  } catch (error) {
    logger.error("Error fetching admin withdrawal requests", { error });
    throw error;
  }
};

async function handleRazorpayPayout(request, wallet, integration) {
  const astrologer = await Astrologer.findOne({
    user_id: request.user._id,
  }).lean();

  // console.log("astorloger details", astrologer);
  // if (!astrologer.razorpay_fund_account_id) {
  //   throw new Error("Astrologer's fund account not created");
  // }

  // console.log("Initiating Razorpay payout", {
  //   astrologerId: astrologer._id,
  //   fundAccountId: astrologer.razorpay_fund_account_id,
  //   amount: request.amount,
  // });

  // const razorpay = new Razorpay({
  //   key_id: integration.api_key,
  //   key_secret: integration.api_secret,
  // });

  // const payout = await razorpay.payouts.create({
  //   fund_account: astrologer.razorpay_fund_account_id,
  //   amount: request.amount * 100,
  //   currency: "INR",
  //   mode: "IMPS",
  //   purpose: "payout",
  //   reference_id: `withdraw_${request._id}`,
  //   narration: "Astrologer withdrawal",
  // });

  // mark as completed
  request.status = Enums.SERVICE.STATUS.COMPLETED;
  request.processedAt = new Date();
  // request.external_transaction_id = payout.id;
  await request.save();

  await WalletLedger.create({
    wallet_id: wallet._id,
    transaction_type: Enums.TRANSACTION.TYPE.WITHDRAWAL,
    direction: Enums.TRANSACTION.DIRECTION.DEBIT,
    amount: request.amount,
    final_amount: request.amount,
    payment_method: Enums.PAYMENT.METHOD.BANK_TRANSFER,
    payment_provider: Enums.PAYMENT.PROVIDER.RAZORPAY,
    payment_status: Enums.PAYMENT.STATUS.PAID,
    opening_balance: wallet.balance + request.amount,
    closing_balance: wallet.balance,
    // external_transaction_id: payout.id,
    related_entity_id: request._id,
    related_entity_type: Enums.ENTITY.TYPE.WITHDRAWAL,
    remarks: "Withdrawal approved and transferred to astrologer",
    timestamp: new Date(),
  });

  return request;
}

async function handleCancelWithdrawal(request, wallet) {
  request.status = Enums.SERVICE.STATUS.CANCELLED;
  request.processedAt = new Date();
  await request.save();

  wallet.balance += request.amount;
  wallet.last_updated = new Date();
  await wallet.save();

  return request;
}

exports.updateWithdrawalRequest = async (requestId, newStatus) => {
  try {
    const request =
      await WithdrawalRequest.findById(requestId).populate("user");
    if (!request) throw new NotFoundError("Withdrawal request not found");

    if (request.status !== Enums.SERVICE.STATUS.PENDING) {
      throw new BadRequestError("Only pending requests can be updated");
    }

    const wallet = await Wallet.findById(request.wallet);
    if (!wallet) throw new NotFoundError("Wallet not found for this request");

    if (newStatus === Enums.SERVICE.STATUS.COMPLETED) {
      const integration = await ThirdPartyIntegration.findOne({
        provider: Enums.INTEGRATION.PROVIDER.RAZORPAY,
        type: Enums.INTEGRATION.TYPE.PAYMENT,
        is_active: true,
      });
      if (!integration) throw new Error("No active payout gateway");

      return await handleRazorpayPayout(request, wallet, integration);
    } else if (newStatus === Enums.SERVICE.STATUS.CANCELLED) {
      return await handleCancelWithdrawal(request, wallet);
    } else {
      throw new BadRequestError(
        "Invalid status. Allowed: 501 (COMPLETED), 502 (CANCELLED).",
      );
    }
  } catch (error) {
    logger.error("Error updating withdrawal request", {
      requestId,
      newStatus,
      error,
    });
    throw error;
  }
};

exports.adjustWalletBalance = async ({
  userId,
  amount,
  direction,
  remarks,
  performedBy,
}) => {
  amount = Number(amount);
  if (amount <= 0) throw new Error("Amount must be greater than zero");

  const wallet = await Wallet.findOne({ user_id: userId });
  if (!wallet) throw new Error("Wallet not found");

  /* ---------------- TRANSACTION TYPE ---------------- */
  const transactionType =
    direction === Enums.TRANSACTION.DIRECTION.CREDIT
      ? Enums.TRANSACTION.TYPE.RECHARGE
      : Enums.TRANSACTION.TYPE.EARNING;

  /* ---------------- BALANCE CALC ---------------- */
  const openingBalance = Number(wallet.balance.toFixed(2));

  const signedAmount =
    direction === Enums.TRANSACTION.DIRECTION.DEBIT ? -amount : amount;

  const closingBalance = Number((openingBalance + signedAmount).toFixed(2));

  if (closingBalance < 0) {
    throw new Error("Insufficient wallet balance");
  }

  /* ---------------- UPDATE WALLET ---------------- */
  wallet.balance = closingBalance;
  wallet.last_updated = new Date();
  await wallet.save();

  /* ---------------- LEDGER ENTRY ---------------- */
  const ledger = await WalletLedger.create({
    wallet_id: wallet._id,
    user_id: userId,

    transaction_type: transactionType,
    direction: direction,

    amount: Math.abs(amount),
    final_amount: Math.abs(amount),

    opening_balance: openingBalance,
    closing_balance: closingBalance,

    payment_method: Enums.PAYMENT.METHOD.WALLET,
    payment_provider: Enums.PAYMENT.PROVIDER.LOYALASTRO,
    payment_status: Enums.PAYMENT.STATUS.PAID,
    metadata: {
      performed_by: performedBy,
      operation: "MANUAL_WALLET_ADJUSTMENT",
    },

    remarks:
      remarks ||
      `Manual ${
        direction === Enums.TRANSACTION.DIRECTION.CREDIT ? "credit" : "debit"
      } of ₹${amount}`,

    timestamp: new Date(),
  });
  /* ---------------- PUSH NOTIFICATION ---------------- */
  try {
    emitWalletUpdate(
      userId,
      amount,
      openingBalance,
      closingBalance,
      "success",
      "recharge",
    );
    await notifyWalletAdjustment({
      userId,
      amount: Math.abs(amount),
      openingBalance,
      closingBalance,
      direction,
    });
  } catch (err) {
    logger.warn("notifyWalletAdjustment failed", err.message);
  }

  logger.info("Wallet adjusted (enum input)", {
    userId,
    direction,
    amount,
    openingBalance,
    closingBalance,
  });

  return { wallet, ledger };
};
