const sessionService = require("../../services/user/sessionService");
const Enums = require("../../utils/constants");
const logger = require("../../utils/logger");

exports.fetchSessionHistory = async (req, res, next) => {
  try {
    const userId = req.user._id;
    const page = parseInt(req.query.page || "1", 10);
    const limit = parseInt(req.query.limit || "10", 10);
    const filters = {
      astrologerName: req.query.astrologerName || undefined,
    };
    if (req.query.type) {
      const mode = parseInt(req.query.type, 10);
      if (!Object.values(Enums.SERVICE.TYPE).includes(mode)) {
        return res
          .status(400)
          .json({ success: false, message: "Invalid service type (mode)" });
      }
      filters.mode = mode;
    }
    if (req.query.status) {
      const status = parseInt(req.query.status, 10);
      if (!Object.values(Enums.SERVICE.STATUS).includes(status)) {
        return res
          .status(400)
          .json({ success: false, message: "Invalid session status" });
      }
      filters.status = status;
    }
    if (req.query.paymentStatus) {
      const paymentStatus = parseInt(req.query.paymentStatus, 10);
      if (!Object.values(Enums.PAYMENT.STATUS).includes(paymentStatus)) {
        return res
          .status(400)
          .json({ success: false, message: "Invalid payment status" });
      }
      filters.paymentStatus = paymentStatus;
    }
    logger.info("SessionController: fetchSessionHistory", {
      userId,
      page,
      limit,
      filters,
    });

    const result = await sessionService.fetchSessionHistory(
      userId,
      page,
      limit,
      filters,
    );
    res.status(200).json({ success: true, ...result });
  } catch (error) {
    logger.error("SessionController: fetchSessionHistory failed", {
      error: error.message,
    });
    next(error);
  }
};
exports.getAvailableLiveSessions = async (req, res, next) => {
  try {
    const userId = req.user?._id;
    const { status, page = 1, limit = 10 } = req.query;
    const filterStatus = status || [
      Enums.SERVICE.STATUS.ONGOING,
      Enums.SERVICE.STATUS.SCHEDULED,
    ];
    logger.info(
      `[LIVE_CONTROLLER] Fetch sessions request by user ${
        userId || "guest"
      }, Status=${filterStatus}, Page=${page}, Limit=${limit}`,
    );
    const { sessions, pagination } =
      await sessionService.getAvailableLiveSessions(
        filterStatus,
        parseInt(page),
        parseInt(limit),
      );
    res.status(200).json({
      success: true,
      data: sessions,
      pagination,
    });
  } catch (error) {
    logger.error(
      `[LIVE_CONTROLLER] getAvailableLiveSessions error: ${error.message}`,
      { stack: error.stack },
    );
    next(error);
  }
};
