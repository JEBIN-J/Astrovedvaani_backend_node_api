const rechargeCardService = require("../../services/admin/rechargeCardService");

/**
 * @desc Create Recharge Card
 */
exports.createRechargeCard = async (req, res, next) => {
  try {
    const adminId = req.user._id; // from auth middleware
    const card = await rechargeCardService.createRechargeCardService(
      req.body,
      adminId,
    );
    res.status(201).json({
      success: true,
      message: "Recharge card created successfully",
      data: card,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc Get all Recharge Cards
 */
exports.getAllRechargeCards = async (req, res, next) => {
  try {
    const { page, limit, is_active } = req.query;
    let query = {};
    if (is_active !== undefined) {
      query.is_active = Boolean(is_active);
    }
    const result = await rechargeCardService.getAllRechargeCardsService({
      page,
      limit,
      query,
    });
    res.status(200).json({
      success: true,
      message: "Recharge cards fetched successfully",
      data: result.cards,
      pagination: result.pagination,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc Get Recharge Card by ID
 */
exports.getRechargeCardById = async (req, res, next) => {
  try {
    const card = await rechargeCardService.getRechargeCardByIdService(
      req.query.id,
    );
    res.status(200).json({
      success: true,
      message: "Recharge card fetched successfully",
      data: card,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc Update Recharge Card
 */
exports.updateRechargeCard = async (req, res, next) => {
  try {
    const card = await rechargeCardService.updateRechargeCardService(
      req.query.id,
      req.body,
    );
    res.status(200).json({
      success: true,
      message: "Recharge card updated successfully",
      data: card,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc Delete Recharge Card
 */
exports.deleteRechargeCard = async (req, res, next) => {
  try {
    const result = await rechargeCardService.deleteRechargeCardService(
      req.query.id,
    );
    res.status(200).json({
      success: true,
      message: result.message,
    });
  } catch (error) {
    next(error);
  }
};
