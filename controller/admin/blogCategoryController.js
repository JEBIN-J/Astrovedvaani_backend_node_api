const categoryService = require("../../services/admin/blogCategoryService");
const { buildPaginationResponse } = require("../../utils/pagination");
const Blog = require("../../models/Blog");

exports.createCategory = async (req, res) => {
  try {
    const { id, ...data } = req.body;

    const category = id
      ? await categoryService.updateCategory(id, data)
      : await categoryService.createCategory(data);

    res.status(id ? 200 : 201).json({ success: true, data: category });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
};

exports.updateCategory = async (req, res) => {
  try {
    // const { id, ...data } = req.body;
    const { id } = req.query;

    const category = id
      ? await categoryService.updateCategory(id, req.body)
      : await categoryService.createCategory(req.body);

    res.status(id ? 200 : 201).json({ success: true, data: category });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
};

exports.getCategories = async (req, res) => {
  try {
    const { page = 1, limit = 10, search } = req.query;
    const pageInt = parseInt(page, 10);
    const limitInt = parseInt(limit, 10);

    const filter = {};
    if (search) {
      filter.name = { $regex: search, $options: "i" };
    }

    const { categories, total } = await categoryService.fetchCategories({
      page: pageInt,
      limit: limitInt,
      filter, // pass the filter to the service
    });

    const formattedCategories = categories.map((cat) => ({
      _id: cat._id,
      id: cat._id.toString(),
      name: cat.name,
    }));

    res.status(200).json({
      categories: formattedCategories,
      pagination: buildPaginationResponse({
        totalDocs: total,
        totalPages: Math.ceil(total / limitInt),
        page: pageInt,
        limit: limitInt,
      }),
    });
  } catch (error) {
    console.error("[CategoryController] Error:", error);
    res.status(500).json({
      error: "SERVER_ERROR",
      message: "Unable to fetch categories at this time",
    });
  }
};

exports.getCategory = async (req, res) => {
  try {
    const category = await categoryService.getCategoryById(req.query.id);
    if (!category)
      return res.status(404).json({ message: "Category not found" });

    // ✅ Fetch all published blogs under this category
    const blogs = await Blog.find({
      category: category._id,
      status: "published",
    })
      .select("title slug thumbnail coverImage excerpt createdAt")
      .sort({ createdAt: -1 })
      .lean();

    // ✅ Combine both
    res.status(200).json({
      success: true,
      category,
      blogs,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Error fetching category and blogs",
      error: error.message,
    });
  }
};

exports.deleteCategory = async (req, res) => {
  try {
    const id = req.query.id || req.query._id;
    const category = await categoryService.deleteCategory(id);
    if (!category)
      return res.status(404).json({ message: "Category not found" });
    res.status(200).json({ message: "Category deleted" });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};
