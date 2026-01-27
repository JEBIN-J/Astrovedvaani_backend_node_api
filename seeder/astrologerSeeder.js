const bcrypt = require("bcryptjs");
const User = require("../models/User");
const Astrologer = require("../models/Astrologer");
const Wallet = require("../models/Wallet");
const AstrologerServiceRates = require("../models/AstrologerServiceRates");
const Enums = require("../utils/constants");
const logger = require("../utils/logger");
const { createWallet } = require("../services/walletService");

const ASTROLOGERS = [
  {
    email: "devansh@gmail.com",
    mobile: "8000000101",
    displayName: "Devansh Tripathi",
    experience: 11,
  },
  {
    email: "isha@gmail.com",
    mobile: "8000000102",
    displayName: "Isha Malhotra",
    experience: 7,
  },
  {
    email: "abhay@gmail.com",
    mobile: "8000000103",
    displayName: "Abhay Kulkarni",
    experience: 9,
  },
  {
    email: "sanya@gmail.com",
    mobile: "8000000104",
    displayName: "Sanya Oberoi",
    experience: 13,
  },
  {
    email: "nikhil@gmail.com",
    mobile: "8000000105",
    displayName: "Nikhil Deshpande",
    experience: 6,
  },
  {
    email: "ritika@gmail.com",
    mobile: "8000000106",
    displayName: "Ritika Chatterjee",
    experience: 8,
  },
];

const createAstrologerUser = async () => {
  try {
    logger.info("🚀 Starting astrologer seeder (5 astrologers)");

    const password = "9999";
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    for (const astro of ASTROLOGERS) {
      // ---------------- USER ----------------
      let user = await User.findOne({ email: astro.email });

      if (!user) {
        user = new User({
          name: astro.displayName,
          email: astro.email,
          mobileNumber: astro.mobile,
          loginMethod: Enums.USER.LOGIN_METHOD.PASSWORD,
          password: hashedPassword,
          role: Enums.USER.ROLE.ASTROLOGER,
          isActive: true,
          verificationStatus: Enums.USER.VERIFICATION_STATUS.APPROVED,
          isOnboarded: true,
        });

        await user.save();
        logger.info(`✅ User created: ${astro.email}`);
      } else {
        logger.info(`ℹ️ User already exists: ${astro.email}`);
      }

      // ---------------- ASTROLOGER PROFILE ----------------
      let astrologerProfile = await Astrologer.findOne({
        user_id: user._id,
      });

      if (!astrologerProfile) {
        astrologerProfile = new Astrologer({
          user_id: user._id,
          display_name: astro.displayName,
          bio: "Professional astrologer with years of experience.",
          experience_years: astro.experience,
          is_online: false,
          is_premium: true,
          timezone: "Asia/Kolkata",
          bank_account_number: "1234567890",
          ifsc: "HDFC0001234",
        });

        await astrologerProfile.save();
        logger.info(`🧙 Profile created: ${astro.displayName}`);
      }

      // ---------------- SERVICE RATES ----------------
      const defaultRates = [
        {
          service_type: Enums.SERVICE.TYPE.CHAT,
          rate: 50,
          commission_pct: 20,
        },
        {
          service_type: Enums.SERVICE.TYPE.CALL,
          rate: 80,
          commission_pct: 25,
        },
        {
          service_type: Enums.SERVICE.TYPE.VIDEO,
          rate: 100,
          commission_pct: 30,
        },
      ];

      for (const rate of defaultRates) {
        const existingRate = await AstrologerServiceRates.findOne({
          astrologer_id: astrologerProfile._id,
          service_type: rate.service_type,
        });

        if (!existingRate) {
          await AstrologerServiceRates.create({
            astrologer_id: astrologerProfile._id,
            ...rate,
          });
        }
      }

      // ---------------- WALLET ----------------
      const wallet = await Wallet.findOne({ user_id: user._id });
      if (!wallet) {
        await createWallet(user._id);
        logger.info(`💰 Wallet created for ${astro.displayName}`);
      }
    }

    logger.info("🎉 Seeder finished: 5 astrologers created successfully");
  } catch (error) {
    logger.error("❌ Error running astrologer seeder:", error);
  }
};

module.exports = createAstrologerUser;
