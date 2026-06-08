const AstrologerActivity = require("../models/AstrologerActivity");
const logger = require("./logger");

function getDateKey() {
  return new Date().toISOString().split("T")[0];
}

async function markAstrologerOnline(astrologerId) {
  try {
    const dateKey = getDateKey();

    await AstrologerActivity.updateOne(
      {
        astrologer_id: astrologerId,
        activity_date: dateKey,
      },
      {
        $setOnInsert: {
          astrologer_id: astrologerId,
          activity_date: dateKey,
          first_login_at: new Date(),
        },

        $set: {
          is_online: true,
          current_login_at: new Date(),
        },

        $inc: {
          login_count: 1,
        },
      },
      {
        upsert: true,
      }
    );
  } catch (error) {
    logger.error(
      `[Activity] markAstrologerOnline failed`,
      error
    );
  }
}

async function markAstrologerOffline(astrologerId) {
  try {
    const dateKey = getDateKey();

    const activity =
      await AstrologerActivity.findOne({
        astrologer_id: astrologerId,
        activity_date: dateKey,
      });

    if (
      !activity ||
      !activity.current_login_at
    ) {
      return;
    }

    const now = new Date();

    const duration = Math.floor(
      (now - activity.current_login_at) / 1000
    );

    await AstrologerActivity.updateOne(
      {
        _id: activity._id,
      },
      {
        $set: {
          is_online: false,
          current_login_at: null,
          last_logout_at: now,
        },

        $inc: {
          total_online_seconds: duration,
        },
      }
    );
  } catch (error) {
    logger.error(
      `[Activity] markAstrologerOffline failed`,
      error
    );
  }
}

module.exports = {
  markAstrologerOnline,
  markAstrologerOffline,
};