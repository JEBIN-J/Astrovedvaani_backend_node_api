const { BadRequestError } = require("../../errors");
const Product = require("../../models/Product");
const Enums = require("../../utils/constants");
const logger = require("../../utils/logger");
const slugify = require("slugify");
const CacheService = require("../../utils/redis/cacheService");

async function generateUniqueSlug(name, providedSlug) {
  let baseSlug = providedSlug
    ? slugify(providedSlug, { lower: true, strict: true })
    : slugify(name, { lower: true, strict: true });
  let slug = baseSlug;
  let count = 0;
  while (await Product.exists({ slug })) {
    count += 1;
    slug = `${baseSlug}-${count}`;
  }
  return slug;
}
function normalizePricing({ selling_price, discount }) {
  selling_price = Number(selling_price || 0);
  discount = Number(discount || 0);
  if (selling_price <= 0) {
    throw new Error("Selling price must be greater than zero");
  }
  if (!Number.isInteger(discount) || discount < 0 || discount >= 100) {
    throw new Error("Discount must be an integer between 0 and 99");
  }
  const base_price =
    discount > 0
      ? Number((selling_price / (1 - discount / 100)).toFixed(2))
      : selling_price;
  return {
    base_price,
    selling_price,
    discount,
    final_price: selling_price,
  };
}
exports.addProduct = async (productData) => {
  try {
    if (!productData.variants || productData.variants.length === 0) {
      const pricing = normalizePricing({
        selling_price: productData.selling_price,
        discount: productData.discount,
      });
      Object.assign(productData, pricing);
    }
    if (productData.variants?.length > 0) {
      productData.variants = productData.variants.map((v) => {
        const pricing = normalizePricing({
          selling_price: v.selling_price,
          discount: v.discount,
        });
        return { ...v, ...pricing };
      });
      productData.base_price = 0;
      productData.selling_price = 0;
      productData.discount = 0;
      productData.final_price = 0;
    }
    productData.slug = await generateUniqueSlug(
      productData.name,
      productData.slug,
    );
    const product = new Product(productData);
    await CacheService.clearMatchingKeys("product:list:*");
    return await product.save();
  } catch (err) {
    throw new Error(err.message || "Failed to add product");
  }
};
exports.updateProduct = async (productId, updateData, userId, userRole) => {
  const product = await Product.findById(productId);
  if (!product) throw new Error("Product not found");
  if (
    userRole === Enums.USER.ROLE.VENDOR &&
    product.created_by.toString() !== userId
  ) {
    throw new Error("Unauthorized to update this product");
  }
  const NON_PRICE_FIELDS = [
    "name",
    "summary",
    "description",
    "media",
    "thumbnailImage",
    "is_active",
    "category_id",
  ];
  NON_PRICE_FIELDS.forEach((field) => {
    if (field in updateData) {
      product[field] = updateData[field];
    }
  });
  const isPriceUpdate =
    "selling_price" in updateData || "discount" in updateData;
  if ("gst_percent" in updateData) {
    product.gst_percent = Number(updateData.gst_percent || 0);
  }
  if (isPriceUpdate) {
    const pricing = normalizePricing({
      selling_price: updateData.selling_price ?? product.selling_price,
      discount: updateData.discount ?? product.discount,
    });
    product.base_price = pricing.base_price;
    product.selling_price = pricing.selling_price;
    product.discount = pricing.discount;
    product.final_price = pricing.final_price;
  }
  product.updated_by = userId;
  await product.save();
  await CacheService.clearMatchingKeys("product:list:*");
  return product;
};
exports.getProducts = async (filter = {}, options = {}) => {
  const { page = 1, limit = 10, sort = { createdAt: -1 } } = options;
  const skip = (page - 1) * limit;
  const total = await Product.countDocuments(filter);
  const rawProducts = await Product.find(filter)
    .sort(sort)
    .skip(skip)
    .limit(limit)
    .populate({
      path: "category",
      select: "_id name",
    })
    .populate({
      path: "created_by",
      select: "_id",
    })
    .lean({ virtuals: true });

  const totalPages = Math.ceil(total / limit);

  return {
    docs: rawProducts,
    totalDocs: total,
    totalPages,
    page,
  };
};
exports.deleteProductsService = async (ids) => {
  if (!Array.isArray(ids) || ids.length === 0) {
    throw new Error("No product IDs provided");
  }
  const result = await Product.deleteMany({ _id: { $in: ids } });
  if (result.deletedCount === 0) {
    throw new Error("No products found to delete");
  }
  await CacheService.clearMatchingKeys("product:list:*");
  return {
    deletedCount: result.deletedCount,
    idsDeleted: ids,
  };
};
