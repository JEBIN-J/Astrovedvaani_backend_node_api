const walletService = require("../../services/user/walletService");
const logger = require("../../utils/logger");
const webhookService = require("../../services/webhookService");
const asyncHandler = require("../../middlewares/asyncHandler");
const { applyCoupon } = require("../../services/user/coupanService");
const Enums = require("../../utils/constants");

exports.getCurrentBalance = async (req, res, next) => {
  try {
    const userId = req.user._id;
    logger.info("getCurrentBalance: Fetching balance for user", { userId });
    const balance = await walletService.getWalletBalance(userId);
    logger.info("getCurrentBalance: Balance fetched successfully", {
      userId,
      balance,
    });
    res.status(200).json({ success: true, balance });
  } catch (err) {
    logger.error("getCurrentBalance: Failed to fetch wallet balance", {
      userId: req.user?._id,
      error: err.message,
    });
    next(err);
  }
};

exports.initiateRecharge = async (req, res, next) => {
  try {
    const userId = req.user._id;
    const { rechargeCardId, couponCode, provider } = req.body;

    logger.info("initiateRecharge: Request received", {
      userId,
      rechargeCardId,
      couponCode,
      provider,
    });

    if (!rechargeCardId) {
      return res
        .status(400)
        .json({ success: false, message: "Recharge cardId is required" });
    }

    const result = await walletService.initiateRecharge(
      userId,
      rechargeCardId,
      provider,
      couponCode,
      Enums.TRANSACTION.DIRECTION.CREDIT,
      Enums.TRANSACTION.TYPE.RECHARGE,
    );

    logger.info("initiateRecharge: Payment order created", result);
    res.status(200).json({ success: true, ...result });
  } catch (err) {
    logger.error("initiateRecharge: Failed", { error: err.message });
    next(err);
  }
};

exports.confirmRecharge = async (req, res, next) => {
  try {
    const paymentData = req.body;
    const userId = req.user?._id || paymentData.user_id;
    logger.info("confirmRecharge: Confirming recharge", {
      userId,
      paymentData,
    });
    const ledgerEntry = await walletService.confirmRecharge(
      userId,
      paymentData,
    );
    logger.info("confirmRecharge: Wallet credited", {
      userId,
      ledgerId: ledgerEntry._id,
    });
    res.status(200).json({
      success: true,
      message: "Recharge successful",
      ledgerId: ledgerEntry._id,
    });
  } catch (err) {
    logger.error("confirmRecharge: Error confirming recharge", {
      error: err.message,
      stack: err.stack,
    });
    next(err);
  }
};

exports.razorpayWebhook = async (req, res, next) => {
  try {
    await webhookService.handleRazorpayWebhook(req);
    res.status(200).json({ success: true });
  } catch (err) {
    logger.error("Razorpay Webhook Error", { error: err.message });
    next(err);
  }
};

exports.phonepeWebhook = async (req, res, next) => {
  try {
    await webhookService.handlePhonepeWebhook(req);
    res.status(200).json({ success: true });
  } catch (err) {
    logger.error("PhonePe Webhook Error", { error: err.message });
    res.status(200).json({ success: false });
  }
};
