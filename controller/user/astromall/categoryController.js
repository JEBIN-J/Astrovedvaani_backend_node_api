const asyncHandler = require('../../../middlewares/asyncHandler');
const categoryService = require('../../../services/user/astromall/categoryService');

// exports.getCategoryTree = async (req, res) => {
//   try {
//     const categories = await categoryService.getCategoryTree();
//     return res.status(200).json({
//       success: true,
//       data: categories
//     });
//   } catch (error) {
//     return res.status(400).json({
//       success: false,
//       message: error.message
//     });
//   }
// };

exports.getCategoryTree = asyncHandler(async (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 10;

  const { categories, pagination } = await categoryService.getCategoryTree({ page, limit });

  return res.status(200).json({
    success: true,
    data: categories,
    pagination,
  });
});




exports.getCategory = async (req, res) => {
  try {
    const category = await categoryService.getCategoryBySlug(req.params.slug);
    if (!category) {
      return res.status(404).json({
        success: false,
        message: 'Category not found'
      });
    }
    return res.status(200).json({
      success: true,
      data: category
    });
  } catch (error) {
    return res.status(400).json({
      success: false,
      message: error.message
    });
  }
};

exports.getFeaturedCategories = async (req, res) => {
  try {
    const categories = await categoryService.getFeaturedCategories(
      parseInt(req.query.limit) || 6
    );
    return res.status(200).json({
      success: true,
      data: categories
    });
  } catch (error) {
    return res.status(400).json({
      success: false,
      message: error.message
    });
  }
};