const couponService = require("../../services/admin/couponService");
const asyncHandler = require("../../middlewares/asyncHandler");
const { buildPaginationResponse } = require("../../utils/pagination");
const Enums = require("../../utils/constants");

exports.addCoupon = asyncHandler(async (req, res) => {
  const adminId = req.user._id;
  const coupon = await couponService.addCoupon(req.body, adminId);
  res.status(201).json({ success: true, data: coupon });
});

exports.getAllCoupons = asyncHandler(async (req, res) => {
  const userId = req.user._id;
  console.log(userId);
  const page = parseInt(req.query.page, 10) || 1;
  const limit = parseInt(req.query.limit, 10) || 10;
  const search = req.query.search || "";
  const flag = req.user.role === Enums.USER.ROLE.USER ? true : false;
  const { coupons, totalDocs } = await couponService.getAllCoupons(
    userId,
    page,
    limit,
    search,
    flag,
  );

  const pagination = buildPaginationResponse({
    totalDocs,
    totalPages: Math.ceil(totalDocs / limit),
    page,
    limit,
  });

  res.status(200).json({
    success: true,
    data: coupons,
    pagination,
  });
});

exports.getCouponById = asyncHandler(async (req, res) => {
  const coupon = await couponService.getCouponById(req.query.id);
  res.status(200).json({ success: true, data: coupon });
});

exports.updateCoupon = asyncHandler(async (req, res) => {
  const adminId = req.user._id;
  const coupon = await couponService.updateCoupon(
    req.query.id,
    req.body,
    adminId,
  );
  res.status(200).json({ success: true, data: coupon });
});

exports.deleteCoupon = asyncHandler(async (req, res) => {
  await couponService.deleteCoupon(req.query.id);
  res
    .status(200)
    .json({ success: true, message: "Coupon deleted successfully" });
});
