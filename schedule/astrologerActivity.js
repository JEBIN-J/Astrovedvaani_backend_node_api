const Astrologer = require("../models/Astrologer");
const AstrologerActivity = require("../models/AstrologerActivity");
const cron = require("node-cron");

async function rolloverOnlineAstrologers() {
  try {
    console.log(
      "Starting astrologer activity rollover..."
    );

    const now = new Date();

    const dateKey = now
      .toISOString()
      .split("T")[0];

    const onlineAstrologers =
      await Astrologer.find({
        is_online: true,
      }).select("_id");

    console.log(
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

        console.log(
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

      console.log(
        `Rolled over astrologer ${astrologer._id} (${duration}s)`
      );
    }

    console.log(
      "Astrologer activity rollover completed"
    );
  } catch (error) {
    console.error(
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