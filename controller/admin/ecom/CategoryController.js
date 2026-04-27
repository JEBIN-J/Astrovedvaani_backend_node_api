const {
  createCategoryService,
  updateCategoryService,
  getCategoryByIdService,
  fetchAllCategoriesService,
  toggleCategoryStatusService,
  deleteCategoriesService,
} = require("../../../services/admin/ecom/categoryService");
const logger = require("../../../utils/logger");

exports.createCategory = async (req, res) => {
  try {
    const userId = req.user?._id;
    const category = await createCategoryService(req.body, userId);
    return res
      .status(201)
      .json({
        success: true,
        data: category,
        message: "Category added successfully",
      });
  } catch (error) {
    logger.error("Admin createCategory failed", error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

exports.updateCategory = async (req, res) => {
  try {
    const userId = req.user?._id;
    const id = req.query.id;
    const category = await updateCategoryService(id, req.body, userId);
    if (!category) {
      return res
        .status(404)
        .json({ success: false, message: "Category not found" });
    }
    return res
      .status(200)
      .json({
        success: true,
        data: category,
        message: "Category updated successfully",
      });
  } catch (error) {
    logger.error("Admin updateCategory failed", error);
    return res.status(500).json({ success: false, message: error.message });
  }
};
exports.deleteCategories = async (req, res) => {
  try {
    const { ids } = req.body;

    const deletedInfo = await deleteCategoriesService(ids);

    return res.status(200).json({
      success: true,
      message: `${deletedInfo.deletedCount} category(s) deleted successfully`,
      data: deletedInfo,
    });
  } catch (error) {
    logger.error("Admin deleteCategories failed", error);

    if (
      error.message === "No categories found to delete" ||
      error.message === "No category IDs provided"
    ) {
      return res.status(404).json({
        success: false,
        message: error.message,
      });
    }

    return res.status(500).json({ success: false, message: error.message });
  }
};
exports.getCategoryById = async (req, res) => {
  try {
    const category = await getCategoryByIdService(req.params.id);
    if (!category) {
      return res
        .status(404)
        .json({ success: false, message: "Category not found" });
    }
    return res.status(200).json({ success: true, data: category });
  } catch (error) {
    logger.error("Admin getCategoryById failed", error);
    return res.status(500).json({ success: false, message: error.message });
  }
};
exports.fetchAllCategories = async (req, res) => {
  try {
    const { active, parent, search, page = 1, limit = 10 } = req.query;
    const result = await fetchAllCategoriesService({
      activeOnly: active,
      parent: parent || null,
      name: search || null,
      page: parseInt(page),
      limit: parseInt(limit),
    });

    return res.status(200).json({ success: true, ...result });
  } catch (error) {
    logger.error("Admin fetchAllCategories failed", error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

exports.toggleCategoryStatus = async (req, res) => {
  try {
    const userId = req.user?._id;
    const category = await toggleCategoryStatusService(req.query.id, userId);

    if (!category) {
      return res
        .status(404)
        .json({ success: false, message: "Category not found" });
    }

    return res.status(200).json({ success: true, data: category });
  } catch (error) {
    logger.error("Admin toggleCategoryStatus failed", error);
    return res.status(500).json({ success: false, message: error.message });
  }
};
