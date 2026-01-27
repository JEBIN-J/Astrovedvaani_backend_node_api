const bcrypt = require("bcryptjs");
const User = require("../models/User");
const Wallet = require("../models/Wallet");
const Enums = require("../utils/constants");
const logger = require("../utils/logger");
const { createWallet } = require("../services/walletService");

const createVendorUser = async () => {
  try {
    logger.info("Starting vendor user seeder...");

    const VENDOR_EMAIL = "vendor@gmail.com";
    const VENDOR_MOBILE = "7000000009";

    // Remove any old vendor with same email
    await User.deleteMany({ email: VENDOR_EMAIL });
    logger.info(`Deleted existing vendor with email ${VENDOR_EMAIL}`);

    // Check if vendor already exists by role + mobile
    let existingVendor = await User.findOne({
      role: Enums.USER.ROLE.VENDOR,
      mobileNumber: VENDOR_MOBILE,
    });

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash("8888", salt);

    if (existingVendor) {
      // 🔄 Update existing vendor
      existingVendor.name = "Vendor User";
      existingVendor.email = VENDOR_EMAIL;
      existingVendor.loginMethod = Enums.USER.LOGIN_METHOD.PASSWORD;
      existingVendor.password = hashedPassword;
      existingVendor.isActive = true;
      existingVendor.isBlock = false;
      existingVendor.verificationStatus =
        Enums.USER.VERIFICATION_STATUS.APPROVED;
      existingVendor.isOnboarded = true;

      await existingVendor.save();
      logger.info(`Vendor updated successfully: ${existingVendor._id}`);
    } else {
      // 🆕 Create new vendor
      existingVendor = new User({
        name: "Vendor User",
        email: VENDOR_EMAIL,
        mobileNumber: VENDOR_MOBILE,
        countryCode: "+91",
        loginMethod: Enums.USER.LOGIN_METHOD.PASSWORD,
        password: hashedPassword,
        role: Enums.USER.ROLE.VENDOR,
        isActive: true,
        isBlock: false,
        verificationStatus: Enums.USER.VERIFICATION_STATUS.APPROVED,
        isOnboarded: true,
      });

      await existingVendor.save();
      logger.info(`Vendor created successfully: ${existingVendor._id}`);
    }

    // 💰 Wallet check
    const existingWallet = await Wallet.findOne({
      user_id: existingVendor._id,
    });

    if (!existingWallet) {
      await createWallet(existingVendor._id);
      logger.info("Vendor wallet created successfully.");
    } else {
      logger.info("Vendor wallet already exists.");
    }

    logger.info("Vendor seeder finished successfully.");
  } catch (error) {
    logger.error("Error running vendor seeder:", error);
  }
};

module.exports = createVendorUser;
