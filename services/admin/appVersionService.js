// services/admin/appVersionService.js
const AppVersion = require("../../models/AppVersion");
const { BadRequestError, NotFoundError } = require("../../errors");

// Validate required fields including updateMessage as string
const validateAppVersionData = (data) => {
  if (
    !data.updateMessage ||
    typeof data.updateMessage !== "string" ||
    data.updateMessage.trim() === ""
  ) {
    throw new BadRequestError(
      "updateMessage is required and must be a non-empty string",
    );
  }
};

const createAppVersion = async (adminId, data) => {
  validateAppVersionData(data);

  const existing = await AppVersion.findOne({ platform: data.platform });
  if (existing) {
    throw new BadRequestError(
      `An app version entry for ${data.platform} already exists`,
    );
  }

  const appVersion = new AppVersion({
    ...data,
    updateMessage: data.updateMessage.trim(),
    created_by: adminId,
    updated_by: adminId,
  });

  return await appVersion.save();
};

const getAppVersions = async ({ page = 1, limit = 10, platform, status }) => {
  const query = {};
  if (platform) query.platform = platform;
  if (status) query.status = status;

  const total = await AppVersion.countDocuments(query);
  const appVersions = await AppVersion.find(query)
    .populate("created_by", "name email")
    .populate("updated_by", "name email")
    .sort({ createdAt: -1 })
    .skip((page - 1) * limit)
    .limit(parseInt(limit));

  return {
    appVersions,
    pagination: {
      page: parseInt(page),
      limit: parseInt(limit),
      total,
      pages: Math.ceil(total / limit),
    },
  };
};

const getAppVersionById = async (id) => {
  const appVersion = await AppVersion.findById(id)
    .populate("created_by", "name email")
    .populate("updated_by", "name email");
  if (!appVersion) throw new NotFoundError("App version not found");
  return appVersion;
};

const updateAppVersion = async (id, updateData, adminId) => {
  if (updateData.updateMessage) {
    if (
      typeof updateData.updateMessage !== "string" ||
      updateData.updateMessage.trim() === ""
    ) {
      throw new BadRequestError("updateMessage must be a non-empty string");
    }
    updateData.updateMessage = updateData.updateMessage.trim();
  }

  const appVersion = await AppVersion.findByIdAndUpdate(
    id,
    { $set: { ...updateData, updated_by: adminId } },
    { new: true, runValidators: true },
  );

  if (!appVersion) throw new NotFoundError("App version not found");
  return appVersion;
};

const deleteAppVersion = async (id) => {
  const appVersion = await AppVersion.findByIdAndDelete(id);
  if (!appVersion) throw new NotFoundError("App version not found");
};

const toggleStatus = async (id) => {
  const appVersion = await AppVersion.findById(id);
  if (!appVersion) throw new NotFoundError("App version not found");

  appVersion.status = appVersion.status === "ACTIVE" ? "INACTIVE" : "ACTIVE";
  await appVersion.save();
  return appVersion;
};

module.exports = {
  createAppVersion,
  getAppVersions,
  getAppVersionById,
  updateAppVersion,
  deleteAppVersion,
  toggleStatus,
};
