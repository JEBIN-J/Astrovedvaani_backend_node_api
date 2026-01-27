const logger = require("../utils/logger");
const initializeRankings = require("./initRankings");
const createDefaultCategories = require("./BlogCategorySeeder");
const createSessionSetting = require("./intiallySetting");
const createSetting = require("./settingSeeder");
const normalizeUsers = require("./NormalizeUsersSeeder");
const createSuperAdminUser = require("./SuperAdminSeeder");
const seedLanguages = require("./seedLanguages");
const seedSpecializations = require("./seedSpecializtions");
const updateAstrologers = require("./updateAstrologer");
const createAstrologerUser = require("./astrologerSeeder");
const resetAstrologerPasswords = require("./astrologerResetPassword");
const createVendorUser = require("./vendorSeeder");
const createAdminUser = require("./adminSeeder");
const seedPooja = require("./poojaSeederUpdate");
const Product = require("../models/Product");
const normalizeProductPricesSeeder = require("./NormalizeProductPricesSeeder");
const migratePoojaPricingSeeder = require("./fixPoojaPricing");
const runSeeder = async () => {
  try {
    // await createSuperAdminUser();
    // await initializeRankings();
    // await createDefaultCategories();
    // await createSessionSetting();
    // await createSetting();
    // await normalizeUsers();
    // await seedLanguages();
    // await seedSpecializations();
    // // await updateAstrologers();
    // await createAstrologerUser();
    // await resetAstrologerPasswords();
    // await createVendorUser();
    // await createAdminUser();
    // await seedPooja();
    // await normalizeProductPricesSeeder();
    // await migratePoojaPricingSeeder();
    await logger.info("Seeder: All seeding tasks completed successfully.");
  } catch (error) {
    logger.error("Seeder: Failed to seed admin user:", error);
  }
};

module.exports = runSeeder;
