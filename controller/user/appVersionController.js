// controllers/user/appVersionController.js
const { checkAppVersion } = require("../../services/user/appVersionService");
const { BadRequestError } = require("../../errors");
const logger = require("../../utils/logger");

exports.checkAppVersion = async (req, res) => {
  try {
    const { platform, currentVersion, currentVersionCode } = req.body;
    console.log("req.body", req.body);
    if (!platform || !currentVersion) {
      throw new BadRequestError("platform and currentVersion are required");
    }

    if (currentVersionCode === undefined || currentVersionCode === null) {
      throw new BadRequestError("currentVersionCode is required");
    }

    if (!["android", "ios"].includes(platform.toLowerCase())) {
      throw new BadRequestError("platform must be 'android' or 'ios'");
    }

    // currentVersionCode should be a number
    const versionCodeNum = Number(currentVersionCode);
    if (isNaN(versionCodeNum)) {
      throw new BadRequestError("currentVersionCode must be a valid number");
    }

    const result = await checkAppVersion({
      platform: platform.toLowerCase(),
      currentVersion,
      currentVersionCode: versionCodeNum,
    });

    res.json({
      success: true,
      ...result,
    });
  } catch (error) {
    logger.error("User: Check AppVersion Error", error);
    if (error instanceof BadRequestError) {
      return res.status(400).json({ success: false, message: error.message });
    }
    res.status(500).json({ success: false, message: "Internal server error" });
  }
};
