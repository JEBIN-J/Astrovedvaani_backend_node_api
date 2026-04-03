const Service = require('../../services/astrologer/astroRateRequestService');
const asyncHandler = require('../../middlewares/asyncHandler');
const { BadRequestError } = require('../../errors');
const Astrologer = require('../../models/Astrologer');

const createRequest = asyncHandler(async (req, res) => {
  const userId = req.user._id;

  const { serviceType, rate, commissionPct } = req.body;

  if (serviceType == null || rate == null) {
    throw new BadRequestError('serviceType and rate are required');
  }

  const astrologer = await Astrologer.findOne({ user_id: userId });

  if (!astrologer) {
    throw new BadRequestError('Astrologer profile not found');
  }

  const data = await Service.createRequest({
    astrologerId: astrologer._id,
    serviceType,
    rate,
    commissionPct
  });

  return res.status(201).json({
    success: true,
    message: 'Rate change request created successfully',
    data
  });
});

const getRequests = asyncHandler(async (req, res) => {
  const userId = req.user._id;
  const astrologer = await Astrologer.findOne({ user_id: userId });
  if (!astrologer) {
    throw new BadRequestError('Astrologer profile not found');
  }

  const data = await Service.getRequests({
    astrologerId: astrologer._id
  });

  return res.status(200).json({
    success: true,
    message: 'Requests fetched successfully',
    data: data.data
  });
});

const updateRequest = asyncHandler(async (req, res) => {
  const userId = req.user._id;
  const { requestId } = req.params;

  const { rate, commissionPct } = req.body;

  if (rate == null && commissionPct == null) {
    throw new BadRequestError('Nothing to update');
  }

  const astrologer = await Astrologer.findOne({ user_id: userId });

  if (!astrologer) {
    throw new BadRequestError('Astrologer profile not found');
  }

  const data = await Service.updateRequest({
    requestId,
    astrologerId: astrologer._id,
    rate,
    commissionPct
  });

  return res.status(200).json({
    success: true,
    message: 'Request updated successfully',
    data
  });
});

const deleteRequest = asyncHandler(async (req, res) => {
  const userId = req.user._id;
  const { requestId } = req.params;

  const astrologer = await Astrologer.findOne({ user_id: userId });

  if (!astrologer) {
    throw new BadRequestError('Astrologer profile not found');
  }

  await Service.deleteRequest({
    requestId,
    astrologerId: astrologer._id
  });

  return res.status(200).json({
    success: true,
    message: 'Request deleted successfully'
  });
});

module.exports = {
  createRequest,
  getRequests,
  updateRequest,
  deleteRequest
};