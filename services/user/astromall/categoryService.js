const Category = require('../../../models/Category');
const { buildPaginationResponse } = require('../../../utils/pagination');

// exports.getCategoryTree = async () => {
//   const categories = await Category.find({ is_active: true })
//     .sort({ display_order: 1 })
//     .lean();

//   const categoryMap = {};
//   const rootCategories = [];

//   categories.forEach(category => {
//     categoryMap[category._id] = category;
//     category.children = [];
//   });

//   categories.forEach(category => {
//     if (category.parent_category) {
//       const parent = categoryMap[category.parent_category];
//       if (parent) {
//         parent.children.push(category);
//       }
//     } else {
//       rootCategories.push(category);
//     }
//   });

//   return rootCategories;
// };

exports.getCategoryTree = async ({ page = 1, limit = 10 }) => {
  const skip = (page - 1) * limit;

  // Step 1️⃣: Count root categories
  const totalDocs = await Category.countDocuments({
    is_active: true,
    parent_category: null,
  });

  // Step 2️⃣: Fetch paginated root categories (only required fields)
  const rootCategories = await Category.find({
    is_active: true,
    parent_category: null,
  })
    .select('_id name image_url description is_featured slug') // only the requested fields
    .sort({ display_order: 1 })
    .skip(skip)
    .limit(limit)
    .lean();

  // Step 3️⃣: Build pagination info
  const totalPages = Math.ceil(totalDocs / limit);
  const pagination = buildPaginationResponse({
    totalDocs,
    totalPages,
    page,
    limit,
  });

  // Step 4️⃣: Return simplified response
  return { categories: rootCategories, pagination };
};



exports.getCategoryBySlug = async (slug) => {
  return Category.findOne({ slug, is_active: true })
    .populate('parent_category', 'name slug')
    .populate('children', 'name slug image_url')
    .lean();
};

exports.getFeaturedCategories = async (limit = 6) => {
  return Category.find({ is_active: true, is_featured: true })
    .sort({ display_order: 1 })
    .limit(limit)
    .lean();
};