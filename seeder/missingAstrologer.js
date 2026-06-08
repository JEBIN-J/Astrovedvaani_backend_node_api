const User = require("../models/User");
const Astrologer = require("../models/Astrologer");
const Enums = require("../utils/constants");
const logger = require("../utils/logger");

const createMissingAstrologers = async () => {
  try {
    logger.info("Starting missing astrologer migration...");

    const users = await User.find({
      role: Enums.USER.ROLE.ASTROLOGER,
      isDeleted: false,
    }).lean();

    let createdCount = 0;

    for (const user of users) {
      const existingAstrologer = await Astrologer.findOne({
        user_id: user._id,
      });

      if (existingAstrologer) {
        continue;
      }

      await Astrologer.create({
        user_id: user._id,
        display_name: user.name,
      });

      createdCount++;

      logger.info(`Astrologer profile created for ${user.name} (${user._id})`);
    }

    logger.info(
      `Migration completed. Created ${createdCount} astrologer profiles.`,
    );
  } catch (error) {
    logger.error("Migration failed:", error);
  }
};

module.exports = createMissingAstrologers;
