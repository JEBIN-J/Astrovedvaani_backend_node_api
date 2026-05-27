const ledgerService = require("../../services/astrologer/ledgerService");
const { buildPaginationResponse } = require("../../utils/pagination");
const asyncHandler = require("../../middlewares/asyncHandler");
const { BadRequestError } = require("../../errors");
exports.getMyLedger = async (req, res, next) => {
  try {
    const astrologerUserId = req.user._id;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
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
    const result = await ledgerService.getMyLedger(
      astrologerUserId,
      page,
      limit,
      filters,
    );
    res.status(200).json({
      success: true,
      data: result.bookings,
      currentMonthEarnings: result.currentMonthEarnings,
      totalEarnings: result.totalEarnings,
      pagination: buildPaginationResponse({
        totalDocs: result.total,
        totalPages: Math.ceil(result.total / limit),
        page,
        limit,
      }),
    });
  } catch (error) {
    console.error("Error fetching ledger:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Internal Server Error",
    });
  }
};
exports.getAstroAnalyticsController = async (req, res) => {
  try {
    const astrologerUserId = req.user._id;
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
    const data = await ledgerService.getAstrologerAnalytics(
      astrologerUserId,
      dateFilter,
    );
    return res.status(200).json({
      success: true,
      data,
    });
  } catch (error) {
    console.error("Error in astrologer analytics:", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};

exports.withdrawRequest = asyncHandler(async (req, res) => {
  const astrologerUserId = req.user._id;
  const { amount, remarks } = req.body;
  if (!amount || amount <= 0) {
    throw new BadRequestError(
      "Withdrawal amount is required and must be greater than 0",
    );
  }
  // if (amount < 500) {
  //   throw new BadRequestError("Minimum withdrawal amount is ₹500");
  // }
  const withdrawalRequest = await ledgerService.createWithdrawalRequest(
    astrologerUserId,
    amount,
    remarks,
  );
  res.status(201).json({
    success: true,
    data: withdrawalRequest,
  });
});

exports.myWithdrawRequests = asyncHandler(async (req, res) => {
  const astrologerUserId = req.user._id;
  const { status, startDate, endDate, page = 1, limit = 10 } = req.query;

  const { withdrawalRequests, walletSummary, pagination } =
    await ledgerService.myWithdrawalRequest({
      userId: astrologerUserId,
      status,
      startDate,
      endDate,
      page: parseInt(page, 10),
      limit: parseInt(limit, 10),
    });

  res.status(200).json({
    success: true,
    walletSummary,
    data: withdrawalRequests,
    pagination,
  });
});
