const walletService = require('../../services/user/walletService');
const logger = require('../../utils/logger');

exports.getCurrentBalance = async (req, res, next) => {
  try {
    const userId = req.query.userId||req.user._id;
    logger.info('getCurrentBalance: Fetching balance for user', { userId });
    const balance = await walletService.getWalletBalance(userId);
    logger.info('getCurrentBalance: Balance fetched successfully', { userId, balance });
    res.status(200).json({ success: true, balance });
  } catch (err) {
    logger.error('getCurrentBalance: Failed to fetch wallet balance', {
      userId: req.user?._id,
      error: err.message,
    });
    next(err);
  }
};