const {
  BadRequestError,
  ConflictError,
  NotFoundError
} = require("../../errors");

const AstrologerServiceRateRequests = require("../../models/AstrologerServiceRateRequests");
const Enums = require("../../utils/constants");
const { buildPaginationResponse } = require("../../utils/pagination");

const mapRequest = (doc) => {
  return {
    id: doc._id,
    // astrologerId: doc.astrologer_id,
    serviceType: doc.service_type,
    requestedRate: doc.requested_rate,
    requestedCommissionPct: doc.requested_commission_pct ?? null,
    status: doc.status,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt
  };
};

const createRequest = async ({
  astrologerId,
  serviceType,
  rate,
  commissionPct
}) => {

  if (rate == null || rate < 0) {
    throw new BadRequestError('Rate must be >= 0');
  }

  if (commissionPct !== undefined) {
    if (commissionPct < 0 || commissionPct > 100) {
      throw new BadRequestError('Commission must be between 0 and 100');
    }
  }

  const existingPending = await AstrologerServiceRateRequests.findOne({
    astrologer_id: astrologerId,
    service_type: serviceType,
    status: Enums.USER.VERIFICATION_STATUS.PENDING
  });

  if (existingPending) {
    throw new ConflictError('Pending request already exists for this service');
  }

  const currentRate = await AstrologerServiceRateRequests.findOne({
    astrologer_id: astrologerId,
    service_type: serviceType
  });

  if (currentRate && currentRate.requested_rate === rate) {
    throw new ConflictError('Requested rate is same as current rate');
  }

  try {
    const payload = {
      astrologer_id: astrologerId,
      service_type: serviceType,
      requested_rate: rate
    };

    if (commissionPct !== undefined) {
      payload.requested_commission_pct = commissionPct;
    }

    const request = await AstrologerServiceRateRequests.create(payload);

    return mapRequest(request);

  } catch (err) {
    if (err.code === 11000) {
      throw new ConflictError('Pending request already exists (race condition)');
    }
    throw err;
  }
};

const getRequests = async ({
  astrologerId,
  status,
  serviceType,
  page = 1,
  limit = 10
}) => {

  const query = {
    astrologer_id: astrologerId
  };

  if (status !== undefined) query.status = status;
  if (serviceType !== undefined) query.service_type = serviceType;

  const skip = (page - 1) * limit;

  const [docs, totalDocs] = await Promise.all([
    AstrologerServiceRateRequests.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit),

    AstrologerServiceRateRequests.countDocuments(query)
  ]);

  return {
    data: docs.map(mapRequest),
    pagination: buildPaginationResponse({
      totalDocs,
      totalPages: Math.ceil(totalDocs / limit),
      page,
      limit
    })
  };
};

const updateRequest = async ({
  requestId,
  astrologerId,
  rate,
  commissionPct
}) => {

  const request = await AstrologerServiceRateRequests.findOne({
    _id: requestId,
    astrologer_id: astrologerId
  });

  if (!request) {
    throw new NotFoundError('Request not found');
  }

  if (request.status !== Enums.USER.VERIFICATION_STATUS.PENDING) {
    throw new ConflictError('Only pending requests can be updated');
  }

  if (rate !== undefined) {
    if (rate < 0) throw new BadRequestError('Rate must be >= 0');
    request.requested_rate = rate;
  }

  if (commissionPct !== undefined) {
    if (commissionPct < 0 || commissionPct > 100) {
      throw new BadRequestError('Commission must be between 0 and 100');
    }
    request.requested_commission_pct = commissionPct;
  }

  await request.save();

  return mapRequest(request);
};

const deleteRequest = async ({ requestId, astrologerId }) => {

  const request = await AstrologerServiceRateRequests.findOne({
    _id: requestId,
    astrologer_id: astrologerId
  });

  if (!request) {
    throw new NotFoundError('Request not found');
  }

  if (request.status !== Enums.USER.VERIFICATION_STATUS.PENDING) {
    throw new ConflictError('Only pending requests can be deleted');
  }

  await request.deleteOne();

  return { success: true };
};

module.exports = {
  createRequest,
  getRequests,
  updateRequest,
  deleteRequest
};