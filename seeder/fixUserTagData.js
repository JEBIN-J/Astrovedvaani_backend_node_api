const User = require("../models/User");
const Enums = require("../utils/constants");
const logger = require("../utils/logger");

const fixUserTagData = async () => {
  try {
    logger.info("[Seeder] Starting fixUserTagData...");
    const usersToFix = await User.find({
      "currentTag.tag": { $type: "array" },
    }).select("_id currentTag");

    if (!usersToFix.length) {
      logger.info("[Seeder] No invalid tag data found. Skipping...");
      return;
    }
    logger.info(
      `[Seeder] Found ${usersToFix.length} users with invalid tag format`
    );
    const bulkOps = usersToFix.map((user) => ({
      updateOne: {
        filter: { _id: user._id },
        update: {
          $set: {
            "currentTag.tag": Enums.USER.TAGS.NEW_USER,
            "currentTag.assignedAt": new Date(),
          },
        },
      },
    }));
    await User.bulkWrite(bulkOps);
    logger.info("[Seeder] Successfully fixed user tag data");
  } catch (err) {
    logger.error("[Seeder] Error fixing user tag data:", err);
  }
};

module.exports = fixUserTagData;