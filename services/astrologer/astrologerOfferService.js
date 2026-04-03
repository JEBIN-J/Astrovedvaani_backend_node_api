const { NotFoundError, BadRequestError } = require("../../errors");
const Astrologer = require("../../models/Astrologer");
const AstrologerOffer = require("../../models/AstrologerOfferSchema");
const Enums = require("../../utils/constants");
const CacheService = require("../../utils/redis/cacheService");

const MAX_PERCENTAGE_DISCOUNT = 50;
const ASTROLOGER_CACHE_PREFIX = "astro:list";

const OFFER_CACHE_PREFIX = "astro:offers";
const OFFER_TTL = 6000 * 2;

function emitAstrologerOfferUpdate(astrologer_id) {
  const { emitAstrologerAvailability } = require("../socket/handleAstrologerEvents");

  emitAstrologerAvailability({
    astrologer_id,
    type: "OFFER_UPDATED",
  });
}
async function getAstrologerId(userId) {
  const astrologer = await Astrologer.findOne(
    { user_id: userId },
    { _id: 1 }
  ).lean();

  if (!astrologer) {
    throw new NotFoundError("Astrologer not found");
  }

  return astrologer._id;
}
function validateAndNormalizeOffers(offers) {
  const seen = new Set();
  const now = new Date();

  return offers.map((offer) => {
    let {
      service_type,
      discount_type = "PERCENTAGE",
      discount_value,
      start_time,
      end_time,
      is_active = true,
    } = offer;

    if (!service_type) {
      throw new BadRequestError("service_type is required");
    }

    if (discount_value === undefined || discount_value === null) {
      throw new BadRequestError("discount_value is required");
    }

    if (!Object.values(Enums.SERVICE.TYPE).includes(service_type)) {
      throw new BadRequestError(`Invalid service_type: ${service_type}`);
    }

    if (seen.has(service_type)) {
      throw new BadRequestError("Duplicate service_type not allowed");
    }
    seen.add(service_type);

    if (discount_value < 0) {
      throw new BadRequestError("discount_value cannot be negative");
    }

    if (discount_type === "PERCENTAGE") {
      if (discount_value > MAX_PERCENTAGE_DISCOUNT) {
        throw new BadRequestError(
          `Max allowed percentage discount is ${MAX_PERCENTAGE_DISCOUNT}`
        );
      }
    }

    // ✅ Normalize time
    const start = start_time ? new Date(start_time) : now;
    const end = end_time ? new Date(end_time) : null;

    if (start_time && isNaN(start)) {
      throw new BadRequestError("Invalid start_time");
    }

    if (end_time && isNaN(end)) {
      throw new BadRequestError("Invalid end_time");
    }

    if (end && start >= end) {
      throw new BadRequestError("Invalid offer time range");
    }

    return {
      service_type,
      discount_type,
      discount_value,
      start_time: start,
      end_time: end,
      is_active,
    };
  });
}
function computeIsCurrentlyActive(offer) {
  const now = new Date();

  return (
    offer.is_active === true &&
    offer.start_time <= now &&
    (!offer.end_time || offer.end_time > now)
  );
}
async function createOrUpdateOffers(userId, offers) {
  const astrologer_id = await getAstrologerId(userId);

  const normalizedOffers = validateAndNormalizeOffers(offers);

  await CacheService.clearMatchingKeys(ASTROLOGER_CACHE_PREFIX);

  const offerCacheKey = CacheService.generateKey(OFFER_CACHE_PREFIX, astrologer_id);
  await CacheService.del(offerCacheKey);

  emitAstrologerOfferUpdate(astrologer_id);

  const updatedDoc = await AstrologerOffer.findOneAndUpdate(
    { astrologer_id },
    {
      $set: { offers: normalizedOffers },
    },
    {
      new: true,
      upsert: true,
      runValidators: true,
    }
  ).lean();

  return formatResponse(updatedDoc);
}
async function getOffers(userId) {
  const astrologer_id = await getAstrologerId(userId);
  const cacheKey = CacheService.generateKey(OFFER_CACHE_PREFIX, astrologer_id);
  let doc = await CacheService.get(cacheKey);
  if (!doc) {
    doc = await AstrologerOffer.findOne(
      { astrologer_id },
      { offers: 1 }
    ).lean();
    await CacheService.set(cacheKey, doc || { offers: [] }, OFFER_TTL);
  }
  if (!doc) return { offers: [] };
  return formatResponse(doc);
}
async function deleteOfferByServiceType(userId, serviceType) {
  const astrologer_id = await getAstrologerId(userId);
  const result = await AstrologerOffer.updateOne(
    { astrologer_id },
    {
      $pull: {
        offers: { service_type: serviceType },
      },
    }
  );
  if (result.matchedCount === 0) {
    throw new NotFoundError("Offers not found");
  }
  await CacheService.clearMatchingKeys(ASTROLOGER_CACHE_PREFIX);
  const offerCacheKey = CacheService.generateKey(OFFER_CACHE_PREFIX, astrologer_id);
  await CacheService.del(offerCacheKey);
  emitAstrologerOfferUpdate(astrologer_id);
}
async function deleteAllOffers(userId) {
  const astrologer_id = await getAstrologerId(userId);
  const result = await AstrologerOffer.updateOne(
    { astrologer_id },
    {
      $set: { offers: [] },
    }
  );
  if (result.matchedCount === 0) {
    throw new NotFoundError("Offers not found");
  }
  await CacheService.clearMatchingKeys(ASTROLOGER_CACHE_PREFIX);
  const offerCacheKey = CacheService.generateKey(OFFER_CACHE_PREFIX, astrologer_id);
  await CacheService.del(offerCacheKey);
  emitAstrologerOfferUpdate(astrologer_id);
}
function formatResponse(doc) {
  const offers = (doc.offers || []).map((offer) => ({
    service_type: offer.service_type,
    discount_type: offer.discount_type,
    discount_value: offer.discount_value,
    start_time: offer.start_time,
    end_time: offer.end_time,
    is_active: offer.is_active,
    is_currently_active: computeIsCurrentlyActive(offer), // 🔥 key fix
  }));

  return { offers };
}

async function applyOffersOnRates(astrologer_id, rates) {
  if (!rates || rates.length === 0) {
    return [];
  }
  const cacheKey = CacheService.generateKey(OFFER_CACHE_PREFIX, astrologer_id);
  let offerDoc = await CacheService.get(cacheKey);
  if (offerDoc === null) {
    offerDoc = await AstrologerOffer.findOne(
      { astrologer_id },
      { offers: 1 }
    ).lean();
    await CacheService.set(cacheKey, offerDoc || { offers: [] }, OFFER_TTL);
  }
  if (!offerDoc || !offerDoc.offers || offerDoc.offers.length === 0) {
    return rates.map((rate) => ({
      ...rate,
      final_rate: Number(rate.rate),
      discount_applied: false,
    }));
  }
  const now = new Date();
  const offerMap = new Map();
  for (const offer of offerDoc.offers) {
    const isActive =
      offer.is_active === true &&
      offer.start_time <= now &&
      (!offer.end_time || offer.end_time > now);
    if (isActive) {
      offerMap.set(offer.service_type, offer);
    }
  }
  return rates.map((rate) => {
    const baseRate = Number(rate.rate);
    if (isNaN(baseRate)) {
      throw new Error(
        `Invalid rate for service_type=${rate.service_type}`
      );
    }
    const offer = offerMap.get(rate.service_type);
    if (!offer) {
      return {
        ...rate,
        final_rate: baseRate,
        discount_applied: false,
      };
    }
    let final_rate = baseRate;
    if (offer.discount_type === "PERCENTAGE") {
      final_rate = baseRate - (baseRate * offer.discount_value) / 100;
    } else if (offer.discount_type === "FLAT") {
      final_rate = baseRate - offer.discount_value;
    }
    final_rate = Math.max(0, Math.round(final_rate));
    return {
      ...rate,
      final_rate,
      discount_applied: true,
    };
  });
}

module.exports = {
  createOrUpdateOffers,
  getOffers,
  deleteOfferByServiceType,
  deleteAllOffers,
  applyOffersOnRates,
};