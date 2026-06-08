const cron = require("node-cron");

const User = require("../models/User");

const {
  generateSalarySlipPdf,
} = require("../services/communication/template/salarySlipTemplate");

const Enums = require("../utils/constants");

exports.startSalarySlipCron = () => {
  // RUN EVERY MONTH ON 1ST DATE AT 12:00 AM IST
  cron.schedule(
    "0 0 1 * *",
    async () => {
      try {
        console.log("Starting salary slip generation...");

        const currentDate = new Date();

        let month = currentDate.getMonth(); // PREVIOUS MONTH
        let year = currentDate.getFullYear();

        // HANDLE JANUARY CASE
        if (month === 0) {
          month = 12;

          year = year - 1;
        }

        console.log(`Generating salary slips for ${month}-${year}`);

        const astrologers = await User.find({
          role: Enums.USER.ROLE.ASTROLOGER,
          isDeleted: false,
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

            console.log(
              `Salary slip generated for astrologer ${astrologer._id}`,
            );
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
    },
    {
      timezone: "Asia/Kolkata",
    },
  );
};
