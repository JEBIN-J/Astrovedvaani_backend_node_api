const giftService = require("../../services/giftService");
const asyncHandler = require("../../middlewares/asyncHandler");
const { buildPaginationResponse } = require("../../utils/pagination");
const Enums = require("../../utils/constants");

exports.addGift = asyncHandler(async (req, res) => {
  const adminId = req.user._id;
  const gift = await giftService.addGift(req.body, adminId);
  res.status(201).json({ success: true, data: gift });
});

exports.getAllGifts = asyncHandler(async (req, res) => {
  const page = parseInt(req.query.page, 10) || 1;
  const limit = parseInt(req.query.limit, 10) || 10;
  const search = req.query.search || "";

  const userRole = req.user?.role;
  const isAdmin = [
    Enums.USER.ROLE.ADMIN,
    Enums.USER.ROLE.SUPER_ADMIN,
    Enums.USER.ROLE.MODERATOR,
  ].includes(userRole);

  const { gifts, totalDocs } = await giftService.getAllGifts(
    page,
    limit,
    search,
    isAdmin,
  );

  const pagination = buildPaginationResponse({
    totalDocs,
    totalPages: Math.ceil(totalDocs / limit),
    page,
    limit,
  });

  res.status(200).json({
    success: true,
    data: gifts,
    pagination,
  });
});

exports.getGiftById = asyncHandler(async (req, res) => {
  const gift = await giftService.getGiftById(req.query.id);
  res.status(200).json({ success: true, data: gift });
});

exports.updateGift = asyncHandler(async (req, res) => {
  const adminId = req.user._id;
  const gift = await giftService.updateGift(req.query.id, req.body, adminId);
  res.status(200).json({ success: true, data: gift });
});

exports.deleteGift = asyncHandler(async (req, res) => {
  await giftService.deleteGift(req.query.id);
  res.status(200).json({ success: true, message: "Gift deleted successfully" });
});
