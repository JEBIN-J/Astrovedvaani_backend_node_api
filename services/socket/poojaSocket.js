const Notification = require('../../models/Notification');
const Enums = require('../../utils/constants');
const logger = require('../../utils/logger');
const User = require('../../models/User');
const { formatNotification } = require('../../utils/notificationFormatter');

let io = null;
let getOnlineAdmins = null;

let globalAdminUserId = null;

function setGlobalAdminUserId(adminId) {
  globalAdminUserId = adminId;
}


function registerPoojaSocketManager(socketManager) {
  io = socketManager.io;
  getOnlineAdmins = () => Array.from(socketManager.onlineAdmins || []);
  logger.info('[PoojaSocket] Pooja Socket Manager registered');
}

async function emitPoojaBookingToAdmins({ userId, bookingId, poojaName, scheduledAt }) {
  if (!io || !getOnlineAdmins) {
    logger.warn('[PoojaSocket] SocketManager not initialized');
    return;
  }

  const message = `New Pooja Booking: ${poojaName} scheduled on ${new Date(scheduledAt).toLocaleString()}`;

  logger.info('[PoojaSocket] Emitting pooja booking alert to admins');

  try {

    const allAdmins = await User.find({
      role: Enums.USER.ROLE.ADMIN,
      isActive: true
    }).select('_id').lean();

    logger.info(`[PoojaSocket] Found ${allAdmins.length} total admin(s)`);

    await Promise.all(
      allAdmins.map(async (admin) => {
        try {
          const notification = await Notification.create({
            recipient_id: admin._id,
            sender_id: userId,
            type: Enums.NOTIFICATION.NOTIFICATION_TYPE.POOJA_BOOKING,
            title: 'New Pooja Booking',
            message,
            related_entity: {
              entity_type: 'PoojaBooking',
              entity_id: bookingId
            }
          });

          logger.info(`[PoojaSocket] Notification created for adminId=${admin._id}, id=${notification._id}`);

          const formatted = formatNotification(notification);
          io.to('admins').emit('pooja_booking_alert', formatted);

        } catch (err) {
          logger.error(`[PoojaSocket] Failed to create notification for adminId=${admin._id}:`, err);
        }
      })
    );
  } catch (err) {
    logger.error('[PoojaSocket] Failed to fetch admins or create notifications:', err);
  }
}

async function emitPoojaCancellationToAdmins({ userId, bookingId, poojaName, scheduledAt }) {
  if (!io || !getOnlineAdmins) {
    logger.warn('[PoojaSocket] SocketManager not initialized for cancellation');
    return;
  }

  const message = `Pooja Booking Cancelled: ${poojaName} originally scheduled on ${new Date(scheduledAt).toLocaleString()}`;

  logger.info('[PoojaSocket] Emitting pooja cancellation alert to admins');

  try {
    const allAdmins = await User.find({
      role: Enums.USER.ROLE.ADMIN,
      isActive: true
    }).select('_id').lean();

    logger.info(`[PoojaSocket] Found ${allAdmins.length} total admin(s) for cancellation notice`);

    await Promise.all(
      allAdmins.map(async (admin) => {
        try {
          const notification = await Notification.create({
            recipient_id: admin._id,
            sender_id: userId,
            type: Enums.NOTIFICATION.NOTIFICATION_TYPE.POOJA_CANCEL,
            title: 'Pooja Booking Cancelled',
            message,
            related_entity: {
              entity_type: 'PoojaBooking',
              entity_id: bookingId
            }
          });

          logger.info(`[PoojaSocket] Cancellation notification saved for adminId=${admin._id}`);

          const formatted = formatNotification(notification);
          io.to('admins').emit('pooja_booking_cancelled_alert', formatted);

        } catch (err) {
          logger.error(`[PoojaSocket] Failed to save cancellation notification for adminId=${admin._id}:`, err);
        }
      })
    );
  } catch (err) {
    logger.error('[PoojaSocket] Failed to notify admins of cancellation:', err);
  }
}

async function emitAstrologerAssigned({ bookingId, astrologerUserId, userId, poojaName, scheduledAt, adminUserId = null }) {
  if (!io) {
    logger.warn('[PoojaSocket] SocketManager not initialized for astrologer assignment');
    return;
  }

  const message = `Astrologer assigned for your Pooja: ${poojaName} on ${new Date(scheduledAt).toLocaleString()}`;
  const senderId = adminUserId || globalAdminUserId || null;

  const notificationPayload = {
    type: Enums.NOTIFICATION.NOTIFICATION_TYPE.ASTROLOGER_ASSIGNED,
    title: 'Astrologer Assigned',
    message,
    related_entity: {
      entity_type: 'PoojaBooking',
      entity_id: bookingId
    }
  };

  for (const user of [userId, astrologerUserId]) {
    try {
      const notification = await Notification.create({
        ...notificationPayload,
        recipient_id: user,
        sender_id: senderId
      });

      const formatted = formatNotification(notification);
      io.to(`user:${user}`).emit('astrologer_assigned_alert', formatted);
    } catch (err) {
      logger.error(`[PoojaSocket] Failed to emit astrologer assignment to userId=${user}:`, err);
    }
  }
}

async function emitBookingStatusUpdate({ bookingId, userId, astrologerUserId, status, scheduledAt, adminUserId = null }) {
  if (!io) {
    logger.warn('[PoojaSocket] SocketManager not initialized for booking status update');
    return;
  }

  const message = `Booking status updated to "${status}" scheduled on ${new Date(scheduledAt).toLocaleString()}`;
  const senderId = adminUserId || globalAdminUserId || null;

  const notificationPayload = {
    type: Enums.NOTIFICATION.NOTIFICATION_TYPE.BOOKING_STATUS_UPDATED,
    title: 'Booking Updated',
    message,
    related_entity: {
      entity_type: 'PoojaBooking',
      entity_id: bookingId
    }
  };

  for (const user of [userId, astrologerUserId]) {
    if (!user) continue;
    try {
      const notification = await Notification.create({
        ...notificationPayload,
        recipient_id: user,
        sender_id: senderId
      });

      const formatted = formatNotification(notification);
      io.to(`user:${user}`).emit('booking_status_update_alert', formatted);
    } catch (err) {
      logger.error(`[PoojaSocket] Failed to notify booking status to userId=${user}:`, err);
    }
  }
}



module.exports = {
  registerPoojaSocketManager,
  emitPoojaBookingToAdmins,
  emitPoojaCancellationToAdmins,
  emitAstrologerAssigned,
  emitBookingStatusUpdate
};
