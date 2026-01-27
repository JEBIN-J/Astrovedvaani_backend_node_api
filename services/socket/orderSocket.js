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

function registerOrderSocketManager(socketManager) {
  io = socketManager.io;
  getOnlineAdmins = () => Array.from(socketManager.onlineAdmins || []);
  logger.info('[OrderSocket] Order Socket Manager registered');
}

async function getAdminUserId() {
  if (globalAdminUserId) return globalAdminUserId;

  const admin = await User.findOne({
    role: Enums.USER.ROLE.ADMIN,
    isActive: true
  }).select('_id').lean();

  if (!admin) throw new Error('No admin user found in the system');

  globalAdminUserId = admin._id;
  return globalAdminUserId;
}

/**
 * Notify admin when a new order is placed
 */
async function emitNewOrderToAdmins({ userId, orderId, productName, quantity }) {
  if (!io || !getOnlineAdmins) {
    logger.warn('[OrderSocket] SocketManager not initialized');
    return;
  }

  const message = `New Order Placed: ${productName} (Qty: ${quantity})`;

  try {
    const adminId = await getAdminUserId();

    const notification = await Notification.create({
      recipient_id: adminId,
      sender_id: userId,
      type: Enums.NOTIFICATION.NOTIFICATION_TYPE.ORDER_RECIEVED,
      title: 'New Order',
      message,
      related_entity: {
        entity_type: 'Order',
        entity_id: orderId
      }
    });

    const formatted = formatNotification(notification);
    io.to('admins').emit('order_placed_alert', formatted);
  } catch (err) {
    logger.error('[OrderSocket] Failed to notify admin of new order:', err);
  }
}

/**
 * Notify user when their order status is updated
 */
async function emitOrderStatusUpdateToUser({ orderId, userId, status }) {
  if (!io) {
    logger.warn('[OrderSocket] SocketManager not initialized for status update');
    return;
  }

  const message = `Your order status has been updated to "${status}"`;

  try {
    const senderId = await getAdminUserId();

    const notification = await Notification.create({
      recipient_id: userId,
      sender_id: senderId,
      type: Enums.NOTIFICATION.NOTIFICATION_TYPE.ORDER_STATUS_UPDATED,
      title: 'Order Status Updated',
      message,
      related_entity: {
        entity_type: 'Order',
        entity_id: orderId
      }
    });

    const formatted = formatNotification(notification);
    io.to(`user:${userId}`).emit('order_status_update_alert', formatted);
  } catch (err) {
    logger.error(`[OrderSocket] Failed to emit order status to userId=${userId}:`, err);
  }
}

module.exports = {
  registerOrderSocketManager,
  emitNewOrderToAdmins,
  emitOrderStatusUpdateToUser,
  setGlobalAdminUserId
};
