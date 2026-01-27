const {
  addProduct,
  updateProduct,
  getProducts,
  deleteProductsService,
} = require("../../services/ecom/productService");
const Enums = require("../../utils/constants");
const { buildPaginationResponse } = require("../../utils/pagination");
const asyncHandler = require("../../middlewares/asyncHandler");
const { BadRequestError, ConflictError } = require("../../errors");
const logger = require("../../utils/logger");

exports.addProduct = asyncHandler(async (req, res) => {
  const {
    name,
    category_id,
    description,
    summary,
    sku,
    base_price,
    selling_price,
    gst_percent,
    discount,
    media,
    variants,
    slug,
    is_active,
    thumbnailImage,
  } = req.body;

  if (!name || !category_id || (!sku && (!variants || variants.length === 0))) {
    throw new BadRequestError("Missing required fields: name, category, sku");
  }
  const hasValidImage =
    (Array.isArray(media) && media.length > 0) ||
    (thumbnailImage && thumbnailImage.trim() !== "");

  if (!hasValidImage) {
    throw new BadRequestError(
      "At least one image is required to add a product",
    );
  }
  if (
    (base_price && isNaN(base_price)) ||
    (selling_price && isNaN(selling_price)) ||
    (gst_percent && isNaN(gst_percent)) ||
    (discount && isNaN(discount))
  ) {
    throw new BadRequestError("Numeric fields must contain valid numbers");
  }
  if (!variants || variants.length === 0) {
    if (
      selling_price === undefined ||
      selling_price === null ||
      isNaN(selling_price) ||
      Number(selling_price) <= 0
    ) {
      throw new BadRequestError(
        "Selling price is required and must be greater than 0",
      );
    }
  }
  try {
    const newProduct = await addProduct({
      name,
      summary,
      category_id,
      description,
      sku,
      base_price,
      selling_price,
      gst_percent,
      discount,
      media,
      slug,
      is_active,
      variants,
      thumbnailImage,
      created_by: req.user._id,
    });

    res.status(201).json({ success: true, data: newProduct });
  } catch (err) {
    if (err.code === 11000 && err.keyValue?.sku) {
      throw new ConflictError("SKU must be unique");
    }
    if (err.name === "ValidationError") {
      const messages = Object.values(err.errors)
        .map((e) => e.message)
        .join(", ");
      throw new BadRequestError(messages);
    }
    throw err;
  }
});

exports.updateProduct = async (req, res) => {
  try {
    const { id } = req.query;
    console.log(` login user --> `, req.user);
    const updatedProduct = await updateProduct(
      id,
      req.body,
      req.user._id,
      req.user.role,
    );
    if (!updatedProduct) {
      return res.status(404).json({
        success: false,
        error: "Product not found",
      });
    }
    res.status(200).json({
      success: true,
      data: updatedProduct,
    });
  } catch (err) {
    console.error("Error updating product:", err);

    if (err.message === "Unauthorized to update this product") {
      return res.status(403).json({ success: false, error: err.message });
    }

    if (err.message === "Product not found") {
      return res.status(404).json({ success: false, error: err.message });
    }

    if (err.statusCode === 422) {
      return res.status(422).json({
        success: false,
        error: err.message,
      });
    }

    res.status(500).json({
      success: false,
      error: "Internal server error",
    });
  }
};
exports.getProducts = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 10,
      category,
      fromDate,
      toDate,
      search,
    } = req.query;
    const { id: userId, role } = req.user;
    const filter = {};
    if (role === Enums.USER.ROLE.VENDOR) {
      filter.created_by = userId;
    }
    if (category) {
      filter.category_id = category;
    }
    if (fromDate || toDate) {
      filter.createdAt = {};
      if (fromDate) filter.createdAt.$gte = new Date(fromDate);
      if (toDate) filter.createdAt.$lte = new Date(toDate);
    }
    if (search) {
      filter.$or = [
        { name: { $regex: search, $options: "i" } },
        { sku: { $regex: search, $options: "i" } },
        { description: { $regex: search, $options: "i" } },
      ];
    }
    const options = {
      page: parseInt(page),
      limit: parseInt(limit),
      sort: { createdAt: -1 },
    };
    const products = await getProducts(filter, options);
    res.status(200).json({
      success: true,
      data: products.docs,
      pagination: buildPaginationResponse({
        totalDocs: products.totalDocs,
        totalPages: products.totalPages,
        page: products.page,
        limit: options.limit,
      }),
    });
  } catch (err) {
    console.error("Error fetching products:", err);
    res.status(500).json({
      success: false,
      error: "Internal server error",
    });
  }
};

exports.deleteProducts = async (req, res) => {
  try {
    const { ids } = req.body;
    const deletedInfo = await deleteProductsService(ids);
    return res.status(200).json({
      success: true,
      message: `${deletedInfo.deletedCount} product(s) deleted successfully`,
      data: deletedInfo,
    });
  } catch (err) {
    logger.error("Error deleting products:", err);
    if (
      err.message === "No products found to delete" ||
      err.message === "No product IDs provided"
    ) {
      return res.status(404).json({
        success: false,
        error: err.message,
      });
    }
    return res.status(500).json({
      success: false,
      error: "Internal server error",
    });
  }
};
