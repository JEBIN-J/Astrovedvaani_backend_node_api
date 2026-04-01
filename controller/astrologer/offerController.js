const { BadRequestError } = require('../../errors');
const asyncHandler = require('../../middlewares/asyncHandler');
const astrologerOfferService = require('../../services/astrologer/astrologerOfferService');

// CREATE / UPDATE
exports.createOrUpdateOffers = asyncHandler(async (req, res) => {
  const astrologerUserId = req.user._id;
  const { offers } = req.body;

  if (!offers || !Array.isArray(offers)) {
    throw new BadRequestError("Offers array is required");
  }

  const result = await astrologerOfferService.createOrUpdateOffers(
    astrologerUserId,
    offers
  );

  res.status(200).json({
    success: true,
    message: "Offers saved successfully",
    data: result,
  });
});


// GET
exports.getOffers = asyncHandler(async (req, res) => {
  const astrologerUserId = req.user._id;

  const result = await astrologerOfferService.getOffers(astrologerUserId);

  res.status(200).json({
    success: true,
    data: result,
  });
});


// DELETE BY SERVICE TYPE
exports.deleteOfferByServiceType = asyncHandler(async (req, res) => {
  const astrologerUserId = req.user._id;
  const { service_type } = req.params;

  if (!service_type || isNaN(service_type)) {
    throw new BadRequestError("Valid service_type is required");
  }

  await astrologerOfferService.deleteOfferByServiceType(
    astrologerUserId,
    Number(service_type)
  );

  res.status(200).json({
    success: true,
    message: "Offer deleted successfully",
  });
});


// DELETE ALL
exports.deleteAllOffers = asyncHandler(async (req, res) => {
  const astrologerUserId = req.user._id;

  await astrologerOfferService.deleteAllOffers(astrologerUserId);

  res.status(200).json({
    success: true,
    message: "All offers deleted successfully",
  });
});