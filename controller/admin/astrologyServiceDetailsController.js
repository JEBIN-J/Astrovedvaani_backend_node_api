const service = require("../../services/admin/astrologyServiceDetailsService");
const { buildPaginationResponse } = require("../../utils/pagination");

exports.addAstrologyService = async (req, res) => {
  try {
    const { id, ...data } = req.body;

    if (!data.createdBy && req.user?._id) {
      data.createdBy = req.user._id;
    }

    const result = id
      ? await service.updateAstrologyService(id, {
          ...data,
          updatedBy: req.user?._id,
        })
      : await service.createAstrologyService(data);

    res.status(id ? 200 : 201).json({ success: true, data: result });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
};

exports.updateAstrologyService = async (req, res) => {
  try {
    const id = req.query.id;

    const result = await service.updateAstrologyService(id, {
      ...req.body,
      updatedBy: req.user?._id,
    });

    res.status(200).json({ success: true, data: result });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
};

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
        { content: { $regex: search, $options: "i" } },
      ];
    }

    const sort = { [sortBy]: order === "asc" ? 1 : -1 };

    const { docs, total } = await service.getAllAstrologyServices({
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
    const { id, slug } = req.query;

    const doc = await service.getAstrologyService(id, slug);

    if (!doc)
      return res.status(404).json({ success: false, message: "Not found" });

    res.status(200).json({ success: true, data: doc });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

exports.deleteAstrologyService = async (req, res) => {
  try {
    const doc = await service.deleteAstrologyService(req.query.id);

    if (!doc)
      return res.status(404).json({ success: false, message: "Not found" });

    res.status(200).json({
      success: true,
      message: "Deleted successfully",
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};
