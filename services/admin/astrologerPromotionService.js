const Promotion = require("../../models/AstrologerPromotion");
const Astrologer = require("../../models/Astrologer");
const SessionSetting = require("../../models/SessionSetting");
const Wallet = require("../../models/Wallet");
const { default: mongoose } = require("mongoose");
const AstrologerServiceRates = require("../../models/AstrologerServiceRates");
const {
  ConflictError,
  BadRequestError,
  NotFoundError,
} = require("../../errors");
const validateServices = async (services, astrologers) => {
  const duplicateService = new Set();

  for (const service of services) {
    if (duplicateService.has(service.service_type)) {
      throw new ConflictError("Duplicate service type found.");
    }

    duplicateService.add(service.service_type);

    if (service.promotional_rate < 0) {
      throw new BadRequestError("Promotional rate cannot be negative.");
    }

    if (service.promotional_minutes <= 0) {
      throw new BadRequestError(
        "Promotional minutes should be greater than zero.",
      );
    }

    if (service.commission_pct < 0 || service.commission_pct > 100) {
      throw new BadRequestError("Invalid commission percentage.");
    }
  }

  for (const astrologerId of astrologers) {
    const rates = await AstrologerServiceRates.find({
      astrologer_id: astrologerId,
    });

    for (const promoService of services) {
      const normalRate = rates.find(
        (r) => r.service_type === promoService.service_type,
      );

      if (!normalRate) {
        throw new BadRequestError(
          `Service ${promoService.service_type} not configured for astrologer`,
        );
      }

      if (promoService.promotional_rate > normalRate.rate) {
        throw new BadRequestError(
          "Promotion rate cannot be greater than original rate.",
        );
      }
    }
  }
};
const createPromotion = async ({
  title,
  astrologers,
  services,
  startDate,
  endDate,
  createdBy,
}) => {
  if (!title || !title.trim()) {
    throw new BadRequestError("Title is required.");
  }

  if (!Array.isArray(astrologers) || astrologers.length === 0) {
    throw new BadRequestError("Select at least one astrologer.");
  }

  astrologers = [...new Set(astrologers)];

  for (const id of astrologers) {
    if (!mongoose.Types.ObjectId.isValid(id)) {
      throw new BadRequestError(`Invalid astrologer id ${id}`);
    }
  }

  if (!Array.isArray(services) || services.length === 0) {
    throw new BadRequestError("Configure at least one promotional service.");
  }

  if (!startDate || !endDate) {
    throw new BadRequestError("Start date and end date are required.");
  }

  const start = new Date(startDate);
  const end = new Date(endDate);

  if (start >= end) {
    throw new BadRequestError("End date must be after start date.");
  }

  const existingAstrologers = await Astrologer.find({
    _id: { $in: astrologers },
  });

  if (existingAstrologers.length !== astrologers.length) {
    throw new BadRequestError("One or more astrologers not found.");
  }

  const overlap = await Promotion.findOne({
    astrologers: { $in: astrologers },

    isActive: true,

    $or: [
      {
        startDate: { $lte: end },
        endDate: { $gte: start },
      },
    ],
  });

  if (overlap) {
    throw new ConflictError(
      "Promotion already exists for selected astrologer.",
    );
  }
  await validateServices(services, astrologers);

  return await Promotion.create({
    title: title.trim(),

    astrologers,

    services,

    startDate,

    endDate,

    createdBy,
  });
};

const updatePromotion = async (
  promotionId,
  { title, astrologers, services, startDate, endDate, updatedBy },
) => {
  const promotion = await Promotion.findById(promotionId);

  if (!promotion) {
    throw new NotFoundError("Promotion not found.");
  }

  const finalTitle = title !== undefined ? title.trim() : promotion.title;

  let finalAstrologers =
    astrologers !== undefined
      ? [...new Set(astrologers)]
      : promotion.astrologers;

  const finalServices = services !== undefined ? services : promotion.services;

  const finalStartDate =
    startDate !== undefined ? new Date(startDate) : promotion.startDate;

  const finalEndDate =
    endDate !== undefined ? new Date(endDate) : promotion.endDate;

  if (!promotion) {
    throw new NotFoundError("Promotion not found.");
  }

  if (!promotion.isActive) {
    throw new ConflictError("Inactive promotion cannot be updated.");
  }

  if (promotion.endDate < new Date()) {
    throw new ConflictError("Expired promotion cannot be updated.");
  }
  if (!finalTitle || !finalTitle.trim()) {
    throw new BadRequestError("Title is required.");
  }
  if (!Array.isArray(finalAstrologers) || finalAstrologers.length === 0) {
    throw new BadRequestError("Select at least one astrologer.");
  }

  finalAstrologers = [...new Set(finalAstrologers)];

  for (let id of finalAstrologers) {
    if (!mongoose.Types.ObjectId.isValid(id)) {
      throw new BadRequestError(`Invalid astrologer id ${id}`);
    }
  }
  if (!Array.isArray(finalServices) || finalServices.length === 0) {
    throw new BadRequestError("Configure at least one promotional service.");
  }

  if (!finalAstrologers || !finalEndDate) {
    throw new BadRequestError("Start date and end date are required.");
  }

  const start = new Date(finalStartDate);
  const end = new Date(finalEndDate);

  if (start >= end) {
    throw new BadRequestError("End date must be after start date.");
  }

  const astrologerDocs = await Astrologer.find({
    _id: { $in: finalAstrologers },
  });

  if (astrologerDocs.length !== finalAstrologers.length) {
    throw new BadRequestError("One or more astrologers not found.");
  }

  const overlap = await Promotion.findOne({
    _id: { $ne: promotionId },

    astrologers: { $in: finalAstrologers },

    isActive: true,

    $or: [
      {
        startDate: { $lte: end },
        endDate: { $gte: start },
      },
    ],
  });

  if (overlap) {
    throw new ConflictError(
      "Selected astrologer already has another promotion.",
    );
  }

  await validateServices(finalServices, finalAstrologers);

  promotion.title = finalTitle;
  promotion.astrologers = finalAstrologers;
  promotion.services = finalServices;
  promotion.startDate = start;
  promotion.endDate = end;
  promotion.updatedBy = updatedBy;
  await promotion.save();

  return promotion;
};
const listPromotionsForAdmin = async () => {
  const now = new Date();

  const promotions = await Promotion.find({
    isActive: true,
  })
    .populate("astrologers", "display_name profilePicture")
    .sort({ createdAt: -1 })
    .lean();

  return promotions;
};

const deactivatePromotion = async (promotionId) => {
  const promotion = await Promotion.findByIdAndUpdate(
    promotionId,
    { isActive: false },
    { new: true },
  );

  if (!promotion) {
    throw { statusCode: 404, message: "Promotion not found." };
  }

  return promotion;
};

module.exports = {
  createPromotion,
  listPromotionsForAdmin,
  deactivatePromotion,
  updatePromotion,
};
