const cron = require("node-cron");

const User = require("../models/User");

const { generateSalarySlipPdf } = require("../services/salarySlipService");

const Enums = require("../utils/constants");

exports.startSalarySlipCron = () => {
  // TEST: Every 1 minute
  cron.schedule("* * * * *", async () => {
    try {
      console.log("Starting monthly salary slip cron...");

      // Test month/year
      const month = 5;

      const year = 2026;

      // ONLY ONE ASTROLOGER
      const astrologer = await User.findOne({
        _id: "6a0466199f02a7e988cfefb7",
        role: Enums.USER.ROLE.ASTROLOGER,
        isActive: true,
      }).lean();

      if (!astrologer) {
        console.log("No astrologer found");

        return;
      }

      console.log(`Generating salary slip for astrologer ${astrologer._id}`);

      try {
        await generateSalarySlipPdf({
          userId: astrologer._id,

          month,

          year,
        });

        console.log(`Salary slip generated for astrologer ${astrologer._id}`);
      } catch (err) {
        console.error(
          `Salary slip failed for astrologer ${astrologer._id}`,
          err,
        );
      }

      console.log("Monthly salary slip cron completed");
    } catch (error) {
      console.error("Salary Slip Cron Error:", error);
    }
  });
};
