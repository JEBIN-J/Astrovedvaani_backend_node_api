const bcrypt = require("bcryptjs");
const User = require("../models/User");
const Wallet = require("../models/Wallet");
const Enums = require("../utils/constants");
const logger = require("../utils/logger");
const { createWallet } = require("../services/walletService");

const createSuperAdminUser = async () => {
  try {
    logger.info("Starting super admin user seeder...");

    await User.deleteMany({ email: "superadmin@astrovedvanni.com" });
    logger.info(
      "Deleted any existing user with reserved superadmin@astrovedvanni.com",
    );

    // Check by role
    let existingSuperAdmin = await User.findOne({
      role: Enums.USER.ROLE.SUPER_ADMIN,
    });
    logger.info(
      existingSuperAdmin
        ? `Found existing super admin: ${existingSuperAdmin._id}`
        : "No super admin found, will create new.",
    );

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash("superadmin", salt);
    logger.info("Password hashed successfully.");

    if (existingSuperAdmin) {
      // Update existing super admin
      existingSuperAdmin.name = "Super Admin";
      existingSuperAdmin.email = "superadmin@astrovedvanni.com";
      existingSuperAdmin.mobileNumber = "060606060606";
      existingSuperAdmin.loginMethod = Enums.USER.LOGIN_METHOD.PASSWORD;
      existingSuperAdmin.password = hashedPassword;
      existingSuperAdmin.isActive = true;
      existingSuperAdmin.verificationStatus =
        Enums.USER.VERIFICATION_STATUS.APPROVED;
      existingSuperAdmin.isOnboarded = true;

      await existingSuperAdmin.save();
      logger.info(
        `Super Admin user updated successfully: ${existingSuperAdmin._id}`,
      );
    } else {
      // Create fresh super admin
      existingSuperAdmin = new User({
        name: "Super Admin",
        email: "superadmin@astrovedvanni.com",
        mobileNumber: "060606060606",
        loginMethod: Enums.USER.LOGIN_METHOD.PASSWORD,
        password: hashedPassword,
        role: Enums.USER.ROLE.SUPER_ADMIN,
        isActive: true,
        verificationStatus: Enums.USER.VERIFICATION_STATUS.APPROVED,
        isOnboarded: true,
      });

      await existingSuperAdmin.save();
      logger.info(
        `Super Admin user created successfully: ${existingSuperAdmin._id}`,
      );
    }

    // Wallet check
    const existingWallet = await Wallet.findOne({
      user_id: existingSuperAdmin._id,
    });
    if (!existingWallet) {
      await createWallet(existingSuperAdmin._id);
      logger.info("Super Admin wallet created successfully.");
    } else {
      logger.info("Super Admin wallet already exists.");
    }

    logger.info("Super Admin seeder finished.");
  } catch (error) {
    logger.error("Error running super admin seeder:", error);
  }
};

module.exports = createSuperAdminUser;
