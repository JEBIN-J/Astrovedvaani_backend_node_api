const { NotFoundError } = require("../../../errors");
const productService = require("../../../services/user/astromall/productService");
const asyncHandler = require("../../../middlewares/asyncHandler");

exports.getProduct = async (req, res) => {
  try {
    const product = await productService.getProductById(
      req.query.id,
      req.query.slug,
      req.user?._id,
      req.query.coupon_code,
    );
    return res.status(200).json({
      success: true,
      data: product,
    });
  } catch (error) {
    return res.status(404).json({
      success: false,
      message: error.message,
    });
  }
};

exports.getProductReviews = asyncHandler(async (req, res) => {
  const { id, page = 1, limit = 20 } = req.query;

  if (!id) throw new NotFoundError("Product ID is required");

  const productReviews = await productService.fetchProductFeedbacks(
    id,
    parseInt(page, 10),
    parseInt(limit, 10),
  );

  return res.status(200).json({
    success: true,
    data: productReviews,
  });
});

// exports.searchProducts = async (req, res) => {
//   try {
//     const {
//       key,
//       category,
//       minPrice,
//       maxPrice,
//       sortRating,
//       sortPrice,
//       page,
//       limit,
//     } = req.query;

//     if (key && key.trim().length < 3) {
//       return res.status(400).json({
//         success: false,
//         message: "Search key must be at least 3 characters long.",
//       });
//     }

//     const result = await productService.searchProducts({
//       query: key?.trim() || "",
//       category: category || null,
//       minPrice: minPrice ? Number(minPrice) : null,
//       maxPrice: maxPrice ? Number(maxPrice) : null,
//       sortRating: sortRating || null,  // ✅ include rating sort
//       sortPrice: sortPrice || null,    // ✅ include price sort
//       page: parseInt(page) || 1,
//       limit: parseInt(limit) || 20,
//       userId: req.user?._id,
//     });

//     return res.status(200).json({
//       success: true,
//       data: result.data,
//       pagination: result.pagination,
//     });
//   } catch (error) {
//     return res.status(400).json({
//       success: false,
//       message: error.message,
//     });
//   }
// };

exports.searchProducts = async (req, res) => {
  try {
    const {
      key,
      category,
      minPrice,
      maxPrice,
      sortRating,
      sortPrice,
      page,
      limit,
    } = req.query;

    if (key && key.trim().length < 3) {
      return res.status(400).json({
        success: false,
        message: "Search key must be at least 3 characters long.",
      });
    }

    // ✅ Minimal change: handle multiple categories
    let categories = null;
    if (category) {
      if (Array.isArray(category)) {
        categories = category; // already an array
      } else if (typeof category === "string") {
        categories = category.split(",").map((c) => c.trim());
      }
    }

    const result = await productService.searchProducts({
      query: key?.trim() || "",
      category: categories, // <-- pass array or null
      minPrice: minPrice ? Number(minPrice) : null,
      maxPrice: maxPrice ? Number(maxPrice) : null,
      sortRating: sortRating || null,
      sortPrice: sortPrice || null,
      page: parseInt(page) || 1,
      limit: parseInt(limit) || 20,
      userId: req.user?._id,
    });

    return res.status(200).json({
      success: true,
      data: result.data,
      pagination: result.pagination,
    });
  } catch (error) {
    return res.status(400).json({
      success: false,
      message: error.message,
    });
  }
};

exports.getFeaturedProducts = async (req, res) => {
  try {
    const products = await productService.getFeaturedProducts(
      parseInt(req.query.limit) || 10,
      req.user?._id,
    );
    return res.status(200).json({
      success: true,
      data: products,
    });
  } catch (error) {
    return res.status(400).json({
      success: false,
      message: error.message,
    });
  }
};
exports.getProductsByCategory = async (req, res) => {
  try {
    const products = await productService.getProductsByCategory(
      req.params.slug,
      {
        minPrice: req.query.minPrice,
        maxPrice: req.query.maxPrice,
        sortBy: req.query.sortBy,
        sortOrder: req.query.sortOrder,
      },
      req.user?._id,
    );

    return res.status(200).json({
      success: true,
      data: products,
    });
  } catch (error) {
    return res.status(400).json({
      success: false,
      message: error.message,
    });
  }
};
