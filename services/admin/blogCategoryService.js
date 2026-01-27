const BlogCategory = require('../../models/BlogCategory');

exports.createCategory = async (data) => {
  return await BlogCategory.create(data);
};

exports.updateCategory = async (id, data) => {
  return await BlogCategory.findByIdAndUpdate(id, data, {
    new: true,
    runValidators: true
  });
};

exports.fetchCategories = async ({ page = 1, limit = 10, filter = {} }) => {
  const skip = (page - 1) * limit;

  const [categories, total] = await Promise.all([
    BlogCategory.find(filter)
      .sort({ display_order: 1 })
      .skip(skip)
      .limit(limit),
    BlogCategory.countDocuments(filter),
  ]);

  return { categories, total };
};




exports.getCategoryById = async (id) => {
  return await BlogCategory.findById(id);
};

exports.updateCategory = async (id, data) => {
  return await BlogCategory.findByIdAndUpdate(id, data, { new: true, runValidators: true });
};

exports.deleteCategory = async (id) => {
  return await BlogCategory.findByIdAndDelete(id);
};
