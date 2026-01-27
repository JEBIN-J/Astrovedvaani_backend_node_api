const logger = require("../../utils/logger");
const sendPushNotification = require("./sendNotification");

async function notifyAstrologerAssigned({ astrologerUserId, poojaName, scheduledAt }) {
  return sendPushNotification(
    astrologerUserId,
    "New Pooja Assigned",
    `You have been assigned to perform ${poojaName} scheduled at ${new Date(scheduledAt).toLocaleString()}`,
    { type: "ASSIGN_POOJA", poojaName, scheduledAt }
  );
}

async function notifyAstrologerRemoved({ astrologerUserId, poojaName }) {
  return sendPushNotification(
    astrologerUserId,
    "Pooja Reassignment",
    `You have been removed from ${poojaName}. Another astrologer has been assigned.`,
    { type: "REMOVE_POOJA", poojaName }
  );
}

async function notifyUserPoojaAssigned({ userId, astrologerName, poojaName, scheduledAt }) {
  return sendPushNotification(
    userId,
    "Astrologer Assigned",
    `${astrologerName} has been assigned to your ${poojaName} scheduled at ${new Date(scheduledAt).toLocaleString()}`,
    { type: "USER_POOJA_UPDATE", astrologerName, poojaName, scheduledAt }
  );
}

async function notifyByRole({ role, title, body, data = {} }) {
  try {
    const User = require("../models/User");
    const users = await User.find({ role });
    logger.info(`[NOTIF] Sending campaign to role=${role}, count=${users.length}`);

    for (const user of users) {
      await sendPushNotification(user._id, title, body, { role, ...data });
    }
  } catch (err) {
    logger.error(`[NOTIF] Failed to notify role ${role}: ${err.message}`, { stack: err.stack });
  }
}
async function notifyAstrologerPoojaConfirmed({ astrologerUserId, poojaName, scheduledAt, amount }) {
  return sendPushNotification(
    astrologerUserId,
    "Pooja Completed",
    `The Pooja "${poojaName}" scheduled at ${new Date(scheduledAt).toLocaleString()} is marked as completed. Your commission ₹${amount} has been credited.`,
    { type: "POOJA_COMPLETED", poojaName, scheduledAt, amount }
  );
}
async function notifyUsers(users, title, message, data = {}) {
  for (const user of users) {
    try {
      await sendPushNotification(user._id, title, message, data);
    } catch (err) {
      logger.error(`[NOTIF] Failed for user ${user._id}: ${err.message}`);
    }
  }
}
module.exports = {
  notifyAstrologerAssigned,
  notifyAstrologerRemoved,
  notifyUserPoojaAssigned,
  notifyByRole,
  notifyAstrologerPoojaConfirmed,
  notifyUsers
};
