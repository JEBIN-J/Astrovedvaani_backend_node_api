const cron = require("node-cron");

const User = require("../models/User");

const { generateSalarySlipPdf } = require("../services/salarySlipService");

const Enums = require("../utils/constants");

exports.startSalarySlipCron = () => {
  // RUN EVERY MONTH ON 1ST DATE AT 12:00 AM
  cron.schedule("0 0 1 * *", async () => {
    try {
      console.log("Starting salary slip generation...");

      // PREVIOUS MONTH
      const currentDate = new Date();

      const month = currentDate.getMonth(); // previous month
      const year = currentDate.getFullYear();

      // ALL ASTROLOGERS
      const astrologers = await User.find({
        role: Enums.USER.ROLE.ASTROLOGER,
        isActive: true,
      }).lean();

      console.log(`Generating slips for ${astrologers.length} astrologers`);

      for (const astrologer of astrologers) {
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
            err.message,
          );
        }
      }

      console.log("Salary slip generation completed");
    } catch (error) {
      console.error("Salary Slip Cron Error:", error);
    }
  });
};
