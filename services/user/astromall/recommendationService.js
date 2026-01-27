const Product = require("../../../models/Product");
const UserBehavior = require("../../../models/UserBehavior");
const cache = require("../../../utils/redis/cacheService");
const { getProductEssentials } = require("./utils/productUtils");

// Track user behavior
exports.trackProductView = async (userId, productId) => {
  try {
    await UserBehavior.findOneAndUpdate(
      { user: userId },
      {
        $addToSet: {
          viewedProducts: {
            product: productId,
            viewCount: 0,
            lastViewed: new Date(),
          },
        },
      },
      { upsert: true },
    );
    await UserBehavior.findOneAndUpdate(
      { user: userId },
      {
        $inc: { "viewedProducts.$[elem].viewCount": 1 },
        $set: { "viewedProducts.$[elem].lastViewed": new Date() },
      },
      {
        arrayFilters: [{ "elem.product": productId }],
        new: true,
      },
    );
    cache.del(`user:${userId}:recs`);
  } catch (error) {
    console.error("Tracking error:", error);
  }
};

// Get recommendations for user
exports.getRecommendations = async (userId, context = {}) => {
  const cacheKey = `user:${userId}:recs`;
  try {
    // Check cache first
    const cached = await cache.get(cacheKey);
    if (cached) return cached;

    const recommendations = await calculateRecommendations(userId, context);

    // Cache for 1 hour
    await cache.set(cacheKey, recommendations, 3600);
    return recommendations;
  } catch (error) {
    console.error("Recommendation error:", error);
    return getFallbackRecommendations(context);
  }
};

async function calculateRecommendations(userId, context = {}) {
  const { currentProductId, limit = 12 } = context;

  const [userBehavior, currentProduct] = await Promise.all([
    userId
      ? UserBehavior.findOne({ user: userId })
          .populate("viewedProducts.product", "category_id")
          .lean()
      : null,
    currentProductId
      ? Product.findById(currentProductId)
          .select("category_id final_price slug")
          .lean()
      : null,
  ]);

  // Determine recommendation strategies based on available data
  const strategies = [];

  // 1. Current product context strategies
  if (currentProduct) {
    strategies.push(
      getSimilarByCategory(currentProduct),
      getSimilarByPriceRange(currentProduct),
    );
  }

  // 2. User behavior strategies
  if (userBehavior) {
    const topCategories = getTopCategories(userBehavior);
    const recentProducts = getRecentProducts(userBehavior, currentProductId);

    if (topCategories.length) {
      strategies.push(getPersonalizedRecommendations(topCategories));
    }
    if (recentProducts.length) {
      strategies.push(getComplementaryProducts(recentProducts));
    }
  }

  // 3. Always include trending/fallback
  strategies.push(getTrendingProducts());

  // Execute strategies in parallel
  const results = await Promise.all(strategies);
  const merged = [].concat(...results);

  // Deduplicate and score recommendations
  const scoredRecs = scoreRecommendations(merged, currentProductId);

  // Get full product data for top recommendations
  const topRecIds = scoredRecs.slice(0, limit).map((r) => r._id);
  return getProductEssentials(topRecIds);
}

function scoreRecommendations(products, excludeId) {
  const scored = new Map();

  products.forEach((product) => {
    const productId = product._id.toString();
    if (excludeId && productId === excludeId.toString()) return;

    if (scored.has(productId)) {
      const existing = scored.get(productId);
      existing.score += 1;
    } else {
      scored.set(productId, {
        _id: productId,
        score: 1,
        ...product,
      });
    }
  });

  return Array.from(scored.values()).sort(
    (a, b) => b.score - a.score || b.createdAt - a.createdAt,
  );
}

async function getFallbackRecommendations(context = {}) {
  const { limit = 12 } = context;
  return Product.find({ is_active: true })
    .sort({ createdAt: -1 })
    .limit(limit)
    .select("_id name category_id final_price media slug description summary")
    .populate("category", "name slug")
    .lean();
}

function getTopCategories(userBehavior) {
  const categoryCounts = {};

  userBehavior.viewedProducts.forEach((item) => {
    if (item.product?.category_id) {
      const catId = item.product.category_id.toString();
      categoryCounts[catId] = (categoryCounts[catId] || 0) + item.viewCount;
    }
  });

  return Object.entries(categoryCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([catId]) => catId);
}

function getRecentProducts(userBehavior, excludeId) {
  return userBehavior.viewedProducts
    .filter(
      (item) =>
        !excludeId || item.product._id.toString() !== excludeId.toString(),
    )
    .sort((a, b) => b.lastViewed - a.lastViewed)
    .slice(0, 5)
    .map((item) => item.product);
}

async function getSimilarByCategory(product) {
  return Product.find({
    category_id: product.category_id,
    is_active: true,
    _id: { $ne: product._id },
  })
    .sort({ createdAt: -1 })
    .limit(8)
    .select("_id category_id final_price createdAt slug summary description")
    .lean();
}

async function getSimilarByPriceRange(product) {
  const priceRange = product.final_price * 0.3;
  return Product.find({
    final_price: {
      $gte: product.final_price - priceRange,
      $lte: product.final_price + priceRange,
    },
    is_active: true,
    _id: { $ne: product._id },
  })
    .sort({ final_price: 1 })
    .limit(8)
    .select("_id category_id final_price createdAt slug summary description")
    .lean();
}

async function getPersonalizedRecommendations(categoryIds) {
  return Product.find({
    category_id: { $in: categoryIds },
    is_active: true,
  })
    .sort({ createdAt: -1 })
    .limit(8)
    .select("_id category_id final_price createdAt slug summary description")
    .lean();
}

async function getTrendingProducts() {
  return Product.aggregate([
    { $match: { is_active: true } },
    { $sample: { size: 8 } },
    {
      $project: {
        _id: 1,
        category_id: 1,
        final_price: 1,
        slug: 1,
        description: 1,
        summary: 1,
        createdAt: 1,
      },
    },
  ]);
}

async function getComplementaryProducts(products) {
  const categories = [...new Set(products.map((p) => p.category_id))];
  return Product.find({
    category_id: { $in: categories },
    is_active: true,
    _id: { $nin: products.map((p) => p._id) },
  })
    .limit(8)
    .select("_id category_id final_price createdAt slug summary description")
    .lean();
}
