const Coupon = require("../../models/Coupan");
const { NotFoundError } = require("../../errors");
const logger = require("../../utils/logger");
const Wallet = require("../../models/Wallet");
const WalletLedger = require("../../models/Ledger");
const Enums = require("../../utils/constants");
const addCoupon = async (data, adminId) => {
  const coupon = new Coupon({ ...data, createdBy: adminId });
  const savedCoupon = await coupon.save();
  logger.info(`Coupon created in DB: ${savedCoupon._id} by admin: ${adminId}`);
  return savedCoupon;
};
const getAllCoupons = async (
  userId,
  page = 1,
  limit = 10,
  search = "",
  flag = false,
) => {
  const skip = (page - 1) * limit;
  const filter = {};

  // Search by code
  if (search) {
    filter.code = { $regex: search, $options: "i" }; // case-insensitive
  }

  // Only active and valid coupons
  if (flag) {
    const now = new Date();
    filter.is_active = true;
    filter.valid_from = { $lte: now };
    filter.valid_until = { $gte: now };
  }
  console.log(userId);
  // Step 1 — Find wallet of user
  const wallet = await Wallet.findOne({ user_id: userId });
  if (!wallet) {
    throw new Error("User wallet not found");
  }

  // Step 2 — Find coupon codes already used by this user
  const usedCoupons = await WalletLedger.find({
    wallet_id: wallet._id,
    "metadata.coupon_code": { $exists: true },
    payment_status: Enums.PAYMENT.STATUS.PAID,
  }).distinct("metadata.coupon_code"); // Get only used coupon codes

  // Step 3 — Exclude already used coupons
  if (usedCoupons.length > 0) {
    filter.code = filter.code
      ? { $regex: search, $options: "i", $nin: usedCoupons }
      : { $nin: usedCoupons };
  }

  const totalDocs = await Coupon.countDocuments(filter);

  const coupons = await Coupon.find(filter)
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limit);

  logger.info(
    `Fetched coupons from DB for user ${userId}. Page: ${page}, Count: ${coupons.length}, Total: ${totalDocs}, Search: "${search}", ActiveOnly: ${flag}`,
  );

  return { coupons, totalDocs };
};

const getCouponById = async (id) => {
  const coupon = await Coupon.findById(id);
  if (!coupon) {
    logger.info(`Coupon not found in DB: ${id}`);
    throw new NotFoundError("Coupon not found");
  }
  logger.info(`Fetched coupon from DB: ${coupon._id}`);
  return coupon;
};
const updateCoupon = async (id, data, adminId) => {
  const coupon = await Coupon.findByIdAndUpdate(
    id,
    { ...data, updatedBy: adminId },
    { new: true, runValidators: true },
  );
  if (!coupon) {
    logger.info(`Coupon not found for update: ${id}`);
    throw new NotFoundError("Coupon not found");
  }
  logger.info(`Coupon updated in DB: ${coupon._id} by admin: ${adminId}`);
  return coupon;
};

const deleteCoupon = async (id) => {
  const coupon = await Coupon.findByIdAndDelete(id);
  if (!coupon) {
    logger.info(`Coupon not found for deletion: ${id}`);
    throw new NotFoundError("Coupon not found");
  }
  logger.info(`Coupon deleted from DB: ${coupon._id}`);
  return coupon;
};
module.exports = {
  getAllCoupons,
  getCouponById,
  addCoupon,
  updateCoupon,
  deleteCoupon,
};
