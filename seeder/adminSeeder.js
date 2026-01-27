const bcrypt = require("bcryptjs");
const User = require("../models/User");
const Wallet = require("../models/Wallet");
const Enums = require("../utils/constants");
const logger = require("../utils/logger");
const { createWallet } = require("../services/walletService");

const createAdminUser = async () => {
  try {
    logger.info("Starting admin user seeder...");

    const ADMIN_EMAIL = "admin@gmail.com";
    const ADMIN_MOBILE = "8000000031";

    // Remove any old admin with same email
    await User.deleteMany({ email: ADMIN_EMAIL });
    logger.info(`Deleted existing admin with email ${ADMIN_EMAIL}`);

    // Check existing admin by role
    let existingAdmin = await User.findOne({
      role: Enums.USER.ROLE.ADMIN,
    });

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash("8888", salt);

    if (existingAdmin) {
      // 🔄 Update existing admin
      existingAdmin.name = "Admin User";
      existingAdmin.email = ADMIN_EMAIL;
      existingAdmin.mobileNumber = ADMIN_MOBILE;
      existingAdmin.countryCode = "+91";
      existingAdmin.loginMethod = Enums.USER.LOGIN_METHOD.PASSWORD;
      existingAdmin.password = hashedPassword;
      existingAdmin.isActive = true;
      existingAdmin.isBlock = false;
      existingAdmin.verificationStatus =
        Enums.USER.VERIFICATION_STATUS.APPROVED;
      existingAdmin.isOnboarded = true;

      await existingAdmin.save();
      logger.info(`Admin updated successfully: ${existingAdmin._id}`);
    } else {
      // 🆕 Create new admin
      existingAdmin = new User({
        name: "Admin User",
        email: ADMIN_EMAIL,
        mobileNumber: ADMIN_MOBILE,
        countryCode: "+91",
        loginMethod: Enums.USER.LOGIN_METHOD.PASSWORD,
        password: hashedPassword,
        role: Enums.USER.ROLE.ADMIN,
        isActive: true,
        isBlock: false,
        verificationStatus: Enums.USER.VERIFICATION_STATUS.APPROVED,
        isOnboarded: true,
      });

      await existingAdmin.save();
      logger.info(`Admin created successfully: ${existingAdmin._id}`);
    }

    // 💰 Wallet check
    const existingWallet = await Wallet.findOne({
      user_id: existingAdmin._id,
    });

    if (!existingWallet) {
      await createWallet(existingAdmin._id);
      logger.info("Admin wallet created successfully.");
    } else {
      logger.info("Admin wallet already exists.");
    }

    logger.info("Admin seeder finished successfully.");
  } catch (error) {
    logger.error("Error running admin seeder:", error);
  }
};

module.exports = createAdminUser;
