const bcrypt = require("bcryptjs");
const User = require("../models/User");
const Enums = require("../utils/constants");
const logger = require("../utils/logger");

const resetAstrologerPasswords = async () => {
  try {
    logger.info("🔄 Starting astrologer password reset seeder...");

    // 👉 These 2 astrologers will get password = 9999
    const fixedPasswordIds = [
      "691c1d227d56c89d48a3d855", // Expert Astrologer
      "692f0d7b4a2bbf3fb2899c21", // Pandit
    ];

    // 👉 Fetch all astrologers
    const astrologers = await User.find({
      role: Enums.USER.ROLE.ASTROLOGER,
    });

    if (!astrologers.length) {
      logger.info("No astrologers found to update.");
      return;
    }

    logger.info(`Found ${astrologers.length} astrologers to update.`);

    for (const astro of astrologers) {
      let newPassword;

      // 👉 Give password = 9999 for these two only
      if (fixedPasswordIds.includes(astro._id.toString())) {
        newPassword = "9999";
      } else {
        // 👉 Others follow firstname@123 logic
        const firstName = astro.name?.split(" ")[0]?.toLowerCase() || "astro";
        newPassword = `${firstName}@123`;
      }

      const salt = await bcrypt.genSalt(10);
      const hashed = await bcrypt.hash(newPassword, salt);

      astro.password = hashed;
      astro.loginMethod = Enums.USER.LOGIN_METHOD.PASSWORD;
      await astro.save();

      logger.info(
        `✔ Updated password for astrologer: ${astro._id} (${astro.email})`,
      );
    }

    logger.info(
      "🎉 Password reset completed successfully with exceptions handled.",
    );
  } catch (err) {
    logger.error("❌ Error in resetAstrologerPasswords seeder:", err);
  }
};

module.exports = resetAstrologerPasswords;
