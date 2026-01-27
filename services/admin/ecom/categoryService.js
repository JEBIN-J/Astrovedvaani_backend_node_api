
const Category = require('../../../models/Category');
const Product = require('../../../models/Product');
const { buildPaginationResponse } = require('../../../utils/pagination');

const createCategoryService = async (data, userId) => {
  const payload = { ...data, created_by: userId, updated_by: userId };
  const category = new Category(payload);
  return await category.save();
};

const updateCategoryService = async (id, data, userId) => {
  const updatedData = { ...data, updated_by: userId };
  return await Category.findByIdAndUpdate(id, updatedData, { new: true });
};
const deleteCategoriesService = async (ids) => {
  if (!Array.isArray(ids) || ids.length === 0) {
    throw new Error('No category IDs provided');
  }
  await Product.updateMany({ category_id: { $in: ids } }, { $set: { category_id: null } });
  const result = await Category.deleteMany({ _id: { $in: ids } });
  if (result.deletedCount === 0) {
    throw new Error('No categories found to delete');
  }
  return {
    deletedCount: result.deletedCount,
    idsDeleted: ids
  };
};
const getCategoryByIdService = async (id) => {
  return await Category.findById(id).populate('parent_category').populate('children');
};

const fetchAllCategoriesService = async ({
  activeOnly,
  parent = null,
  name = null,
  page = 1,
  limit = 10,
} = {}) => {
  const filter = {};

  // Proper active filter
  if (activeOnly !== undefined) {
    // Convert string to boolean
    if (typeof activeOnly === 'string') {
      filter.is_active = activeOnly.toLowerCase() === 'true';
    } else {
      filter.is_active = !!activeOnly;
    }
  }

  // Parent filter
  if (parent) {
    filter.parent_category = parent;
  }

  // Name search
  if (name) {
    filter.name = { $regex: name, $options: 'i' };
  }

  const skip = (page - 1) * limit;

  const [categories, totalItems] = await Promise.all([
    Category.find(filter)
      .sort({ display_order: 1 })
      .skip(skip)
      .limit(limit),
    Category.countDocuments(filter),
  ]);

  return {
    data: categories,
    pagination: {
      totalItems: totalItems,
      totalPages: Math.ceil(totalItems / limit),
      currentPage: page,
      pageSize: limit,
    },
  };
};



const toggleCategoryStatusService = async (id, userId) => {
  const category = await Category.findById(id);
  if (!category) return null;

  category.is_active = !category.is_active;
  category.updated_by = userId;

  await category.save();
  return category;
};

module.exports = {
  createCategoryService,
  updateCategoryService,
  getCategoryByIdService,
  fetchAllCategoriesService,
  toggleCategoryStatusService,
  deleteCategoriesService
};
