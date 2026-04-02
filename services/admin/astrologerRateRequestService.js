const { NotFoundError, ConflictError, BadRequestError } = require("../../errors");
const Astrologer = require("../../models/Astrologer");

const AstrologerServiceRateRequests = require("../../models/AstrologerServiceRateRequests");
const AstrologerServiceRates = require("../../models/AstrologerServiceRates");
const Enums = require("../../utils/constants");
const logger = require("../../utils/logger");
const { buildPaginationResponse } = require("../../utils/pagination");
const CacheService = require("../../utils/redis/cacheService");
const { notifyRateRequestUpdate } = require("../notification/rateRequestNotification");
const { emitAstrologerAvailability } = require("../socket/handleAstrologerEvents");
const ASTROLOGER_CACHE_PREFIX = "astro:list";

const mapRequest = (doc, currentRateMap) => {

  const key = `${doc.astrologer_id?._id}_${doc.service_type}`;
  const current = currentRateMap.get(key);

  return {
    id: doc._id,

    astrologer: doc.astrologer_id
      ? {
        id: doc.astrologer_id._id,
        displayName: doc.astrologer_id.display_name,
        experience: doc.astrologer_id.experience_years,
        isOnline: doc.astrologer_id.is_online
      }
      : null,

    user: doc.astrologer_id?.user_id
      ? {
        id: doc.astrologer_id.user_id._id,
        name: doc.astrologer_id.user_id.name,
        email: doc.astrologer_id.user_id.email,
        mobile: doc.astrologer_id.user_id.mobileNumber
      }
      : null,

    serviceType: doc.service_type,

    current: current
      ? {
        rate: current.rate,
        commissionPct: current.commission_pct
      }
      : null,

    requested: {
      rate: doc.requested_rate,
      commissionPct: doc.requested_commission_pct ?? null
    },

    status: doc.status,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt
  };
};
const getAllRequests = async ({
  status,
  serviceType,
  search,
  page = 1,
  limit = 10
}) => {

  const query = {};

  if (status !== undefined) query.status = status;
  if (serviceType !== undefined) query.service_type = serviceType;

  const skip = (page - 1) * limit;

  const docs = await AstrologerServiceRateRequests.find(query)
    .populate({
      path: "astrologer_id",
      select: "display_name experience_years is_online user_id",
      populate: {
        path: "user_id",
        select: "name email mobileNumber"
      }
    })
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limit);

  // ✅ FIX: in-memory search (safe + works with populate)
  let filteredDocs = docs;

  if (search) {
    const s = search.toLowerCase();

    filteredDocs = docs.filter(doc => {
      const displayName = doc.astrologer_id?.display_name?.toLowerCase() || "";
      const name = doc.astrologer_id?.user_id?.name?.toLowerCase() || "";
      const email = doc.astrologer_id?.user_id?.email?.toLowerCase() || "";

      return (
        displayName.includes(s) ||
        name.includes(s) ||
        email.includes(s)
      );
    });
  }

  const totalDocs = await AstrologerServiceRateRequests.countDocuments(query);

  // current rates
  const rateQuery = filteredDocs.map(d => ({
    astrologer_id: d.astrologer_id?._id,
    service_type: d.service_type
  }));

  const currentRates = await AstrologerServiceRates.find({
    $or: rateQuery.length ? rateQuery : [{}]
  });

  const currentRateMap = new Map();

  currentRates.forEach(r => {
    const key = `${r.astrologer_id}_${r.service_type}`;
    currentRateMap.set(key, r);
  });

  return {
    data: filteredDocs.map(doc => mapRequest(doc, currentRateMap)),
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
  status,
  adminId,
  reason
}) => {

  if (status == null) throw new BadRequestError("Status is required");

  if (
    ![
      Enums.USER.VERIFICATION_STATUS.APPROVED,
      Enums.USER.VERIFICATION_STATUS.REJECTED
    ].includes(status)
  ) {
    throw new BadRequestError("Invalid status update");
  }

  const request = await AstrologerServiceRateRequests.findById(requestId);

  if (!request) throw new NotFoundError("Request not found");

  if (request.status !== Enums.USER.VERIFICATION_STATUS.PENDING) {
    throw new ConflictError("Request already processed");
  }

  const finalReason =
    reason && reason.trim()
      ? reason.trim()
      : status === Enums.USER.VERIFICATION_STATUS.APPROVED
        ? "Approved by admin"
        : "Rejected by admin";

  if (status === Enums.USER.VERIFICATION_STATUS.APPROVED) {

    const existingRate = await AstrologerServiceRates.findOne({
      astrologer_id: request.astrologer_id,
      service_type: request.service_type
    });

    if (!existingRate && request.requested_commission_pct === undefined) {
      throw new BadRequestError("Commission is required for new rate");
    }

    const updatePayload = {
      rate: request.requested_rate
    };

    if (request.requested_commission_pct !== undefined) {
      updatePayload.commission_pct = request.requested_commission_pct;
    }

    const updatedRate = await AstrologerServiceRates.findOneAndUpdate(
      {
        astrologer_id: request.astrologer_id,
        service_type: request.service_type
      },
      updatePayload,
      { upsert: true, new: true }
    );

    request.status = status;
    request.approved_by = adminId;
    request.approved_at = new Date();
    request.approval_reason = finalReason;

    await CacheService.clearMatchingKeys(ASTROLOGER_CACHE_PREFIX);

    const astrologer = await Astrologer.findById(request.astrologer_id)
      .select("user_id is_online isChat isCall isVideo");

    if (astrologer?.user_id) {

      const availabilityPayload = {
        astrologer_user_id: astrologer.user_id,
        is_online: astrologer.is_online,
        isChat: astrologer.isChat,
        isCall: astrologer.isCall,
        isVideo: astrologer.isVideo
      };

      emitAstrologerAvailability(availabilityPayload);

      logger.info(
        `[RateService] Emitted availability refresh for user=${astrologer.user_id}`,
        availabilityPayload
      );
    }
  }

  if (status === Enums.USER.VERIFICATION_STATUS.REJECTED) {
    request.status = status;
    request.rejected_by = adminId;
    request.rejected_at = new Date();
    request.rejection_reason = finalReason;
  }

  await request.save();

  const populated = await AstrologerServiceRateRequests.findById(request._id)
    .populate({
      path: "astrologer_id",
      select: "display_name experience_years is_online user_id",
      populate: {
        path: "user_id",
        select: "name email mobileNumber"
      }
    });

  if (!populated?.astrologer_id?.user_id?._id) {
    logger.error(
      `[RateRequest] Missing user_id for astrologer ${request.astrologer_id}`
    );
  } else {
    notifyRateRequestUpdate({
      astrologerUserId: populated.astrologer_id.user_id._id,
      status: populated.status,
      rate: populated.requested_rate,
      serviceType: populated.service_type
    }).catch(err =>
      logger.error("[RateRequest] Notification failed", err)
    );
  }

  const currentRates = await AstrologerServiceRates.find({
    astrologer_id: populated.astrologer_id?._id,
    service_type: populated.service_type
  });

  const currentRateMap = new Map();
  currentRates.forEach(r => {
    const key = `${r.astrologer_id}_${r.service_type}`;
    currentRateMap.set(key, r);
  });

  return mapRequest(populated, currentRateMap);
};
const deleteRequest = async ({ requestId }) => {

  const request = await AstrologerServiceRateRequests.findById(requestId);

  if (!request) throw new NotFoundError("Request not found");

  // if (request.status !== Enums.USER.VERIFICATION_STATUS.PENDING) {
  //   throw new ConflictError("Only pending requests can be deleted");
  // }

  await request.deleteOne();

  return { success: true };
};
module.exports = {
  getAllRequests,
  updateRequest,
  deleteRequest
};