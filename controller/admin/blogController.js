const blogService = require("../../services/admin/blogService");
const { buildPaginationResponse } = require("../../utils/pagination");

exports.addBlog = async (req, res) => {
  try {
    const { id, ...data } = req.body;

    if (!data.author && req.user && req.user._id) {
      data.author = req.user._id;
    }

    if (req.file && req.file.path) {
      data.thumbnailImage = req.file.path;
    }

    const blog = id
      ? await blogService.updateBlog(id, data)
      : await blogService.createBlog(data);

    res.status(id ? 200 : 201).json({ success: true, data: blog });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
};

exports.updateBlog = async (req, res) => {
  try {
    const id = req.query.id;
    const data = { ...req.body };

    if (!data.author && req.user && req.user._id) {
      data.author = req.user._id;
    }

    if (req.file && req.file.path) {
      data.thumbnailImage = req.file.path;
    }

    const blog = id
      ? await blogService.updateBlog(id, data)
      : await blogService.createBlog(data);

    res.status(id ? 200 : 201).json({ success: true, data: blog });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
};

exports.getBlogs = async (req, res) => {
  try {
    const page = parseInt(req.query.page || 1, 10);
    const limit = parseInt(req.query.limit || 10, 10);
    const { search, status, category, featured, related_to = 9000 } = req.query;

    const filter = {};

    const role = req.user?.role;
    const isAdmin = role === 103 || role === 106 || role === 105;

    if (isAdmin) {
      if (status) filter.status = status;
    } else {
      filter.status = "published";
    }

    if (category) filter.category = category;
    if (related_to !== undefined) filter.related_to = Number(related_to); // ✅ added

    if (featured === "true" || featured === "false") {
      filter.featured = featured === "true";
    }

    if (search) {
      filter.$or = [
        { title: { $regex: search, $options: "i" } },
        { content: { $regex: search, $options: "i" } },
      ];
    }

    const { blogs, total } = await blogService.getAllBlogs({
      page,
      limit,
      filter,
    });

    const summarized = blogs.map((blog) => ({
      _id: blog._id,
      title: blog.title,
      slug: blog.slug,
      coverImage: blog.coverImage,
      thumbnailImage: blog.thumbnailImage || null,
      content: blog.content || null,
      views: blog.views ?? 0,
      status: blog.status,
      createdAt: blog.createdAt,
      featured: blog.featured ?? false,
      category_id: blog.category?._id || null,
      category: blog.category?._id || null,
      category_name: blog.category?.name || null,
      related_to: blog.related_to,
    }));

    res.status(200).json({
      success: true,
      data: summarized,
      pagination: buildPaginationResponse({
        totalDocs: total,
        totalPages: Math.ceil(total / limit),
        page,
        limit,
      }),
    });
  } catch (error) {
    console.error("[getBlogs] Error:", error);
    res.status(500).json({ success: false, error: error.message });
  }
};

exports.getBlog = async (req, res) => {
  try {
    const { id, slug } = req.query;

    const blog = await blogService.getBlogById(id, slug);

    if (!blog)
      return res.status(404).json({ success: false, message: "Blog not found" });

    res.status(200).json({ success: true, data: blog });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

exports.deleteBlog = async (req, res) => {
  try {
    const blog = await blogService.deleteBlog(req.query.id);
    if (!blog)
      return res.status(404).json({ success: false, message: "Blog not found" });

    res.status(200).json({
      success: true,
      message: "Blog deleted successfully",
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};
