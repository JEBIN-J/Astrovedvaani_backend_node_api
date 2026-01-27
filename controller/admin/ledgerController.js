const ledgerService = require("../../services/admin/ledgerService");
const { buildPaginationResponse } = require("../../utils/pagination");
const logger = require("../../utils/logger");
const asyncHandler = require("../../middlewares/asyncHandler");
const Enums = require("../../utils/constants");
const { BadRequestError } = require("../../errors");

exports.getUserLedger = async (req, res, next) => {
  try {
    const userId = req.query.userId || req.user._id;
    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 10;

    const filters = {
      startDate: req.query.startDate,
      endDate: req.query.endDate,
      transaction_type: req.query.transaction_type,
      direction: req.query.direction,
      payment_status: req.query.payment_status,
      payment_method: req.query.payment_method,
      payment_provider: req.query.payment_provider,
      related_entity_type: req.query.related_entity_type,
      external_transaction_id: req.query.external_transaction_id,
      order_id: req.query.order_id,
    };

    logger.info("Fetching user ledger", {
      userId,
      page,
      limit,
      filters,
    });

    const result = await ledgerService.getUserLedger(
      userId,
      page,
      limit,
      filters,
    );

    logger.info("User ledger fetched successfully", {
      total: result.total,
      page,
      limit,
    });

    return res.status(200).json({
      success: true,
      data: result.bookings,
      pagination: buildPaginationResponse({
        totalDocs: result.total,
        totalPages: Math.ceil(result.total / limit),
        page,
        limit,
      }),
    });
  } catch (error) {
    logger.error("Error fetching user ledger", {
      error: error.message,
      stack: error.stack,
    });
    return res.status(500).json({
      success: false,
      message: error.message || "Internal Server Error",
    });
  }
};

exports.getAdminAnalyticsController = async (req, res) => {
  try {
    const { today, yesterday, last5days, startDate, endDate } = req.query;
    const dateFilter = {};
    if (today) dateFilter.today = true;
    else if (yesterday) dateFilter.yesterday = true;
    else if (last5days) dateFilter.last5days = true;
    else if (startDate && endDate) {
      dateFilter.customRange = {
        start: startDate,
        end: endDate,
      };
    }
    const data = await ledgerService.getAdminAstrologerAnalytics(
      dateFilter,
      req.user._id,
    );
    return res.status(200).json({
      success: true,
      data,
    });
  } catch (error) {
    console.error("Error in admin analytics:", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};

exports.getWithdrawalRequests = asyncHandler(async (req, res) => {
  let {
    status,
    startDate,
    endDate,
    astrologerId,
    page = 1,
    limit = 10,
    search,
  } = req.query;
  page = parseInt(page, 10) || 1;
  limit = parseInt(limit, 10) || 10;
  if (startDate) {
    const start = new Date(startDate);
    if (isNaN(start.getTime())) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid startDate format" });
    }
    start.setHours(0, 0, 0, 0);
    startDate = start;
  }
  if (endDate) {
    const end = new Date(endDate);
    if (isNaN(end.getTime())) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid endDate format" });
    }
    end.setHours(23, 59, 59, 999);
    endDate = end;
  }
  const { withdrawalRequests, pagination } =
    await ledgerService.getWithdrawalRequests({
      status,
      startDate,
      endDate,
      astrologerId,
      page,
      limit,
      search,
    });
  res.status(200).json({
    success: true,
    data: withdrawalRequests,
    pagination,
  });
});

exports.updateWithdrawalRequest = asyncHandler(async (req, res) => {
  const { id } = req.query;
  const { status } = req.body;

  const updatedRequest = await ledgerService.updateWithdrawalRequest(
    id,
    status,
  );

  res.status(200).json({
    success: true,
    data: updatedRequest,
  });
});

exports.adjustWallet = asyncHandler(async (req, res) => {
  const { userId, amount, direction, remarks } = req.body;
  if (!userId || amount === undefined || direction === undefined) {
    throw new BadRequestError("userId, amount and direction are required");
  }
  if (typeof amount !== "number" || amount <= 0) {
    throw new BadRequestError("Amount must be a positive number");
  }
  if (amount > 15000) {
    throw new BadRequestError("Amount cannot exceed ₹15000");
  }
  if (!Object.values(Enums.TRANSACTION.DIRECTION).includes(Number(direction))) {
    throw new BadRequestError("Invalid transaction direction");
  }
  const performedBy = {
    user_id: req.user._id,
    role: req.user.role,
    email: req.user.email,
  };
  const result = await ledgerService.adjustWalletBalance({
    userId,
    amount,
    direction: Number(direction),
    remarks,
    performedBy,
  });
  res.status(200).json({
    success: true,
    message: "Wallet adjusted successfully",
    data: result,
  });
});
