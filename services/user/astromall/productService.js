const mongoose = require("mongoose");
const Product = require("../../../models/Product");
const Category = require("../../../models/Category");
const { getProductEssentials } = require("./utils/productUtils");
const { addUserProductStatus } = require("./utils/addUserProductStatus");
const {
  getRecommendations,
  trackProductView,
} = require("./recommendationService");
const { buildPaginationResponse } = require("../../../utils/pagination");
const logger = require("../../../utils/logger");
const Feedback = require("../../../models/Feedback");
const Enums = require("../../../utils/constants");
const CacheService = require("../../../utils/redis/cacheService");
const {
  calculateAverageRating,
} = require("../../astrologer/astrologerService");
const {
  calculateWalletDeduction,
} = require("../../../utils/calculateWalletDeduction");
exports.getProductById = async (id, slug, userId = null) => {
  logger.info(`Fetching product by ID or Slug: ${(id, slug)}`);

  let query = {};

  if (id) {
    query._id = id;
  } else if (slug) {
    query.slug = slug;
  } else {
    throw new Error("Product ID or slug is required");
  }

  const product = await Product.findOne(query)
    .populate("category", "name slug")
    .populate("created_by", "name email")
    .populate("updated_by", "name email")
    .lean();

  if (!product) throw new Error("Product not found");
  const uiPrice = Number(product.selling_price || 0);
  const gstPercent = Number(product.gst_percent || 0);
  product.actualPrice = calculateWalletDeduction(uiPrice, gstPercent);
  if (userId) {
    await trackProductView(userId, product._id);
    logger.info(`Tracked view for user: ${userId} on product: ${product._id}`);
  }
  const [productWithStatus] = await addUserProductStatus([product], userId);
  let recommended = [];
  if (userId) {
    recommended = await getRecommendations(userId);
    logger.info(
      `Fetched ${recommended.length} recommendations for user: ${userId}`,
    );
  }

  return {
    product: productWithStatus,
    recommendations: recommended.slice(0, 6),
  };
};

exports.searchProducts = async (filters) => {
  const {
    query = "",
    category = null,
    minPrice = null,
    maxPrice = null,
    sortRating = null,
    sortPrice = null,
    page = 1,
    limit = 20,
    userId = null,
  } = filters;

  const priceQuery =
    minPrice !== null || maxPrice !== null
      ? {
          $or: [
            {
              final_price: {
                ...(minPrice !== null && { $gte: minPrice }),
                ...(maxPrice !== null && { $lte: maxPrice }),
              },
            },
            {
              "variants.final_price": {
                ...(minPrice !== null && { $gte: minPrice }),
                ...(maxPrice !== null && { $lte: maxPrice }),
              },
            },
          ],
        }
      : {};

  let categoryFilter = {};
  if (category) {
    if (Array.isArray(category)) {
      categoryFilter = { category_id: { $in: category } };
    } else if (typeof category === "string" && category.includes(",")) {
      categoryFilter = { category_id: { $in: category.split(",") } };
    } else {
      categoryFilter = { category_id: category };
    }
  }
  const searchQuery = {
    is_active: true,
    ...(query &&
      query.length >= 3 && {
        $or: [
          { name: { $regex: query, $options: "i" } },
          { description: { $regex: query, $options: "i" } },
          { sku: { $regex: query, $options: "i" } },
          { "variants.sku": { $regex: query, $options: "i" } },
        ],
      }),
    ...categoryFilter,
    ...priceQuery,
  };
  logger.info("[searchProducts] Final search query:", searchQuery);
  let sortField = "createdAt";
  let sortOrder = -1;
  let sortType = "default";
  if (sortPrice) {
    sortField = "final_price";
    sortOrder = sortPrice === "asc" ? 1 : -1;
    sortType = `price:${sortPrice}`;
  } else if (sortRating) {
    sortField = "ratings_avg";
    sortOrder = sortRating === "asc" ? 1 : -1;
    sortType = `rating:${sortRating}`;
  }
  const cacheKeyBase = `product:list:${sortType}`;
  const cacheKey = CacheService.generateKey(
    cacheKeyBase,
    limit,
    page,
    Array.isArray(category) ? category.join(",") : category || "",
    minPrice || "",
    maxPrice || "",
    query || "",
  );
  const cached = await CacheService.get(cacheKey);
  if (cached) {
    logger.info(`Returning cached result for key=${cacheKey}`);
    return cached;
  }
  const [products, totalDocs] = await Promise.all([
    Product.find(searchQuery)
      .sort({ [sortField]: sortOrder })
      .skip((page - 1) * limit)
      .limit(limit)
      .populate("category", "name slug")
      .lean(),
    Product.countDocuments(searchQuery),
  ]);
  const productsWithStatus = await addUserProductStatus(products, userId);
  const result = {
    data: productsWithStatus,
    pagination: buildPaginationResponse({
      totalDocs,
      totalPages: Math.ceil(totalDocs / limit),
      page,
      limit,
    }),
  };
  await CacheService.set(cacheKey, result, 60 * 5);
  return result;
};

exports.getFeaturedProducts = async (limit = 10, userId = null) => {
  const products = await Product.find({ is_active: true })
    .sort({ createdAt: -1 })
    .limit(limit)
    .populate("category", "name slug")
    .lean();

  return await addUserProductStatus(products, userId);
};

exports.fetchProductFeedbacks = async (
  productId,
  page = 1,
  limit = 20,
  filters = {},
) => {
  logger.info("[fetchProductFeedbacks] Function entered");

  if (!productId) {
    logger.error("[fetchProductFeedbacks] Missing productId");
    throw new BadRequestError("Product ID is required");
  }

  logger.info(
    `[fetchProductFeedbacks] Raw inputs | productId=${productId} | page=${page} | limit=${limit} | filters=${JSON.stringify(
      filters,
    )}`,
  );

  let objectId;
  try {
    objectId = new mongoose.Types.ObjectId(productId);
    logger.info(
      `[fetchProductFeedbacks] Successfully converted productId to ObjectId: ${objectId}`,
    );
  } catch (err) {
    logger.error(
      `[fetchProductFeedbacks] Invalid ObjectId conversion for: ${productId}`,
    );
    throw new BadRequestError("Invalid Product ID format");
  }

  const skip = (page - 1) * limit;
  logger.info(
    `[fetchProductFeedbacks] Pagination calculated | skip=${skip}, limit=${limit}`,
  );

  const query = {
    source_id: objectId,
    source_type: Enums.ENTITY.TYPE.PRODUCT, // should be 7000
    is_visible: true,
  };

  if (filters.user_id) {
    query.user_id = new mongoose.Types.ObjectId(filters.user_id);
    logger.info(
      `[fetchProductFeedbacks] Added user_id filter: ${query.user_id}`,
    );
  }
  if (filters.rating) {
    query.rating = filters.rating;
    logger.info(`[fetchProductFeedbacks] Added rating filter: ${query.rating}`);
  }

  logger.info(
    `[fetchProductFeedbacks] Final MongoDB query: ${JSON.stringify(query)}`,
  );

  let feedbacks = [];
  let totalDocs = 0;

  try {
    [feedbacks, totalDocs] = await Promise.all([
      Feedback.find(query)
        .sort({ reviewed_at: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      Feedback.countDocuments(query),
    ]);
    logger.info(`[fetchProductFeedbacks] DB query executed successfully`);
  } catch (dbErr) {
    logger.error(
      `[fetchProductFeedbacks] Error executing MongoDB query`,
      dbErr,
    );
    throw dbErr;
  }

  logger.info(
    `[fetchProductFeedbacks] Query results | totalDocs=${totalDocs} | returned=${feedbacks.length}`,
  );

  if (feedbacks.length > 0) {
    logger.info(
      `[fetchProductFeedbacks] Sample first feedback: ${JSON.stringify(
        feedbacks[0],
      )}`,
    );
  } else {
    logger.warn("[fetchProductFeedbacks] No feedbacks found for this query");
  }

  const pagination = buildPaginationResponse({
    totalDocs,
    totalPages: Math.ceil(totalDocs / limit),
    page,
    limit,
  });

  logger.info(
    `[fetchProductFeedbacks] Pagination response built: ${JSON.stringify(
      pagination,
    )}`,
  );

  logger.info("[fetchProductFeedbacks] Function finished successfully");
  return { feedbacks, pagination };
};
const PRODUCT_CACHE_PREFIX = "product:list";

exports.updateProductRatingAvg = async (productId) => {
  if (!productId) return;
  try {
    logger.info(
      `[updateProductRatingAvg] Start updating for product_id: ${productId}`,
    );
    const feedbacks = await Feedback.find({
      source_id: productId,
      source_type: { $in: [Enums.ENTITY.TYPE.PRODUCT] },
      rating: { $ne: null },
    }).select("rating");

    let avg = 0;
    if (feedbacks.length > 0) {
      avg = calculateAverageRating(feedbacks);
    }

    const updated = await Product.findByIdAndUpdate(
      productId,
      { ratings_avg: avg },
      { new: true },
    );

    await CacheService.clearMatchingKeys(PRODUCT_CACHE_PREFIX);

    logger.info(
      `[updateProductRatingAvg] Updated ratings_avg=${avg} for product_id=${productId}`,
    );
  } catch (err) {
    logger.error("[updateProductRatingAvg] Error:", err);
  }
};

exports.getProductEssentials = getProductEssentials;
