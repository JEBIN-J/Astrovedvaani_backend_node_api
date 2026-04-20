const RechargeCard = require("../../models/rechargeCard");
const ApiError = require("../../errors/apiError");

/**
 * Create a new recharge card
 */
exports.createRechargeCardService = async (data, adminId) => {
  const {
    amount,
    bonus,
    discount_type,
    card_mode,
    is_applicable,
    gst_percent,
  } = data;

  if (!amount || amount <= 0) {
    throw new ApiError("Amount must be greater than 0", 400);
  }

  // ✅ Validate values manually before saving
  const validDiscountTypes = ["percentage", "fixed"];
  const validCardModes = ["OFF", "EXTRA"];

  if (discount_type && !validDiscountTypes.includes(discount_type)) {
    throw new ApiError(
      "Invalid discount_type. Must be 'percentage' or 'fixed'",
      400,
    );
  }

  if (card_mode && !validCardModes.includes(card_mode)) {
    throw new ApiError("Invalid card_mode. Must be 'OFF' or 'EXTRA'", 400);
  }

  const card = await RechargeCard.create({
    amount,
    bonus: bonus || 0,
    discount_type: discount_type || null,
    card_mode: card_mode || "EXTRA",
    createdBy: adminId,
    is_applicable,
    gst_percent: gst_percent || 0,
  });

  return card;
};

/**
 * Fetch all recharge cards with pagination
 */
exports.getAllRechargeCardsService = async ({
  page = 1,
  limit = 10,
  query,
}) => {
  const skip = (page - 1) * limit;

  const [cards, total] = await Promise.all([
    RechargeCard.find(query).sort({ createdAt: -1 }).skip(skip).limit(limit),
    RechargeCard.countDocuments(query),
  ]);

  return {
    cards,
    pagination: {
      total,
      page: Number(page),
      limit: Number(limit),
      totalPages: Math.ceil(total / limit),
    },
  };
};

/**
 * Fetch a single recharge card by ID
 */
exports.getRechargeCardByIdService = async (id) => {
  const card = await RechargeCard.findById(id);
  if (!card) throw new ApiError("Recharge card not found", 404);
  return card;
};

/**
 * Update recharge card
 */
exports.updateRechargeCardService = async (id, updates) => {
  const card = await RechargeCard.findById(id);
  if (!card) throw new ApiError("Recharge card not found", 404);

  Object.assign(card, updates);
  await card.save();

  return card;
};

/**
 * Delete recharge card
 */
exports.deleteRechargeCardService = async (id) => {
  const card = await RechargeCard.findById(id);
  if (!card) throw new ApiError("Recharge card not found", 404);

  await card.deleteOne();
  return { message: "Recharge card deleted successfully" };
};
