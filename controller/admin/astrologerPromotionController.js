const promotionService = require("../../services/admin/astrologerPromotionService");
const { buildPaginationResponse } = require("../../utils/pagination");

const createPromotion = async (req, res) => {
  try {
    const promotion = await promotionService.createPromotion({
      ...req.body,
      createdBy: req.admin?._id,
    });
    return res.status(201).json({
      success: true,
      data: promotion,
      message: "Promotion created successfully",
    });
  } catch (err) {
    return res
      .status(err.statusCode || 500)
      .json({ success: false, message: err.message });
  }
};
const updatePromotion = async (req, res) => {
  try {
    const promotion = await promotionService.updatePromotion(req.params.id, {
      ...req.body,
      updatedBy: req.admin?._id,
    });
    return res.status(201).json({
      success: true,
      data: promotion,
      message: "Promotion updated successfully",
    });
  } catch (err) {
    return res
      .status(err.statusCode || 500)
      .json({ success: false, message: err.message });
  }
};

const listPromotions = async (req, res) => {
  try {
    const page = parseInt(req.query.page || 1, 10);
    const limit = parseInt(req.query.limit || 10, 10);
    const search = req.query.search || "";

    const { promotions, total } = await promotionService.listPromotionsForAdmin(
      {
        page,
        limit,
        search,
      },
    );

    return res.status(200).json({
      success: true,
      data: promotions,
      pagination: buildPaginationResponse({
        totalDocs: total,
        totalPages: Math.ceil(total / limit),
        page,
        limit,
      }),
      message: "Promotions listed successfully",
    });
  } catch (err) {
    return res.status(err.statusCode || 500).json({
      success: false,
      message: err.message,
    });
  }
};

const deactivatePromotion = async (req, res) => {
  try {
    const promotion = await promotionService.deactivatePromotion(req.params.id);
    return res.status(200).json({
      success: true,
      data: promotion,
      message: "Promotion deactivated successfully",
    });
  } catch (err) {
    return res
      .status(err.statusCode || 500)
      .json({ success: false, message: err.message });
  }
};

module.exports = {
  createPromotion,
  listPromotions,
  deactivatePromotion,
  updatePromotion,
};
