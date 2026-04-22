const {
  getTraditionsForUsers,
  getTraditionBySlugOrId,
} = require("../../services/user/traditionService");
const logger = require("../../utils/logger");

exports.getTraditions = async (req, res) => {
  try {
    const { month = "", type } = req.query;

    const result = await getTraditionsForUsers({ month, type });

    return res.status(200).json({
      success: true,
      data: result || [],
    });
  } catch (err) {
    logger.error("getTraditions error:", err);
    return res.status(500).json({ success: false, message: err.message });
  }
};

exports.getTraditionBySlugOrId = async (req, res) => {
  try {
    const { idOrSlug } = req.query;

    const tradition = await getTraditionBySlugOrId(idOrSlug);

    if (!tradition) {
      return res.status(404).json({
        success: false,
        message: "Tradition not found",
      });
    }

    return res.status(200).json({
      success: true,
      data: tradition,
    });
  } catch (err) {
    logger.error("getTraditionBySlugOrId error:", err);
    return res.status(500).json({
      success: false,
      message: err.message,
    });
  }
};
