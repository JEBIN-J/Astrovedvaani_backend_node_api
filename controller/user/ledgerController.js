const ledgerService = require('../../services/user/ledgerService');

exports.getUserLedger = async (req, res, next) => {
  try {
    const userId = req.user._id;
    const { page = 1, limit = 20, ...filters } = req.query;
    const response = await ledgerService.fetchUserLedger(
      userId,
      parseInt(page),
      parseInt(limit),
      filters
    );
    res.status(200).json({ success: true, data: response });
  } catch (err) {
    next(err);
  }
};
