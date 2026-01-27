const User = require("../models/User");
const logger = require("../utils/logger");

const normalizeUsers = async () => {
  try {
    logger.info("Starting user normalization...");
    const users = await User.find({ mobileNumber: { $ne: null } });
    let duplicates = 0;
    let updated = 0;
    for (const user of users) {
      let { mobileNumber, countryCode } = user;
      if (/^\+91/.test(mobileNumber)) {
        mobileNumber = mobileNumber.replace(/^\+91/, "");
        countryCode = "+91";
      }
      if (!countryCode) {
        countryCode = "+91";
      }
      mobileNumber = mobileNumber.trim();
      countryCode = countryCode.trim();
      try {
        await User.updateOne(
          { _id: user._id },
          { $set: { mobileNumber, countryCode } }
        );
        updated++;
      } catch (err) {
        if (err.code === 11000) {
          logger.warn(
            `Duplicate detected for ${countryCode}${mobileNumber} (userId: ${user._id})`
          );
          duplicates++;
        } else {
          logger.error(`Error updating user ${user._id}: ${err.message}`);
        }
      }
    }

    logger.info(
      `User normalization finished. ✅ Updated: ${updated}, ⚠️ Duplicates: ${duplicates}`
    );
  } catch (error) {
    logger.error("Error running NormalizeUsersSeeder:", error);
  }
};

module.exports = normalizeUsers;
