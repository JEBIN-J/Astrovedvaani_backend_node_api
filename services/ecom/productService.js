const {
  BadRequestError,
  ValidationError,
  UnauthorizedError,
  NotFoundError,
} = require("../../errors");
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

  if (selling_price < 0) {
    throw new Error("Selling price cannot be negative");
  }

  if (discount < 0 || discount > 100) {
    throw new Error("Discount must be between 0 and 100");
  }

  // Base price ONLY when discount exists
  const base_price =
    discount > 0
      ? Number((selling_price * (1 + discount / 100)).toFixed(2))
      : 0;

  return {
    base_price,
    selling_price,
    discount,

    // IMPORTANT:
    // final_price is UI final price ONLY
    // NEVER use this for wallet deduction
    final_price: selling_price,
  };
}
const ALLOWED_GST_SLABS = [0, 5, 10, 18];

function validateGST(gst) {
  gst = Number(gst || 0);
  if (!ALLOWED_GST_SLABS.includes(gst)) {
    throw new Error("Invalid GST slab. Allowed: 0, 5, 10, 18");
  }
  return gst;
}
exports.addProduct = async (productData) => {
  try {
    // Validate GST
    productData.gst_percent = validateGST(productData.gst_percent);

    // SINGLE PRODUCT
    if (!productData.variants || productData.variants.length === 0) {
      const pricing = normalizePricing({
        selling_price: productData.selling_price,
        discount: productData.discount,
      });

      Object.assign(productData, pricing);
    }

    // VARIANT PRODUCTS
    if (productData.variants?.length > 0) {
      productData.variants = productData.variants.map((v) => {
        const pricing = normalizePricing({
          selling_price: v.selling_price,
          discount: v.discount,
        });
        return { ...v, ...pricing };
      });

      // Parent pricing disabled
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
  if (!product) throw new NotFoundError("Product not found");

  if (
    userRole === Enums.USER.ROLE.VENDOR &&
    product.created_by.toString() !== userId
  ) {
    throw new UnauthorizedError("Unauthorized to update this product");
  }

  // 🚫 EMPTY UPDATE
  if (!updateData || Object.keys(updateData).length === 0) {
    throw new Error("No data provided to update");
  }

  /* ================= IMAGE VALIDATION ================= */

  const isImageUpdate = "media" in updateData || "thumbnailImage" in updateData;

  if (isImageUpdate) {
    const mediaToCheck =
      "media" in updateData ? updateData.media : product.media;

    const thumbnailToCheck =
      "thumbnailImage" in updateData
        ? updateData.thumbnailImage
        : product.thumbnailImage;

    const hasValidImage =
      (Array.isArray(mediaToCheck) && mediaToCheck.length > 0) ||
      (thumbnailToCheck && thumbnailToCheck.trim() !== "");

    if (!hasValidImage) {
      throw new ValidationError(
        "At least one image is required to update product",
      );
    }
  }

  /* ================= SELLING PRICE VALIDATION ================= */

  const isPriceUpdate = "selling_price" in updateData;

  if (isPriceUpdate) {
    const sellingPrice = updateData.selling_price;

    // ❌ null, undefined, 0, NaN
    if (
      sellingPrice === null ||
      sellingPrice === undefined ||
      Number(sellingPrice) <= 0 ||
      isNaN(sellingPrice)
    ) {
      throw new ValidationError("Selling price must be greater than 0");
    }

    // same rule as addProduct
    // if (
    //   product.base_price != null &&
    //   Number(sellingPrice) > Number(product.base_price)
    // ) {
    //   throw new ValidationError(
    //     "Selling price cannot be higher than base price",
    //   );
    // }
  }

  /* ---------------- NON-PRICE FIELDS ---------------- */

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

  /* ---------------- PRICE UPDATE ---------------- */

  if (isPriceUpdate) {
    const pricing = normalizePricing({
      selling_price: updateData.selling_price,
      discount: updateData.discount ?? product.discount,
    });

    product.base_price = pricing.base_price;
    product.selling_price = pricing.selling_price;
    product.discount = pricing.discount;
    product.final_price = pricing.final_price;
  }

  /* ---------------- GST UPDATE ---------------- */

  if ("gst_percent" in updateData) {
    product.gst_percent = validateGST(updateData.gst_percent);
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
      path: "category", // Use the virtual path
      select: "_id name", // Only get id and name from category
    })
    .populate({
      path: "created_by",
      select: "_id", // Minimal user info
    })
    .lean({ virtuals: true }); // Important: include virtuals in lean output

  const totalPages = Math.ceil(total / limit);

  return {
    docs: rawProducts, // No need for transformation now
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
