const Blog = require("../../models/Blog");

exports.createBlog = async (data) => {
  return await Blog.create(data);
};

exports.updateBlog = async (id, data) => {
  return await Blog.findByIdAndUpdate(id, data, {
    new: true,
    runValidators: true,
  });
};

exports.getAllBlogs = async ({ page = 1, limit = 10, filter = {} }) => {
  const skip = (page - 1) * limit;

  const [blogs, total] = await Promise.all([
    Blog.find(filter)
      .select(
        "title slug coverImage thumbnailImage content views status createdAt category featured",
      )
      .populate("category", "_id name")
      .skip(skip)
      .limit(limit)
      .lean(),
    Blog.countDocuments(filter),
  ]);

  return { blogs, total };
};

exports.getBlogById = async (id, slug) => {
  let query = {};

  if (id) {
    query._id = id;
  } else if (slug) {
    query.slug = slug;
  } else {
    throw new Error("Blog ID or slug is required");
  }

  return await Blog.findOne(query)
    .populate("author", "name email")
    .populate("category", "name");
};

exports.deleteBlog = async (id) => {
  return await Blog.findByIdAndDelete(id);
};
