const metaSeoService = require("../../services/admin/metaSeoService");
const { buildPaginationResponse } = require("../../utils/pagination");

exports.createMeta = async (req, res) => {
  try {
    const { id } = req.query;
    const data = req.body;

    const meta = id
      ? await metaSeoService.updateMeta(id, data)
      : await metaSeoService.createMeta(data);

    const metaObj = meta.toObject();
    delete metaObj.meta_keywords;

    res.status(id ? 200 : 201).json({
      success: true,
      data: metaObj,
    });
  } catch (error) {
    // 🔁 Duplicate type handling
    if (error.code === 11000 && error.keyPattern?.type) {
      return res.status(409).json({
        success: false,
        message: "Meta SEO for this type already exists",
      });
    }

    res.status(400).json({
      success: false,
      message: error.message,
    });
  }
};

exports.getMetaList = async (req, res) => {
  try {
    const { page = 1, limit = 10, type } = req.query;

    const filter = {};
    if (type) {
      filter.type = type; // filter by type
    }

    const { list, totalDocs } = await metaSeoService.fetchMetaList({
      page: parseInt(page),
      limit: parseInt(limit),
      filter,
    });

    res.json({
      success: true,
      data: list,
      pagination: buildPaginationResponse({
        totalDocs,
        totalPages: Math.ceil(totalDocs / limit),
        page: Number(page),
        limit: Number(limit),
      }),
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Unable to fetch meta list",
    });
  }
};

exports.getMeta = async (req, res) => {
  try {
    const meta = await metaSeoService.getMetaById(req.query.id);
    if (!meta) {
      return res.status(404).json({
        success: false,
        message: "Meta not found",
      });
    }
    delete meta.meta_keywords;
    res.json({ success: true, data: meta });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.toggleMetaStatus = async (req, res) => {
  try {
    const { id } = req.query;

    if (!id) {
      throw new Error("Meta ID is required");
    }

    const result = await metaSeoService.toggleMetaStatus(id);

    res.status(200).json({
      success: true,
      data: result,
    });
  } catch (err) {
    res.status(400).json({
      success: false,
      message: err.message,
    });
  }
};
