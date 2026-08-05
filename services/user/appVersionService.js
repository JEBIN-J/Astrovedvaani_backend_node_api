// services/user/appVersionService.js
const AppVersion = require("../../models/AppVersion");
const { BadRequestError } = require("../../errors");

const compareVersions = (v1, v2) => {
  const parts1 = v1.split(".").map(Number);
  const parts2 = v2.split(".").map(Number);

  for (let i = 0; i < Math.max(parts1.length, parts2.length); i++) {
    const p1 = parts1[i] || 0;
    const p2 = parts2[i] || 0;
    if (p1 > p2) return 1;
    if (p1 < p2) return -1;
  }
  return 0;
};

const compareVersionCodes = (code1, code2) => {
  return Number(code1) - Number(code2);
};

const checkAppVersion = async ({
  platform,
  currentVersion,
  currentVersionCode,
}) => {
  const appVersion = await AppVersion.findOne({
    platform,
    status: "ACTIVE",
  });

  if (!appVersion) {
    throw new BadRequestError(`No active configuration found for ${platform}`);
  }

  // Version string comparison (semantic version)
  const isLatestByVersion =
    compareVersions(currentVersion, appVersion.latestVersion) >= 0;

  // Version code comparison (build number)
  const isLatestByCode =
    compareVersionCodes(currentVersionCode, appVersion.latestVersionCode) >= 0;

  const isSupportedByVersion =
    compareVersions(currentVersion, appVersion.minSupportedVersion) >= 0;
  const isSupportedByCode =
    compareVersionCodes(
      currentVersionCode,
      appVersion.minSupportedVersionCode,
    ) >= 0;

  // Final decision - usually more strict on version code for force update
  const isUpToDate = isLatestByVersion && isLatestByCode;
  const isSupported = isSupportedByVersion && isSupportedByCode;

  return {
    latestVersion: appVersion.latestVersion,
    latestVersionCode: appVersion.latestVersionCode,
    minSupportedVersion: appVersion.minSupportedVersion,
    minSupportedVersionCode: appVersion.minSupportedVersionCode,

    storeUrl: appVersion.storeUrl,
    updateMessage: appVersion.updateMessage,

    // Results
    isUpToDate,
    isSupported,

    updateRequired: !isSupported, // Force update if below min (both version & code)
    updateRecommended: !isUpToDate && isSupported, // Soft update suggestion

    // Detailed breakdown (useful for debugging / advanced client logic)
    versionStatus: {
      currentVersion,
      isLatestByVersion,
    },
    versionCodeStatus: {
      currentVersionCode,
      isLatestByCode,
    },
  };
};

module.exports = {
  checkAppVersion,
};
