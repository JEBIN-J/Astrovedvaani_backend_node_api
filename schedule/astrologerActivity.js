const Astrologer = require("../models/Astrologer");
const AstrologerActivity = require("../models/AstrologerActivity");
const cron = require("node-cron");
const logger = require("../utils/logger");

async function rolloverOnlineAstrologers() {
  try {
    logger.info(
      "Starting astrologer activity rollover at 12:00 AM"
    );

    const now = new Date();

    const dateKey = now
      .toISOString()
      .split("T")[0];

    const onlineAstrologers =
      await Astrologer.find({
        is_online: true,
      }).select("_id");

    logger.info(
      `Found ${onlineAstrologers.length} online astrologers`
    );

    for (const astrologer of onlineAstrologers) {
      const activity =
        await AstrologerActivity.findOne({
          astrologer_id: astrologer._id,
          activity_date: dateKey,
        });

      if (!activity) {
        await AstrologerActivity.create({
          astrologer_id: astrologer._id,
          activity_date: dateKey,
          first_login_at: now,
          current_login_at: now,
          is_online: true,
          login_count: 1,
          total_online_seconds: 0,
        });

        logger.info(
          `Created activity for astrologer ${astrologer._id}`
        );

        continue;
      }

      const duration = Math.floor(
        (now - activity.current_login_at) /
          1000
      );

      activity.total_online_seconds +=
        duration;

      activity.current_login_at = now;

      activity.is_online = true;

      await activity.save();

      logger.info(
        `Rolled over astrologer ${astrologer._id} (${duration}s)`
      );
    }

    logger.info(
      "Astrologer activity rollover completed"
    );
  } catch (error) {
    logger.error(
      "Rollover Error:",
      error
    );
  }
}

cron.schedule(
  "0 0 * * *",
  rolloverOnlineAstrologers,
  {
    timezone: "Asia/Kolkata",
  }
);