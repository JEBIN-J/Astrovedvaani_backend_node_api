// controllers/admin/appVersionController.js
const {
  createAppVersion,
  getAppVersions,
  getAppVersionById,
  updateAppVersion,
  deleteAppVersion,
  toggleStatus,
} = require("../../services/admin/appVersionService");

const logger = require("../../utils/logger");
const {
  BadRequestError,
  NotFoundError,
  ForbiddenError,
} = require("../../errors");
const Enums = require("../../utils/constants");

const handleError = (res, error) => {
  if (error instanceof BadRequestError)
    return res.status(400).json({ success: false, message: error.message });
  if (error instanceof NotFoundError)
    return res.status(404).json({ success: false, message: error.message });
  if (error instanceof ForbiddenError)
    return res.status(403).json({ success: false, message: error.message });
  return res
    .status(500)
    .json({ success: false, message: "Internal server error" });
};

exports.createAppVersion = async (req, res) => {
  try {
    const appVersion = await createAppVersion(req.user._id, req.body);
    res.status(201).json({
      success: true,
      message: "App version created successfully",
      appVersion,
    });
  } catch (error) {
    logger.error("Admin: Create AppVersion Error", error);
    handleError(res, error);
  }
};

exports.getAppVersions = async (req, res) => {
  try {
    if (req.user.role !== Enums.USER.ROLE.SUPER_ADMIN)
      throw new ForbiddenError("Admin access required");

    const { page = 1, limit = 10, platform, status } = req.query;
    const result = await getAppVersions({
      page: parseInt(page),
      limit: parseInt(limit),
      platform,
      status,
    });

    res.json({
      success: true,
      ...result,
    });
  } catch (error) {
    logger.error("Admin: Get AppVersions Error", error);
    handleError(res, error);
  }
};

exports.getAppVersionById = async (req, res) => {
  try {
    if (req.user.role !== Enums.USER.ROLE.SUPER_ADMIN)
      throw new ForbiddenError("Admin access required");

    const appVersion = await getAppVersionById(req.params.id);
    res.json({ success: true, appVersion });
  } catch (error) {
    logger.error("Admin: Get AppVersion By ID Error", error);
    handleError(res, error);
  }
};

exports.updateAppVersion = async (req, res) => {
  try {
    const appVersion = await updateAppVersion(
      req.params.id,
      req.body,
      req.user._id,
    );
    res.json({
      success: true,
      message: "App version updated successfully",
      appVersion,
    });
  } catch (error) {
    logger.error("Admin: Update AppVersion Error", error);
    handleError(res, error);
  }
};

exports.deleteAppVersion = async (req, res) => {
  try {
    if (req.user.role !== Enums.USER.ROLE.SUPER_ADMIN)
      throw new ForbiddenError("Admin access required");

    await deleteAppVersion(req.params.id);
    res.json({ success: true, message: "App version deleted successfully" });
  } catch (error) {
    logger.error("Admin: Delete AppVersion Error", error);
    handleError(res, error);
  }
};

exports.toggleStatus = async (req, res) => {
  try {
    if (req.user.role !== Enums.USER.ROLE.SUPER_ADMIN)
      throw new ForbiddenError("Admin access required");

    const appVersion = await toggleStatus(req.params.id);
    res.json({
      success: true,
      message: `App version is now ${appVersion.status}`,
      appVersion,
    });
  } catch (error) {
    logger.error("Admin: Toggle AppVersion Status Error", error);
    handleError(res, error);
  }
};
