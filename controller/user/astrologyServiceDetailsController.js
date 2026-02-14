const service = require("../../services/user/astrologyServiceDetailsService");
const { buildPaginationResponse } = require("../../utils/pagination");

exports.getAstrologyServices = async (req, res) => {
  try {
    const page = parseInt(req.query.page || 1);
    const limit = parseInt(req.query.limit || 10);

    const { search, category, sortBy = "createdAt", order = "desc" } =
      req.query;

    const filter = {};

    if (category) filter.category = Number(category);

    if (search) {
      filter.$or = [
        { title: { $regex: search, $options: "i" } },
        { excerpt: { $regex: search, $options: "i" } },
      ];
    }

    const sort = { [sortBy]: order === "asc" ? 1 : -1 };

    const { docs, total } = await service.getAll({
      page,
      limit,
      filter,
      sort,
    });

    res.status(200).json({
      success: true,
      data: docs,
      pagination: buildPaginationResponse({
        totalDocs: total,
        totalPages: Math.ceil(total / limit),
        page,
        limit,
      }),
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

exports.getAstrologyService = async (req, res) => {
  try {
    const { categoryId } = req.query;

    const doc = await service.getOne(categoryId);

    if (!doc)
      return res.status(404).json({ success: false, message: "Not found" });

    res.status(200).json({ success: true, data: doc });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};
