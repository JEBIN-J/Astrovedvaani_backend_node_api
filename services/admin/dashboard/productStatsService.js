const Product = require("../../../models/Product");

const RECENT_PRODUCT_DAYS = 3;

function getRecentProductDate() {
  return new Date(Date.now() - RECENT_PRODUCT_DAYS * 24 * 60 * 60 * 1000);
}

async function getProductStats() {
  const recentDate = getRecentProductDate();
  const [total, recent, inactive] = await Promise.all([
    Product.countDocuments(),
    Product.countDocuments({ createdAt: { $gte: recentDate } }),
  ]);

  return {
    total,
    recent,
    inactive,
  };
}
module.exports = { getProductStats };
