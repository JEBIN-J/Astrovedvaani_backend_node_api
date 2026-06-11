const cron = require("node-cron");
const logger = require("../utils/logger");
const ScheduledNotification = require("../models/scheduleNotification");

const sendPushNotification = require("../services/notification/sendNotification");
const User = require("../models/User");
const Enums = require("../utils/constants");
const Wallet = require("../models/Wallet");

// Run ONLY at 12:00 AM every day
cron.schedule("0 0 * * *", async () => {
  const now = new Date();
  logger.info(`[NOTIF-WORKER] 12:00 AM tick — ${now.toISOString()}`);

  try {
    const pending = await ScheduledNotification.find({
      sent: false,
      sendAt: { $lte: now },
      attempts: { $lt: 5 },
    }).limit(100);

    logger.info(
      `[NOTIF-WORKER] Found ${pending.length} due notifications at 12:00 AM`,
    );

    for (const n of pending) {
      logger.info(
        `[NOTIF-WORKER] Trying notification id=${n._id} user=${n.userId}`,
      );

      try {
        await sendPushNotification(n.userId, n.title, n.body, n.data);

        n.sent = true;
        n.attempts += 1;
        await n.save();

        logger.info(`[NOTIF-WORKER]  Sent scheduled notification ${n._id}`);
      } catch (err) {
        n.attempts += 1;
        n.lastError = err.message;
        await n.save();

        logger.error(
          `[NOTIF-WORKER]  Failed notification ${n._id}: ${err.message}`,
        );
      }
    }
  } catch (err) {
    logger.error(`[NOTIF-WORKER] Worker error: ${err.message}`, {
      stack: err.stack,
    });
  }
});

const dailyZodiacMessage = {
  header: "🌈 Morning, Star Child!",
  sub: "The universe has a message for you — tap to reveal your day vibe.",
};

cron.schedule(
  "0 13 * * *", //  Runs daily at 1 PM IST
  async () => {
    logger.info("[DAILY-ZODIAC] Cron started at 1:00 PM");

    try {
      // Valid user filter: FCM present + roles excluded
      const users = await User.find({
        fcmToken: { $exists: true, $nin: ["", null] },

        role: {
          $nin: [
            Enums.USER.ROLE.SUPER_ADMIN,
            Enums.USER.ROLE.ADMIN,
            Enums.USER.ROLE.VENDOR,
            Enums.USER.ROLE.ASTROLOGER,
          ],
        },
      }).select("_id name fcmToken");

      logger.info(`[DAILY-ZODIAC] Eligible users: ${users.length}`);

      const msg = dailyZodiacMessage;
      let successList = []; // successful user logs only

      for (const u of users) {
        try {
          await sendPushNotification(u._id, msg.header, msg.sub, {
            type: "DAILY_ZODIAC",
          });

          successList.push({
            id: u._id,
            name: u.name || "Unknown",
          });
        } catch (err) {
          // fail log skip or keep minimal
          logger.warn(
            `[DAILY-ZODIAC] Failed for ${u._id} (${u.name || "Unknown"})`,
          );
        }
      }

      // ✔ FINAL CLEAN SUMMARY — Only successful deliveries
      logger.info(
        `[DAILY-ZODIAC] Notification sent to ${successList.length} users`,
      );

      // ✔ Log individual success users
      successList.forEach((u) => {
        logger.info(`[DAILY-ZODIAC] Sent → userId: ${u.id}, name: ${u.name}`);
      });
    } catch (err) {
      logger.error("[DAILY-ZODIAC] Error in cron job: " + err.message, {
        stack: err.stack,
      });
    }
  },
  { timezone: "Asia/Kolkata" },
);

const lowBalanceMessages = [
  {
    header: "💸 Your Wallet is on “Bare Minimum",
    sub: "Recharge before it goes full broke mode.",
  },
];

function getLowBalanceMessage() {
  const idx = Math.floor(Math.random() * lowBalanceMessages.length);
  return lowBalanceMessages[idx];
}

//  LOW BALANCE ALERT CRON
cron.schedule(
  "0 13 * * *",
  async () => {
    const now = new Date();
    logger.info(
      `[WALLET-ALERT] Tick at ${now.toISOString()} — checking low balance wallets`,
    );

    try {
      const wallets = await Wallet.find({
        balance: { $lt: 50 },
      }).populate({
        path: "user_id",
        select: "_id name role fcmToken",
      });

      logger.info(
        `[WALLET-ALERT] Found ${wallets.length} wallets with balance < 50`,
      );

      const msg = getLowBalanceMessage();
      let successCount = 0;
      let skipCount = 0;
      let failCount = 0;

      for (const w of wallets) {
        const user = w.user_id;

        if (!user) {
          logger.warn(
            `[WALLET-ALERT] Wallet ${w._id} has no linked user, skipping`,
          );
          skipCount++;
          continue;
        }

        //  ROLE FILTER: Super Admin / Admin / Vendor skip
        if (
          user.role === Enums.USER.ROLE.SUPER_ADMIN ||
          user.role === Enums.USER.ROLE.ADMIN ||
          user.role === Enums.USER.ROLE.VENDOR ||
          user.role === Enums.USER.ROLE.ASTROLOGER
        ) {
          logger.info(
            `[WALLET-ALERT] Skipping user ${user._id} (${
              user.name || "Unknown"
            }) due to role=${user.role}`,
          );
          skipCount++;
          continue;
        }

        if (!user.fcmToken) {
          logger.warn(
            `[WALLET-ALERT] No FCM token for user ${user._id} (${
              user.name || "Unknown"
            })`,
          );
          skipCount++;
          continue;
        }

        //  Notification sending
        try {
          await sendPushNotification(user._id, msg.header, msg.sub, {
            type: "WALLET_LOW_BALANCE",
            balance: w.balance,
          });

          successCount++;
          logger.info(
            `[WALLET-ALERT]  Sent low balance alert to user ${user._id} (balance=${w.balance})`,
          );
        } catch (err) {
          failCount++;
          logger.error(
            `[WALLET-ALERT]  Failed to send to user ${user._id}: ${err.message}`,
          );
        }
      }

      logger.info(
        `[WALLET-ALERT] Summary: success=${successCount}, skipped=${skipCount}, failed=${failCount}`,
      );
    } catch (err) {
      logger.error(
        `[WALLET-ALERT] Error while checking low balance wallets: ${err.message}`,
        { stack: err.stack },
      );
    }
  },
  {
    timezone: "Asia/Kolkata",
  },
);

async function notifyWalletAdjustment({
  userId,
  amount,
  openingBalance,
  closingBalance,
  direction,
}) {
  const isCredit = direction === Enums.TRANSACTION.DIRECTION.CREDIT;

  const title = isCredit ? "💰 Wallet Credited!" : "💸 Wallet Debited!";

  const body = isCredit
    ? `₹${amount} has been added to your wallet. Enjoy uninterrupted guidance ✨`
    : `₹${amount} has been deducted from your wallet.`;

  return sendPushNotification(userId, title, body, {
    type: isCredit ? "WALLET_CREDIT" : "WALLET_DEBIT",
    amount,
    openingBalance,
    closingBalance,
    channelId: Enums.USER.CHANNEL.WALLET,
  });
}

module.exports = {
  notifyWalletAdjustment,
};
