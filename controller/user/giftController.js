const giftService = require('../../services/user/userGiftService');
const asyncHandler = require('../../middlewares/asyncHandler');

exports.buyGift = asyncHandler(async (req, res) => {
  const userId = req.user._id;
  const giftId =  req.query.giftId;
  const gift = await giftService.buyGift(userId,giftId);
  res.status(201).json({ success: true, data: gift });
});

exports.getMyGifts = asyncHandler(async (req, res) => {
  const userId = req.user._id;
  const gifts = await giftService.getMyGifts(userId);
  res.status(200).json({
    success: true,
    data: gifts
  });
});

exports.sendGift = asyncHandler(async (req, res) => {
  const userId = req.user._id;
  const giftId =  req.query.giftId;
  const astrologerUserId =  req.query.astrologerUserId;
  const sessionId = req.query.liveSessionId;
  const gift = await giftService.sendGift(userId,giftId,astrologerUserId, sessionId );
  res.status(200).json({ success: true, data: gift });
});