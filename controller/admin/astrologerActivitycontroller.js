const {
  getAstrologerActivityReport,
} = require("../../services/admin/astrologerActivityservice");

exports.getAstrologerActivity = async (req, res) => {
  try {
    const { astrologerId } = req.query;

    const data = await getAstrologerActivityReport(
      astrologerId
    );

    return res.status(200).json({
      success: true,
      data,
    });
  } catch (error) {
    console.error(
      "[getAstrologerActivity]",
      error
    );

    return res.status(500).json({
      success: false,
      message:
        error.message ||
        "Failed to fetch astrologer activity",
    });
  }
};