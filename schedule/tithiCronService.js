const cron = require("node-cron");
const tithiSchedule = require("../models/tithiSchedule");
const sendMail = require("../services/communication/emailService").sendMail;

cron.schedule(
  "0 0 * * *", // daily 12:00 AM
  async () => {
    logger.info("⏰ Cron Job: Checking Tithi schedules at 12:00 AM...");
    console.log("✅ Cron job running at 12:00 AM...");

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    try {
      const schedules = await tithiSchedule.find({ date: today });

      for (let schedule of schedules) {
        const emailToSend = schedule.email;
        if (!emailToSend) continue;

        await sendMail(
          emailToSend,
          `Today's Tithi Reminder - ${schedule.tithi}`,
          `Namaste,\n\nToday is ${schedule.tithi}.\nSpecial Tithi: ${
            schedule.specialTithi || "N/A"
          }.\n\nHave a blessed day! 🙏`,
        );

        logger.info(`📩 Mail sent to ${emailToSend} for date ${schedule.date}`);
      }
    } catch (err) {
      logger.error("❌ Error in Tithi Cron Job:", err);
    }
  },
  {
    timezone: "Asia/Kolkata",
  },
);
