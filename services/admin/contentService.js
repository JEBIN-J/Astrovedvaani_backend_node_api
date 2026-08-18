const { BadRequestError, NotFoundError } = require("../../errors");
const CarouselBanner = require("../../models/CarouselBanner");
const FAQ = require("../../models/FAQ");
const StaticPage = require("../../models/StaticPages");
const Enums = require("../../utils/constants");
const MAX_CHUNK_SIZE = 1024 * 1024; // 1 MB per chunk
const Testimonial = require("../../models/Testimonial");
const logger = require("../../utils/logger");

const Wallet = require("../../models/Wallet");

exports.createCarouselBannerService = async (data, user) => {
  const {
    imageUrl,
    position,
    bannerType,
    redirectId,
    slug,
    isPromotional,
    startDate,
    endDate,
  } = data;

  if (!imageUrl || position === undefined) {
    throw new BadRequestError("imageUrl and position are required");
  }

  const normalizedRedirectId =
    typeof redirectId === "string" && redirectId.trim() !== ""
      ? redirectId.trim()
      : null;

  const normalizedSlug =
    typeof slug === "string" && slug.trim() !== ""
      ? slug.trim()
      : null;


  if (bannerType === undefined || bannerType === null) {
    if (normalizedRedirectId || normalizedSlug) {
      throw new BadRequestError(
        "redirectId or slug is not allowed without bannerType",
      );
    }
  }

  let finalStartDate = null;
  let finalEndDate = null;

  if (isPromotional === true) {
    if (!startDate || !endDate) {
      throw new BadRequestError(
        "startDate and endDate are required when isPromotional is true",
      );
    }

    finalStartDate = new Date(startDate);
    finalEndDate = new Date(endDate);

    if (
      isNaN(finalStartDate.getTime()) ||
      isNaN(finalEndDate.getTime())
    ) {
      throw new BadRequestError(
        "startDate/endDate must be valid dates",
      );
    }

    if (finalStartDate >= finalEndDate) {
      throw new BadRequestError(
        "endDate must be after startDate",
      );
    }
  }


  const banner = new CarouselBanner({
    title: data.title || "",
    imageUrl,
    position,

    bannerType: bannerType ?? null,


    redirectId: normalizedRedirectId,

    slug: normalizedSlug,

    isPromotional: isPromotional === true,

    startDate: finalStartDate,
    endDate: finalEndDate,

    createdBy: user._id,
  });

  return await banner.save();
};
const ADMIN_ROLES = [
  Enums.USER.ROLE.ADMIN,
  Enums.USER.ROLE.SUPER_ADMIN,
];

exports.getCarouselBannersService = async (
  filters,
  page = 1,
  limit = 10,
  user = null,
) => {
  const role = user?.role;
  const hasToken = !!user;

  const isAdminOrNoToken = !hasToken || ADMIN_ROLES.includes(role);

  let walletBalance = 0;

  // Get wallet only for normal logged-in users
  if (hasToken && !ADMIN_ROLES.includes(role)) {
    const wallet = await Wallet.findOne({
      user_id: user._id,
    }).lean();

    walletBalance = wallet?.balance || 0;
  }

  const query = {};

  // isActive filter
  if (filters.isActive !== undefined) {
    query.isActive = filters.isActive === "true";
  }

  // bannerType filter
  if (
    filters.bannerType !== undefined &&
    filters.bannerType !== ""
  ) {
    query.bannerType = Number(filters.bannerType);
  }

  // redirectId filter
  if (filters.redirectId) {
    query.redirectId = filters.redirectId;
  }

  // slug filter
  if (filters.slug) {
    query.slug = filters.slug;
  }

  const now = new Date();

  let promotionalFilter = {};


  if (!hasToken) {
    promotionalFilter = {
      isPromotional: false,
    };
  }


  else if (ADMIN_ROLES.includes(role)) {
    promotionalFilter = {};
  }


  else {
    if (walletBalance > 50) {

      promotionalFilter = {
        isPromotional: {
          $ne: true,
        },
      };
    } else {

      promotionalFilter = {
        $or: [
          {
            isPromotional: {
              $ne: true,
            },
          },
          {
            isPromotional: true,
            startDate: {
              $lte: now,
            },
            endDate: {
              $gte: now,
            },
          },
        ],
      };
    }
  }

  const andConditions = [];

  // Normal filters
  if (Object.keys(query).length > 0) {
    andConditions.push(query);
  }

  // Promotional filter
  if (Object.keys(promotionalFilter).length > 0) {
    andConditions.push(promotionalFilter);
  }

  const finalQuery =
    andConditions.length > 0
      ? {
        $and: andConditions,
      }
      : {};

  const skip = (page - 1) * limit;

  const [banners, totalDocs] = await Promise.all([
    CarouselBanner.find(finalQuery)
      .populate({
        path: "redirectId",
        select: "id name title slug",
      })
      .sort({
        position: 1,
      })
      .skip(skip)
      .limit(limit)
      .lean(),

    CarouselBanner.countDocuments(finalQuery),
  ]);

  const formattedBanners = banners.map(
    ({
      redirectId,
      redirectModel,
      isPromotional,
      ...rest
    }) => ({
      ...rest,

      isPromotional: hasToken ? isPromotional : false,

      redirectData: redirectId || null,
    }),
  );

  return {
    banners: formattedBanners,
    totalDocs,
  };
};
exports.updateCarouselBannerService = async (id, updateData) => {
  if (!id) throw new BadRequestError("Banner ID is required");

  const banner = await CarouselBanner.findById(id);
  if (!banner) throw new NotFoundError("Banner not found");

  const bannerType =
    updateData.bannerType !== undefined
      ? updateData.bannerType
      : banner.bannerType;

  const redirectId =
    updateData.redirectId !== undefined
      ? updateData.redirectId
      : banner.redirectId;

  const slug = updateData.slug !== undefined ? updateData.slug : banner.slug;

  // if (bannerType !== null) {
  //   if (!redirectId && !slug) {
  //     throw new BadRequestError(
  //       "Either redirectId or slug is required when bannerType is provided",
  //     );
  //   }
  // }

  let redirectModel = null;
  if (bannerType && redirectId) {
    switch (bannerType) {
      case Enums.BANNER_TYPE.POOJA_PAGE:
        redirectModel = "PoojaMaster";
        break;
      case Enums.BANNER_TYPE.PRODUCT_PAGE:
        redirectModel = "Product";
        break;
      case Enums.BANNER_TYPE.ASTROLOGER_LISTING_PAGE:
        redirectModel = "Astrologer";
        break;
      case Enums.BANNER_TYPE.BLOG_PAGE:
        redirectModel = "Blog";
        break;
    }
  }

  // ── Promotional type + date-range validation ──
  const isPromotional =
    updateData.isPromotional !== undefined
      ? updateData.isPromotional
      : banner.isPromotional;

  const startDateInput =
    updateData.startDate !== undefined
      ? updateData.startDate
      : banner.startDate;

  const endDateInput =
    updateData.endDate !== undefined ? updateData.endDate : banner.endDate;

  let finalStartDate = null;
  let finalEndDate = null;

  if (isPromotional === true) {
    if (!startDateInput || !endDateInput) {
      throw new BadRequestError(
        "startDate and endDate are required when isPromotional is true",
      );
    }

    finalStartDate = new Date(startDateInput);
    finalEndDate = new Date(endDateInput);

    if (isNaN(finalStartDate.getTime()) || isNaN(finalEndDate.getTime())) {
      throw new BadRequestError("startDate/endDate must be valid dates");
    }

    if (finalStartDate >= finalEndDate) {
      throw new BadRequestError("endDate must be after startDate");
    }
  }

  const updated = await CarouselBanner.findByIdAndUpdate(
    id,
    {
      ...updateData,
      redirectId: redirectId ?? null,
      redirectModel,
      isPromotional: isPromotional === true,
      startDate: finalStartDate,
      endDate: finalEndDate,
    },
    { new: true },
  );

  return updated;
};
exports.deleteCarouselBannerService = async (id) => {
  if (!id) throw new BadRequestError("Banner ID is required");

  const deleted = await CarouselBanner.findByIdAndDelete(id);
  if (!deleted) throw new NotFoundError("Banner not found or already deleted");

  return deleted;
};

exports.setStaticPageService = async (data, user) => {
  const { type, contentType, fileUrl, jsonContent } = data;

  if (!Object.values(Enums.STATIC_PAGE.TYPE).includes(type)) {
    throw new BadRequestError("Invalid or missing static page type");
  }
  if (!Object.values(Enums.STATIC_PAGE.CONTENT_TYPE).includes(contentType)) {
    throw new BadRequestError("Invalid or missing content type");
  }

  const update = {
    contentType,
    updatedBy: user._id,
    updatedAt: new Date(),
  };

  if (contentType === Enums.STATIC_PAGE.CONTENT_TYPE.JSON) {
    if (!jsonContent) {
      throw new BadRequestError(
        "jsonContent is required for JSON content type",
      );
    }

    // Convert large JSON to string and split into chunks
    const jsonString = JSON.stringify(jsonContent);
    if (jsonString.length <= MAX_CHUNK_SIZE) {
      // small JSON, store normally
      update.jsonContent = jsonContent;
    } else {
      // large JSON, store in chunks to prevent "too long" errors
      const chunks = [];
      for (let i = 0; i < jsonString.length; i += MAX_CHUNK_SIZE) {
        chunks.push(jsonString.slice(i, i + MAX_CHUNK_SIZE));
      }
      update.jsonContent = { _chunks: chunks }; // internally store as object
    }

    update.fileUrl = undefined;
  } else if (contentType === Enums.STATIC_PAGE.CONTENT_TYPE.FILE) {
    if (!fileUrl) {
      throw new BadRequestError("fileUrl is required for FILE content type");
    }
    update.fileUrl = fileUrl;
    update.jsonContent = undefined;
  }

  const result = await StaticPage.findOneAndUpdate({ type }, update, {
    upsert: true,
    new: true,
    setDefaultsOnInsert: true,
  });

  return result;
};
exports.getJsonContent = (record) => {
  if (!record.jsonContent) return null;
  if (record.jsonContent._chunks) {
    return JSON.parse(record.jsonContent._chunks.join(""));
  }
  return record.jsonContent;
};
exports.getStaticPagesService = async (query) => {
  const { type } = query;

  if (type !== undefined) {
    if (!Object.values(Enums.STATIC_PAGE.TYPE).includes(type)) {
      throw new BadRequestError(`Invalid static page type '${type}'`);
    }
    const page = await StaticPage.findOne({ type });
    if (!page) throw new NotFoundError(`Static page '${type}' not found`);

    // reconstruct JSONContent if needed
    const pageObj = page.toObject();
    pageObj.jsonContent = exports.getJsonContent(page);

    return pageObj;
  }

  const pages = await StaticPage.find();
  // reconstruct JSONContent for all pages
  return pages.map((p) => {
    const pageObj = p.toObject();
    pageObj.jsonContent = exports.getJsonContent(p);
    return pageObj;
  });
};

exports.getAllTestimonials = async (page = 1, limit = 10, search = "") => {
  const skip = (page - 1) * limit;
  const filter = {};

  if (search) {
    filter.name = { $regex: search, $options: "i" };
  }

  const totalDocs = await Testimonial.countDocuments(filter);

  const testimonials = await Testimonial.find(filter)
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limit);

  logger.info(
    `Fetched testimonials from DB. Page: ${page}, Count: ${testimonials.length}, Total: ${totalDocs}, Search: "${search}"`,
  );

  return { testimonials, totalDocs };
};

exports.getAllFAQs = async (page = 1, limit = 10, search = "") => {
  const skip = (page - 1) * limit;
  const filter = {};

  if (search) {
    filter.question = { $regex: search, $options: "i" };
  }

  const totalDocs = await FAQ.countDocuments(filter);

  const faqs = await FAQ.find(filter)
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limit);

  logger.info(
    `Fetched FAQs from DB. Page: ${page}, Count: ${faqs.length}, Total: ${totalDocs}, Search: "${search}"`,
  );

  return { faqs, totalDocs };
};
