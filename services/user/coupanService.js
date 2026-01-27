const Coupon = require('../../models/Coupan');
const { NotFoundError, ValidationError } = require('../../errors');
const logger = require('../../utils/logger');

/**
 * Apply coupon for a user and return discount/bonus
 * @param {String} userId
 * @param {String} code - coupon code
 * @param {Number} orderTotal - recharge amount
 */
const applyCoupon = async (userId, code, orderTotal) => {
  const now = new Date();

  // 1. Find coupon
  const coupon = await Coupon.findOne({
    code: code.toUpperCase(),
    is_active: true,
    valid_from: { $lte: now },
    valid_until: { $gte: now },
  });
  if (!coupon) {
    logger.info(`[COUPON] Invalid or expired coupon: ${code}`);
    throw new NotFoundError('Invalid or expired coupon code');
  }

  // 2. Check global usage limit
  if (coupon.usage_limit !== null && coupon.used_count >= coupon.usage_limit) {
    logger.info(`[COUPON] Global usage limit reached: ${code}`);
    throw new ValidationError('Coupon usage limit exceeded globally');
  }

  // 3. Check per-user usage limit
  const userUsage = coupon.usage_by_user.find(u => u.user_id.toString() === userId.toString());
  if (coupon.per_user_limit !== null && userUsage && userUsage.count >= coupon.per_user_limit) {
    logger.info(`[COUPON] User has already used coupon max times: ${code}`);
    throw new ValidationError('You have already used this coupon the maximum number of times');
  }

  // 4. Check minimum order value
  if (orderTotal < coupon.min_cart_value) {
    logger.info(`[COUPON] Order total below minimum for coupon: ${code}`);
    throw new ValidationError(`Cart value must be at least ₹${coupon.min_cart_value} to use this coupon`);
  }

  // 5. Calculate discount/bonus
  let discountAmount = coupon.discount_type === 'percentage'
    ? (orderTotal * coupon.discount_value) / 100
    : coupon.discount_value;

  discountAmount = Math.min(discountAmount, orderTotal);
  discountAmount = Number(discountAmount.toFixed(2));

  // 6. Update coupon usage
  coupon.used_count += 1;
  if (userUsage) {
    userUsage.count += 1;
  } else {
    coupon.usage_by_user.push({ user_id: userId, count: 1 });
  }

  await coupon.save();
  logger.info(`[COUPON] Coupon applied successfully: ${code} by user: ${userId}`);

  return {
    couponId: coupon._id,
    code: coupon.code,
    discountAmount,
    discountType: coupon.discount_type,
  };
};

/**
 * Rollback a coupon usage (e.g. if recharge fails)
 * @param {String} userId
 * @param {String} couponId
 */
const rollbackCoupon = async (userId, couponId) => {
  const coupon = await Coupon.findById(couponId);
  if (!coupon) {
    logger.warn(`[COUPON] Cannot rollback, coupon not found: ${couponId}`);
    return;
  }

  coupon.used_count = Math.max(0, coupon.used_count - 1);

  const userUsage = coupon.usage_by_user.find(u => u.user_id.toString() === userId.toString());
  if (userUsage) {
    userUsage.count = Math.max(0, userUsage.count - 1);
  }

  await coupon.save();
  logger.info(`[COUPON] Rolled back coupon usage for user: ${userId}, coupon: ${coupon.code}`);
};

module.exports = {
  applyCoupon,
  rollbackCoupon,
};
